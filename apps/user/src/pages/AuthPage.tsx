import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BigButton, colors, inputClassName, inputStyle } from "@oilpick/ui";
import { humanizeSupabaseError, isValidKrMobilePhone, supplierSignupInputSchema, toE164Kr } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";
import { AddressField, type AddressValue } from "../components/AddressField";

/**
 * U2 가입/로그인. 03-frontend.md: "Supabase 전화 OTP → profiles+supplier_profiles 생성.
 * 주소는 카카오 주소검색 → 지도핀 미세조정 → lat/lng 저장".
 *
 * 로컬 개발 환경에는 실 SMS 프로바이더가 없다(04-tasks.md 질문 목록). supabase/config.toml의
 * [auth.sms.test_otp]로 등록된 전화번호는 실제 문자 발송 없이 고정 코드(123456)로 검증되지만,
 * signInWithOtp/verifyOtp 호출 흐름 자체는 프로덕션과 동일하다 — 실제 SMS 프로바이더로
 * 교체해도 이 화면의 코드 변경은 필요 없다.
 *
 * 단계: PHONE(전화번호 입력) → CODE(OTP 확인) → PROFILE(신규 가입자만, 상호/사업자번호/주소
 * 입력 후 profiles+supplier_profiles insert) → 완료 시 "/"로 이동.
 */

type Step = "PHONE" | "CODE" | "PROFILE";

/** 기본 위/경도: 카카오 주소검색 키가 없을 때의 기본값(집하장 인근, 서울 강서구). */
const DEFAULT_ADDRESS: AddressValue = {
  address: "",
  lat: 37.5509,
  lng: 126.8225,
};

export function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [bizNumber, setBizNumber] = useState("");
  const [addressValue, setAddressValue] = useState<AddressValue>(DEFAULT_ADDRESS);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidKrMobilePhone(phone)) {
      setError("올바른 휴대폰 번호를 입력해주세요.");
      return;
    }
    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: toE164Kr(phone),
    });
    setLoading(false);
    if (otpError) {
      setError(humanizeSupabaseError(otpError));
      return;
    }
    setStep("CODE");
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: toE164Kr(phone),
      token: code,
      type: "sms",
    });
    setLoading(false);
    if (verifyError || !data.user) {
      setError(humanizeSupabaseError(verifyError, "인증에 실패했어요."));
      return;
    }

    // 기존 가입자인지 확인 — profiles row가 이미 있으면 홈으로, 없으면 프로필 생성 단계로.
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();

    if (existingProfile) {
      navigate("/", { replace: true });
      return;
    }
    setStep("PROFILE");
  }

  async function handleCreateProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = supplierSignupInputSchema.safeParse({
      displayName,
      storeName,
      bizNumber,
      address: addressValue.address,
      lat: addressValue.lat,
      lng: addressValue.lng,
    });
    if (!parsed.success) {
      setError("입력값을 확인해주세요.");
      return;
    }

    setLoading(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setLoading(false);
      setError("로그인이 만료됐어요. 처음부터 다시 시도해주세요.");
      setStep("PHONE");
      return;
    }
    const uid = userData.user.id;

    // CLAUDE.md 절대 규칙 3: 이 insert는 anon 클라이언트(RLS p_profiles_insert/p_sup_self가
    // 본인 행 생성만 허용)로 수행된다 — service_role 키는 여기서 절대 쓰지 않는다.
    const { error: profileError } = await supabase.from("profiles").insert({
      id: uid,
      role: "supplier",
      phone,
      display_name: parsed.data.displayName,
    });
    if (profileError) {
      setLoading(false);
      setError(humanizeSupabaseError(profileError));
      return;
    }

    const { error: supplierError } = await supabase.from("supplier_profiles").insert({
      id: uid,
      biz_number: parsed.data.bizNumber,
      store_name: parsed.data.storeName,
      address: parsed.data.address,
      location: `SRID=4326;POINT(${parsed.data.lng} ${parsed.data.lat})`,
    });
    setLoading(false);
    if (supplierError) {
      setError(humanizeSupabaseError(supplierError));
      return;
    }

    navigate("/", { replace: true });
  }

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        padding: 24,
        maxWidth: 420,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: 22, margin: "24px 0 0" }}>
        {step === "PROFILE" ? "매장 정보 입력" : "휴대폰 번호로 시작하기"}
      </h1>

      {error && (
        <p role="alert" data-testid="auth-error" style={{ color: colors.status.danger, fontSize: 14, margin: 0 }}>
          {error}
        </p>
      )}

      {step === "PHONE" && (
        <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="phone-input" style={{ fontSize: 14, fontWeight: 600 }}>
              휴대폰 번호
            </label>
            <input
              id="phone-input"
              data-testid="phone-input"
              type="tel"
              inputMode="numeric"
              required
              placeholder="010-1234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
          </div>
          <BigButton type="submit" loading={loading} data-testid="send-otp-button">
            인증번호 받기
          </BigButton>
        </form>
      )}

      {step === "CODE" && (
        <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="code-input" style={{ fontSize: 14, fontWeight: 600 }}>
              인증번호
            </label>
            <p style={{ margin: 0, fontSize: 13, color: colors.status.wait }}>
              {phone}로 전송된 6자리 코드를 입력해주세요.
            </p>
            <input
              id="code-input"
              data-testid="code-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputClassName}
              style={{ ...inputStyle, letterSpacing: 4 }}
            />
          </div>
          <BigButton type="submit" loading={loading} data-testid="verify-otp-button">
            확인
          </BigButton>
          <button
            type="button"
            data-testid="back-to-phone"
            onClick={() => setStep("PHONE")}
            style={{ background: "none", border: "none", color: colors.status.wait, fontSize: 14, cursor: "pointer" }}
          >
            번호 다시 입력
          </button>
        </form>
      )}

      {step === "PROFILE" && (
        <form onSubmit={handleCreateProfile} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="display-name-input" style={{ fontSize: 14, fontWeight: 600 }}>
              담당자 이름
            </label>
            <input
              id="display-name-input"
              data-testid="display-name-input"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="store-name-input" style={{ fontSize: 14, fontWeight: 600 }}>
              상호명
            </label>
            <input
              id="store-name-input"
              data-testid="store-name-input"
              type="text"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="biz-number-input" style={{ fontSize: 14, fontWeight: 600 }}>
              사업자등록번호
            </label>
            <input
              id="biz-number-input"
              data-testid="biz-number-input"
              type="text"
              inputMode="numeric"
              required
              placeholder="000-00-00000"
              value={bizNumber}
              onChange={(e) => setBizNumber(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
          </div>
          <AddressField value={addressValue} onChange={setAddressValue} />
          <BigButton type="submit" loading={loading} data-testid="create-profile-button">
            가입 완료
          </BigButton>
        </form>
      )}
    </main>
  );
}
