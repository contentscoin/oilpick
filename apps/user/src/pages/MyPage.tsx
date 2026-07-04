import { useEffect, useState } from "react";
import { colors, radius } from "@oilpick/ui";
import { useSession } from "../hooks/useSession";
import { useProfile } from "../hooks/useProfile";
import { UserShell } from "../components/UserShell";
import { supabase } from "../lib/supabaseClient";

const NOTIFY_PREF_KEY = "oilpick:notify-enabled";

/**
 * U13 마이. 03-frontend.md 작업 지시: "매장정보, 알림설정(로컬 토글이면 충분), 약관 placeholder,
 * 고객센터 placeholder".
 */
export function MyPage() {
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: profile } = useProfile(userId);

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
    <UserShell>
      <main style={{ display: "flex", flexDirection: "column", gap: 20, padding: 20, maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>마이</h1>

        <section
          data-testid="store-info-card"
          style={{ borderRadius: radius.card, padding: 16, backgroundColor: "#fff", border: "1px solid #e4e4e7" }}
        >
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{profile?.storeName || "매장 정보 없음"}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }}>{profile?.displayName}</p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }}>{profile?.address}</p>
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
              borderBottom: "1px solid #f4f4f5",
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
            style={{ display: "flex", alignItems: "center", minHeight: 48, padding: "0 4px", borderBottom: "1px solid #f4f4f5", fontSize: 15, color: colors.status.wait }}
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
    </UserShell>
  );
}
