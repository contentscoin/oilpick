import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { colors, radius, surface } from "@oilpick/ui";
import { useSession } from "../hooks/useSession";
import { useRiderProfile } from "../hooks/useRiderProfile";
import { supabase } from "../lib/supabaseClient";

const NOTIFY_PREF_KEY = "oilpick:notify-enabled";

/**
 * R12 마이. apps/user/src/pages/MyPage.tsx와 동일 구성(매장정보 대신 라이더 정보,
 * 알림설정 로컬 토글, 약관/고객센터 placeholder) — 03-frontend.md 작업 지시:
 * "/notifications, /my: apps/user와 동일 패턴".
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
        style={{ borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}` }}
      >
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{profile?.displayName ?? ""}</p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }}>{profile?.vehicleNumber ?? ""}</p>
        <button
          type="button"
          data-testid="badge-link"
          onClick={() => navigate("/badge")}
          style={{ marginTop: 12, background: "none", border: "none", color: colors.primary.DEFAULT, fontWeight: 600, cursor: "pointer", padding: 0 }}
        >
          인증 카드 보기 &gt;
        </button>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <button
          type="button"
          data-testid="notify-toggle"
          onClick={toggleNotify}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: 48,
            padding: "0 4px",
            background: "none",
            border: "none",
            borderBottom: `1px solid ${surface.border}`,
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          <span>알림 받기</span>
          <span style={{ fontWeight: 700, color: notifyEnabled ? colors.primary.DEFAULT : colors.status.wait }}>
            {notifyEnabled ? "켜짐" : "꺼짐"}
          </span>
        </button>
        <div
          data-testid="terms-placeholder"
          style={{ display: "flex", alignItems: "center", minHeight: 48, padding: "0 4px", borderBottom: `1px solid ${surface.border}`, fontSize: 15, color: colors.status.wait }}
        >
          이용약관 · 개인정보처리방침 (준비 중)
        </div>
        <div
          data-testid="support-placeholder"
          style={{ display: "flex", alignItems: "center", minHeight: 48, padding: "0 4px", fontSize: 15, color: colors.status.wait }}
        >
          고객센터 (준비 중)
        </div>
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
