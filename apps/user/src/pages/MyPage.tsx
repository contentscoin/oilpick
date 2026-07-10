import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { colors, gray, radius, surface } from "@oilpick/ui";
import { useSession } from "../hooks/useSession";
import { useProfile } from "../hooks/useProfile";
import { supabase } from "../lib/supabaseClient";

const NOTIFY_PREF_KEY = "oilpick:notify-enabled";

/**
 * U13 마이. 03-frontend.md 작업 지시: "매장정보, 알림설정(로컬 토글이면 충분), 약관 placeholder,
 * 고객센터 placeholder". 06-enhancement-plan.md E1: 탭바는 레이아웃(AppShell)이 제공하므로 이
 * 화면은 UserShell로 감싸지 않는다. E4: 매장정보 카드에 [수정](/my/edit) 진입점 추가.
 */
export function MyPage() {
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: profile, isLoading: profileLoading } = useProfile(userId);

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
        data-testid="store-info-card"
        style={{ borderRadius: radius.card, padding: 16, backgroundColor: surface.card, border: `1px solid ${surface.border}` }}
      >
        {profileLoading ? (
          // 프로필 로딩 중 "매장 정보 없음" 플래시 방지 스켈레톤 블록.
          <div data-testid="profile-skeleton" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ height: 18, width: "45%", borderRadius: 6, backgroundColor: gray[100] }} />
            <div style={{ height: 14, width: "30%", borderRadius: 6, backgroundColor: gray[100] }} />
            <div style={{ height: 14, width: "70%", borderRadius: 6, backgroundColor: gray[100] }} />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{profile?.storeName || "매장 정보 없음"}</p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }}>{profile?.displayName}</p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.status.wait }}>{profile?.address}</p>
            </div>
            <Link
              to="/my/edit"
              data-testid="edit-profile-link"
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                minHeight: 36,
                padding: "0 14px",
                borderRadius: radius.button,
                border: `1.5px solid ${colors.primary.DEFAULT}`,
                color: colors.primary.DEFAULT,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              수정
            </Link>
          </div>
        )}
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
        <Link
          to="/support"
          data-testid="support-link"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 48, padding: "0 4px", fontSize: 15, color: "inherit", textDecoration: "none" }}
        >
          <span>고객센터</span>
          <span style={{ color: colors.status.wait }}>&gt;</span>
        </Link>
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
