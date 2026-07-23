import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { colors, elevation, radius, surface } from "@oilpick/ui";
import { useSession } from "../hooks/useSession";
import { useRiderProfile } from "../hooks/useRiderProfile";
import { supabase } from "../lib/supabaseClient";

const NOTIFY_PREF_KEY = "oilpick:notify-enabled";

/** 메뉴 카드 안 공통 행 스타일(터치 타깃 48px, 행 사이 구분선). */
const menuRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: 48,
  padding: "0 4px",
  background: "none",
  border: "none",
  borderBottom: `1px solid ${surface.border}`,
  fontSize: 15,
};

/**
 * R12 마이. apps/user/src/pages/MyPage.tsx와 동일 구성(매장정보 대신 라이더 정보,
 * 알림설정 로컬 토글, 약관/고객센터 placeholder) — 03-frontend.md 작업 지시:
 * "/notifications, /my: apps/user와 동일 패턴".
 *
 * 06 E12 — 섹션 카드화(surface.card + surface.border + elevation.card). 준비중 항목은
 * 회색 비활성 유지. 06 E9 — "/history" 진입점이 탭바에 없어(F6-⑤ 탭 구성 유지) 여기에
 * "운행 이력" 링크 항목을 추가한다.
 */
export function MyPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: profile } = useRiderProfile(userId);

  const [notifyEnabled, setNotifyEnabled] = useState(true);

  useEffect(() => {
    setNotifyEnabled(localStorage.getItem(NOTIFY_PREF_KEY) !== "0");
  }, []);

  function toggleNotify() {
    const next = !notifyEnabled;
    setNotifyEnabled(next);
    localStorage.setItem(NOTIFY_PREF_KEY, next ? "1" : "0");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: 0 }}>마이</h1>

      <section
        data-testid="rider-info-card"
        style={{ borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}`, boxShadow: elevation.card }}
      >
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{profile?.displayName ?? ""}</p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }}>{profile?.vehicleNumber ?? ""}</p>
        {/* 13 I5: 소속 좌상 상호(배정된 경우만). */}
        {profile?.dealerName && (
          <p data-testid="rider-dealer" style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }}>
            소속: {profile.dealerName}
          </p>
        )}
        <button
          type="button"
          data-testid="badge-link"
          onClick={() => navigate("/badge")}
          style={{ marginTop: 12, background: "none", border: "none", color: colors.primary.DEFAULT, fontWeight: 600, cursor: "pointer", padding: 0 }}
        >
          인증 카드 보기 &gt;
        </button>
      </section>

      <section
        data-testid="menu-card"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          borderRadius: radius.card,
          padding: "4px 12px",
          backgroundColor: surface.card,
          border: `1px solid ${surface.border}`,
          boxShadow: elevation.card,
        }}
      >
        {/* 06 E9 — 운행 이력 진입점(탭바에 없음 — F6-⑤ 탭 구성 유지라 여기서 진입). */}
        <button
          type="button"
          data-testid="history-link"
          onClick={() => navigate("/history")}
          style={{ ...menuRowStyle, cursor: "pointer", color: "inherit" }}
        >
          <span>운행 이력</span>
          <span style={{ color: colors.status.wait }}>&gt;</span>
        </button>
        {/* 09 H4 — 내 추천(코드·공유·실적) 진입점. */}
        <button
          type="button"
          data-testid="referrals-link"
          onClick={() => navigate("/referrals")}
          style={{ ...menuRowStyle, cursor: "pointer", color: "inherit" }}
        >
          <span>내 추천</span>
          <span style={{ color: colors.status.wait }}>&gt;</span>
        </button>
        <button
          type="button"
          data-testid="notify-toggle"
          onClick={toggleNotify}
          style={{ ...menuRowStyle, cursor: "pointer" }}
        >
          <span>알림 받기</span>
          <span style={{ fontWeight: 700, color: notifyEnabled ? colors.primary.DEFAULT : colors.status.wait }}>
            {notifyEnabled ? "켜짐" : "꺼짐"}
          </span>
        </button>
        <div
          data-testid="terms-placeholder"
          style={{ ...menuRowStyle, justifyContent: "flex-start", color: colors.status.wait }}
        >
          이용약관 · 개인정보처리방침 (준비 중)
        </div>
        <button
          type="button"
          data-testid="support-link"
          onClick={() => navigate("/support")}
          style={{ ...menuRowStyle, borderBottom: "none", cursor: "pointer", color: "inherit" }}
        >
          <span>고객센터</span>
          <span style={{ color: colors.status.wait }}>&gt;</span>
        </button>
      </section>

      <button
        type="button"
        data-testid="logout-button"
        onClick={handleLogout}
        style={{
          marginTop: 12,
          background: "none",
          border: "none",
          color: colors.status.danger,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
          alignSelf: "flex-start",
        }}
      >
        로그아웃
      </button>
    </main>
  );
}
