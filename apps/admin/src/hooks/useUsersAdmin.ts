import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrderStatus, UserUpdateInput, UserUpdateOutput } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { queryKeys } from "../lib/queryClient";
import { invokeEdgeFunction } from "../lib/edgeFunction";
import { fetchDisplayNameMap } from "../lib/adminQueries";

export interface AdminSupplierRow {
  id: string;
  displayName: string;
  storeName: string;
  bizNumber: string;
  address: string;
  phone: string;
  createdAt: string;
}

/**
 * 03-frontend.md apps/admin "/users": "supplier/rider 탭".
 * profiles(display_name/phone)와 supplier_profiles는 별도 조회 후 Map으로 join한다
 * (useOrdersAdmin.ts fetchNameMaps와 동일 이유 — PostgREST 임베드가 요구하는 FK 제약 이름을
 * 가정하지 않기 위함).
 */
export function useAdminSuppliers() {
  return useQuery({
    queryKey: queryKeys.suppliers(),
    queryFn: async (): Promise<AdminSupplierRow[]> => {
      const [{ data, error }, { data: profileRows, error: profileErr }] = await Promise.all([
        supabase
          .from("supplier_profiles")
          .select("id, store_name, biz_number, address, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, display_name, phone").eq("role", "supplier"),
      ]);
      if (error) throw error;
      if (profileErr) throw profileErr;
      const profileMap = new Map((profileRows ?? []).map((p) => [p.id as string, p]));
      return (data ?? []).map((row) => {
        const profile = profileMap.get(row.id) as { display_name: string; phone: string } | undefined;
        return {
          id: row.id,
          displayName: profile?.display_name ?? "-",
          storeName: row.store_name,
          bizNumber: row.biz_number,
          address: row.address,
          phone: profile?.phone ?? "-",
          createdAt: row.created_at,
        };
      });
    },
  });
}

export interface AdminRiderRow {
  id: string;
  displayName: string;
  phone: string;
  bizNumber: string;
  vehicleNumber: string;
  verifyStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  rejectReason: string | null;
  docBizUrl: string | null;
  docVehicleUrl: string | null;
  docPermitUrl: string | null;
  recyclerName: string | null;
  recyclerContact: string | null;
  isOnline: boolean;
  createdAt: string;
  /** [19 T4] 소속 좌상(13 I1) — 회원 관리에서 조직 귀속을 못 보던 누락 연결. */
  dealerId: string | null;
  dealerName: string | null;
  /** [19 T4] 개인 지급 한도(18 R2). null=미배분(PER_RIDER 모드에선 0 취급). */
  creditLimit: number | null;
}

/** rider PENDING 큐 포함 전체 라이더 목록. statusFilter: 'ALL' | verify_status. */
export function useAdminRiders(statusFilter: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.riders(statusFilter),
    queryFn: async (): Promise<AdminRiderRow[]> => {
      let q = supabase
        .from("rider_profiles")
        // [19 T4] dealer_id·credit_limit 추가 — 회원 관리에서 소속·한도를 함께 본다.
        .select(
          "id, biz_number, vehicle_number, verify_status, reject_reason, doc_biz_url, doc_vehicle_url, doc_permit_url, recycler_name, recycler_contact, is_online, created_at, dealer_id, credit_limit",
        )
        .order("created_at", { ascending: false });
      if (statusFilter !== "ALL") {
        q = q.eq("verify_status", statusFilter);
      }
      const [{ data, error }, { data: profileRows, error: profileErr }] = await Promise.all([
        q,
        supabase.from("profiles").select("id, display_name, phone").eq("role", "rider"),
      ]);
      if (error) throw error;
      if (profileErr) throw profileErr;
      const profileMap = new Map((profileRows ?? []).map((p) => [p.id as string, p]));
      // 좌상 표시명은 rider profiles와 role이 달라 위 조회에 안 잡힌다 — 별도 배치로 붙인다.
      const dealerNames = await fetchDisplayNameMap(
        (data ?? []).map((r) => r.dealer_id as string | null).filter((v): v is string => Boolean(v)),
      );
      return (data ?? []).map((row) => {
        const profile = profileMap.get(row.id) as { display_name: string; phone: string } | undefined;
        return {
          id: row.id,
          displayName: profile?.display_name ?? row.id.slice(0, 8),
          phone: profile?.phone ?? "-",
          bizNumber: row.biz_number,
          vehicleNumber: row.vehicle_number,
          verifyStatus: row.verify_status,
          rejectReason: row.reject_reason,
          docBizUrl: row.doc_biz_url,
          docVehicleUrl: row.doc_vehicle_url,
          docPermitUrl: row.doc_permit_url,
          recyclerName: row.recycler_name,
          recyclerContact: row.recycler_contact,
          isOnline: row.is_online,
          createdAt: row.created_at,
          dealerId: (row.dealer_id as string | null) ?? null,
          dealerName: row.dealer_id ? (dealerNames.get(row.dealer_id as string) ?? null) : null,
          creditLimit: (row.credit_limit as number | null) ?? null,
        };
      });
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_rider_profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "rider_profiles" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "users", "riders"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

/** rider-docs 버킷은 private — 서명 URL로만 열람 가능(admin은 RLS p_rider_docs_read로 read 허용). */
export async function createRiderDocSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("rider-docs").createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

// ===== [17 Q4] 수거쿠폰 복권 — 라이더탭 쿠폰 운영 훅(07 F10-② 원형 복원 + 환불 대상 조회 추가) =====

/**
 * 전 라이더 쿠폰 잔액(v_coupon_balance). admin은 is_admin() RLS로 전체 행 read 가능
 * (17 C4 — 잔액은 뷰로만 조회, 절대 규칙 1). rider_id → balance Map으로 라이더 목록에 join한다.
 * coupon_ledger INSERT(충전/소진/환급/조정) 시 Realtime으로 무효화.
 */
export function useCouponBalances() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.couponBalances(),
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase.from("v_coupon_balance").select("rider_id, balance");
      if (error) throw error;
      return new Map((data ?? []).map((row) => [row.rider_id as string, Number(row.balance ?? 0)]));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_coupon_balances")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "coupon_ledger" }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.couponBalances() });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export interface RiderCouponLedgerRow {
  id: number;
  entryType: "CHARGE" | "CONSUME" | "REFUND" | "ADJUST";
  qty: number;
  memo: string | null;
  createdAt: string;
}

/** 라이더별 쿠폰 충전/조정 이력(coupon_ledger 최근 50건). 패널 이력 토글에서 펼쳐 확인. */
export function useRiderCouponLedger(riderId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.riderCouponLedger(riderId ?? ""),
    enabled: Boolean(riderId) && enabled,
    queryFn: async (): Promise<RiderCouponLedgerRow[]> => {
      if (!riderId) return [];
      const { data, error } = await supabase
        .from("coupon_ledger")
        .select("id, entry_type, qty, memo, created_at")
        .eq("rider_id", riderId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        entryType: row.entry_type,
        qty: row.qty,
        memo: row.memo,
        createdAt: row.created_at,
      }));
    },
  });
}

export interface RiderCouponPurchaseRow {
  id: string;
  qty: number;
  unitPrice: number;
  amount: number;
  pgOrderId: string;
  createdAt: string;
  paidAt: string | null;
}

/**
 * 라이더별 환불 가능 구매 목록 — coupon_purchases 중 status='PAID'만(coupon-refund 대상, 건당 1회).
 * REFUNDED/PENDING 등은 환불 불가라 목록에서 제외한다(17 C4 — PG 환불은 purchase_id 있는 ADJUST).
 */
export function useRiderCouponPurchases(riderId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.riderCouponPurchases(riderId ?? ""),
    enabled: Boolean(riderId) && enabled,
    queryFn: async (): Promise<RiderCouponPurchaseRow[]> => {
      if (!riderId) return [];
      const { data, error } = await supabase
        .from("coupon_purchases")
        .select("id, qty, unit_price, amount, pg_order_id, created_at, paid_at")
        .eq("rider_id", riderId)
        .eq("status", "PAID")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        qty: row.qty,
        unitPrice: row.unit_price,
        amount: row.amount,
        pgOrderId: row.pg_order_id,
        createdAt: row.created_at,
        paidAt: row.paid_at,
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_rider_coupon_purchases")
      .on("postgres_changes", { event: "*", schema: "public", table: "coupon_purchases" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "users", "couponPurchases"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

// ===== [19 T4] 회원 상세·정보수정 — docs/spec/19-admin-console.md §1 T4 =====

/**
 * 전 공급업체 포인트 잔액(v_point_balance). admin은 point_ledger RLS(p_ledger_read: 본인 또는
 * admin) 위에서 invoker 뷰로 전체 행을 읽는다 — 잔액은 뷰로만 조회(절대 규칙 1).
 */
export function usePointBalances() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "users", "pointBalances"],
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase.from("v_point_balance").select("user_id, available");
      if (error) throw error;
      return new Map((data ?? []).map((row) => [row.user_id as string, Number(row.available ?? 0)]));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin_point_balances")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "point_ledger" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "users", "pointBalances"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

/**
 * 라이더별 크레딧 현황(v_rider_credit — 18 R6). admin은 뷰 본문 술어의 is_admin() 분기로 전체.
 * 회원 관리 라이더 상세에서 "배분 한도 / 사용 / 잔여"를 좌상 콘솔과 같은 값으로 보여준다.
 */
export interface RiderCreditRow {
  limitAmount: number | null;
  used: number;
  available: number | null;
  isUnlimited: boolean;
  allocationMode: "POOL" | "PER_RIDER";
}

export function useRiderCredits() {
  return useQuery({
    queryKey: ["admin", "users", "riderCredits"],
    queryFn: async (): Promise<Map<string, RiderCreditRow>> => {
      const { data, error } = await supabase
        .from("v_rider_credit")
        .select("rider_id, limit_amount, used, available, is_unlimited, allocation_mode");
      if (error) throw error;
      return new Map(
        (data ?? []).map((r) => [
          r.rider_id as string,
          {
            limitAmount: (r.limit_amount as number | null) ?? null,
            used: Number(r.used ?? 0),
            available: (r.available as number | null) ?? null,
            isUnlimited: Boolean(r.is_unlimited),
            allocationMode: ((r.allocation_mode as "POOL" | "PER_RIDER") ?? "POOL"),
          },
        ]),
      );
    },
  });
}

export interface UserOrderRow {
  id: string;
  status: OrderStatus;
  finalKg: number | null;
  requestedKg: number;
  payoutMethod: "CASH" | "POINT" | null;
  cashPaidAmount: number | null;
  netAmount: number | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * 회원 1명의 최근 주문(기본 10건) — 공급업체는 supplier_id, 라이더는 rider_id 축.
 * 상세 드로어에서 "이 회원이 실제로 무엇을 했는가"를 화면 안에서 닫기 위한 최소 연결.
 */
export function useUserRecentOrders(userId: string | undefined, role: "supplier" | "rider", limit = 10) {
  return useQuery({
    queryKey: ["admin", "users", "orders", role, userId ?? "", limit],
    enabled: Boolean(userId),
    queryFn: async (): Promise<UserOrderRow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("pickup_orders")
        .select("id, status, requested_kg, final_kg, payout_method, cash_paid_amount, net_amount, created_at, completed_at")
        .eq(role === "supplier" ? "supplier_id" : "rider_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        status: r.status as OrderStatus,
        requestedKg: Number(r.requested_kg),
        finalKg: r.final_kg !== null ? Number(r.final_kg) : null,
        payoutMethod: (r.payout_method as "CASH" | "POINT" | null) ?? null,
        cashPaidAmount: r.cash_paid_amount !== null ? Number(r.cash_paid_amount) : null,
        netAmount: r.net_amount !== null ? Number(r.net_amount) : null,
        createdAt: r.created_at as string,
        completedAt: (r.completed_at as string | null) ?? null,
      }));
    },
  });
}

/**
 * 회원 정보수정 — user-update Edge(admin 전용, service_role). 클라이언트에서 profiles를 직접
 * update하지 않는다(p_profiles_update가 본인 한정이라 애초에 통하지도 않는다 — 19 §0).
 */
export function useUserMutations() {
  const queryClient = useQueryClient();

  async function updateUser(input: UserUpdateInput) {
    const result = await invokeEdgeFunction<UserUpdateOutput>("user-update", { ...input });
    if (result.ok) {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    }
    return result;
  }

  return { updateUser };
}
