// 푸시 발송 헬퍼. 02-api.md "푸시 발송 헬퍼" 절:
// "sendPush(userIds[], title, body, link): profiles.fcm_token 조회 → FCM HTTP v1 멀티캐스트
//  + notifications insert. 토큰 만료(UNREGISTERED) 시 fcm_token null 처리."
// "FCM 서비스 계정 키는 Supabase secrets FCM_SERVICE_ACCOUNT."
//
// 이 개발 환경에는 FCM 서비스 계정 자격증명이 없다(태스크 지시사항). push 발송 실패/시크릿
// 누락이 핵심 로직(상태 전이, 포인트 지급)을 막아서는 안 되므로 반드시 catch해서 로그만
// 남기고 넘어간다 — docs/spec/04-tasks.md "질문 목록"에 임시 동작으로 기록됨.

import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldNotify } from "./notifyDedupe.ts";

interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

async function getAccessToken(serviceAccount: FcmServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: nowSec + 3600,
    iat: nowSec,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsigned = `${enc(header)}.${enc(claim)}`;

  const pem = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const encodedSig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const jwt = `${unsigned}.${encodedSig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`FCM OAuth 토큰 발급 실패: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function sendFcmMessage(
  serviceAccount: FcmServiceAccount,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  link?: string,
  type?: string,
): Promise<{ ok: true } | { ok: false; unregistered: boolean }> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: link || type ? { ...(link ? { link } : {}), ...(type ? { type } : {}) } : undefined,
        },
      }),
    },
  );

  if (res.ok) {
    return { ok: true };
  }

  const text = await res.text();
  const unregistered = text.includes("UNREGISTERED") || res.status === 404;
  console.error(`FCM 발송 실패 (token=${token.slice(0, 8)}...): ${res.status} ${text}`);
  return { ok: false, unregistered };
}

/**
 * userIds에게 푸시 발송 + notifications 테이블 기록.
 * FCM 발송이 실패하거나 서비스 계정 시크릿이 없어도 예외를 던지지 않는다 —
 * 핵심 로직(상태 전이/포인트 지급)을 막지 않기 위해 반드시 catch해서 로그만 남긴다.
 * type은 클라이언트 foreground 분류용 FCM data 필드(06 E3 — "NEW_CALL"만 콜 배너 발화.
 * link만으로는 신규 콜과 완료/취소 푸시를 구분할 수 없다 — 모두 /orders/:id).
 */
export async function sendPush(
  admin: SupabaseClient,
  userIds: string[],
  title: string,
  body: string,
  link?: string,
  type?: string,
  kind?: string,
): Promise<void> {
  if (userIds.length === 0) return;

  // notifications 테이블 기록은 FCM 발송 성패와 무관하게 항상 남긴다(알림함 표시용).
  // kind는 [16 L2] 알림 분류(core NOTIFY_KIND) — sendPushDeduped의 dedupe 판정 키. 미지정=null(비분류).
  try {
    const rows = userIds.map((userId) => ({
      user_id: userId,
      title,
      body,
      link: link ?? null,
      kind: kind ?? null,
    }));
    const { error } = await admin.from("notifications").insert(rows);
    if (error) {
      console.error("notifications insert 실패", error);
    }
  } catch (err) {
    console.error("notifications insert 중 예외", err);
  }

  // FCM 실제 발송 시도. 서비스 계정 시크릿 누락/발송 실패는 catch해서 로그만 남긴다.
  try {
    const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
    if (!raw) {
      console.warn(
        "FCM_SERVICE_ACCOUNT 시크릿이 설정되지 않아 실제 푸시 발송을 건너뜁니다 " +
          "(notifications 기록은 완료). docs/spec/04-tasks.md 질문 목록 참고.",
      );
      return;
    }
    const serviceAccount = JSON.parse(raw) as FcmServiceAccount;

    const { data: profiles, error: profileErr } = await admin
      .from("profiles")
      .select("id, fcm_token")
      .in("id", userIds)
      .not("fcm_token", "is", null);
    if (profileErr) {
      console.error("fcm_token 조회 실패", profileErr);
      return;
    }
    if (!profiles || profiles.length === 0) return;

    const accessToken = await getAccessToken(serviceAccount);
    const staleTokenUserIds: string[] = [];

    await Promise.all(
      profiles.map(async (p: { id: string; fcm_token: string }) => {
        const result = await sendFcmMessage(
          serviceAccount,
          accessToken,
          p.fcm_token,
          title,
          body,
          link,
          type,
        );
        if (!result.ok && result.unregistered) {
          staleTokenUserIds.push(p.id);
        }
      }),
    );

    if (staleTokenUserIds.length > 0) {
      const { error: clearErr } = await admin
        .from("profiles")
        .update({ fcm_token: null })
        .in("id", staleTokenUserIds);
      if (clearErr) {
        console.error("만료된 fcm_token 초기화 실패", clearErr);
      }
    }
  } catch (err) {
    // FCM 서비스 계정 자격증명이 이 개발 환경에 없다 — 실패는 로그만 남기고 핵심 로직을 막지 않는다.
    console.error("푸시 발송 중 예외 발생 (핵심 로직에는 영향 없음)", err);
  }
}

/**
 * [16 L2] dedupe 게이트를 거치는 단일 수신자 발송. 알림 계층의 유일한 dedupe 판정 지점 —
 * 리마인드(L5)·정산 워치(L8) 등 반복 발화 가능성이 있는 알림은 전부 이 함수를 쓴다
 * (EF마다 "최근 발송 조회"를 재발명하지 말 것, 16 §2 L-D2).
 *
 * 판정 키는 (user_id, kind, link) — 같은 키의 알림이 windowMs 안에 이미 있으면 발송·기록 모두
 * 스킵하고 false를 반환한다. 판정 실패(조회 에러)는 발송 허용으로 폴백 — dedupe는 스팸 방지
 * 장치일 뿐, 조회 장애가 알림 자체를 막아서는 안 된다(sendPush의 "핵심 로직을 막지 않는다"와
 * 같은 원칙). 반환값은 "이번 호출이 발송을 시도했는가"이며 FCM 성패와는 무관.
 */
export async function sendPushDeduped(
  admin: SupabaseClient,
  opts: {
    userId: string;
    kind: string;
    title: string;
    body: string;
    link?: string;
    type?: string;
    windowMs: number;
  },
): Promise<boolean> {
  const { userId, kind, title, body, link, type, windowMs } = opts;
  try {
    let query = admin
      .from("notifications")
      .select("created_at")
      .eq("user_id", userId)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1);
    query = link === undefined ? query.is("link", null) : query.eq("link", link);
    const { data, error } = await query;
    if (error) {
      console.error("sendPushDeduped: 최근 발송 조회 실패 — 발송 허용으로 폴백", error);
    } else if (!shouldNotify(data ?? [], windowMs, new Date())) {
      return false;
    }
  } catch (err) {
    console.error("sendPushDeduped: 판정 중 예외 — 발송 허용으로 폴백", err);
  }

  await sendPush(admin, [userId], title, body, link, type, kind);
  return true;
}
