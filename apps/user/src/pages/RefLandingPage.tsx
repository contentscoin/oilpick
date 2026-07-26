import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BigButton, PayouSymbol, colors, elevation, gray, radius, surface, typeScale } from "@oilpick/ui";
import { REFERRAL_CODE_STORAGE_KEY, REFERRAL_SUPPLIER_BONUS, formatPoint, referralCodeSchema } from "@oilpick/core";
import { useSession } from "../hooks/useSession";

/**
 * [09 H3] 추천 랜딩 `/ref/:code`. 라이더 공유 링크(웹) 또는 커스텀 스킴(oilpick-user://ref/<code>,
 * deeplink.ts가 이 경로로 정규화)으로 진입한다. 미인증 상태로도 접근 가능해야 하므로 AuthGuard 밖에 둔다.
 *
 * 동작: 유효한 코드면 localStorage(REFERRAL_CODE_STORAGE_KEY)에 저장 → 가입 성공 직후 AuthPage가
 * best-effort로 referral-attach를 호출한다(09 H4). 화면은 보너스 안내 + 설치/시작 CTA만 담당하고
 * 원장·referrals 쓰기는 어디에도 없다(절대 규칙 1). 스토어 링크는 env 플레이스홀더(스코프 밖 인프라).
 */
export function RefLandingPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, loading } = useSession();

  // 코드 정규화·검증(Crockford base32 8자). 유효할 때만 저장한다. safeParse는 값싼 순수 계산이라 메모 불필요.
  const parsedCode = referralCodeSchema.safeParse(rawCode ?? "");
  const validCode = parsedCode.success ? parsedCode.data : null;

  useEffect(() => {
    if (validCode) {
      localStorage.setItem(REFERRAL_CODE_STORAGE_KEY, validCode);
    }
  }, [validCode]);

  const appStoreUrl = import.meta.env.VITE_APP_STORE_URL as string | undefined;
  const playStoreUrl = import.meta.env.VITE_PLAY_STORE_URL as string | undefined;

  // 이미 로그인한 사용자는 홈으로, 아니면 가입/로그인으로.
  function handleStart() {
    navigate(session ? "/" : "/auth");
  }

  return (
    <main
      data-testid="ref-landing-page"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        padding: 24,
        maxWidth: 460,
        margin: "0 auto",
        minHeight: "100vh",
        backgroundColor: surface.app,
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* 브랜드 로크업 — 폐유(payou) 로고(제리캔+P) + 영문 부제(10-brand.md B1~B3). */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <PayouSymbol size={64} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: typeScale.title, fontWeight: 800, color: colors.primary.dark }}>
              폐유 <span style={{ fontSize: typeScale.caption, fontWeight: 700, color: colors.accent.deep }}>payou</span>
            </span>
            <span data-testid="brand-tagline" style={{ fontSize: typeScale.caption, color: colors.status.wait }}>
              We pay you for used oil
            </span>
          </div>
        </div>
        <h1 style={{ fontSize: typeScale.headline, lineHeight: 1.25, margin: 0, fontWeight: 800 }}>
          폐식용유, 버리지 말고
          <br />
          현장에서 바로 정산받으세요
        </h1>
        <p style={{ margin: 0, fontSize: typeScale.body, color: colors.status.wait }}>
          라이더가 직접 방문해 무게를 재고, 그 자리에서 현금 또는 포인트로 지급해요.
        </p>
      </div>

      {/* 추천 보너스 하이라이트 카드 — 유효한 코드로 진입한 경우에만 노출. */}
      {validCode ? (
        <section
          data-testid="ref-bonus-card"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 20,
            borderRadius: radius.hero,
            backgroundColor: colors.accent.deep,
            color: "#fff",
            boxShadow: elevation.card,
          }}
        >
          <span style={{ fontSize: typeScale.caption, opacity: 0.9 }}>추천 코드 {validCode}</span>
          <strong style={{ fontSize: 22, fontWeight: 800 }}>
            첫 수거 완료 시 {formatPoint(REFERRAL_SUPPLIER_BONUS)} 적립
          </strong>
          <span style={{ fontSize: typeScale.caption, opacity: 0.9 }}>
            가입 후 첫 수거를 완료하면 추천 보너스가 지갑에 쌓여요(출금 가능).
          </span>
        </section>
      ) : (
        <section
          data-testid="ref-invalid-card"
          style={{
            padding: 16,
            borderRadius: radius.card,
            border: `1px solid ${surface.border}`,
            backgroundColor: surface.card,
            fontSize: typeScale.body,
            color: colors.status.wait,
          }}
        >
          추천 코드가 유효하지 않지만, 지금 바로 가입할 수 있어요.
        </section>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <BigButton data-testid="ref-start-button" onClick={handleStart} disabled={loading}>
          {session ? "홈으로 가기" : "가입하고 시작하기"}
        </BigButton>

        {/* 앱 미설치 사용자용 스토어 링크(env 플레이스홀더 — 미설정 시 노출하지 않는다). */}
        {(appStoreUrl || playStoreUrl) && (
          <div style={{ display: "flex", gap: 8 }}>
            {appStoreUrl && (
              <a
                data-testid="ref-appstore-link"
                href={appStoreUrl}
                style={{ flex: 1, textAlign: "center", padding: "12px 0", borderRadius: radius.button, border: `1px solid ${surface.border}`, color: gray[900], textDecoration: "none", fontSize: 14, fontWeight: 600 }}
              >
                App Store
              </a>
            )}
            {playStoreUrl && (
              <a
                data-testid="ref-playstore-link"
                href={playStoreUrl}
                style={{ flex: 1, textAlign: "center", padding: "12px 0", borderRadius: radius.button, border: `1px solid ${surface.border}`, color: gray[900], textDecoration: "none", fontSize: 14, fontWeight: 600 }}
              >
                Google Play
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
