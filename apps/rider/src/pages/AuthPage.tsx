import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BigButton, PhotoUploader, colors, inputClassName, inputStyle, type PhotoAsset } from "@oilpick/ui";
import { isValidKrMobilePhone, toE164Kr } from "@oilpick/core";
import { supabase } from "../lib/supabaseClient";

/**
 * R1 `/auth`, `/verify`: "전화 OTP 가입(apps/user와 동일 방식 재사용) → 서류 3종(사업자등록증,
 * 차량, 폐기물 수집운반 허가는 선택) 업로드(rider-docs Storage 버킷) → PENDING 대기 화면"
 * (03-frontend.md apps/rider 표).
 *
 * OTP 흐름은 apps/user/src/pages/AuthPage.tsx와 동일(같은 supabase.auth.signInWithOtp/verifyOtp,
 * toE164Kr 변환). 신규 가입자는 PHONE → CODE → DOCS(서류 3종 업로드 + 차량번호/사업자번호 입력)
 * 단계를 거쳐 rider_profiles를 PENDING으로 생성한 뒤 /verify로 이동한다.
 */

type Step = "PHONE" | "CODE" | "DOCS";

export function AuthPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("PHONE");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [bizNumber, setBizNumber] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [bizDoc, setBizDoc] = useState<PhotoAsset[]>([]);
  const [vehicleDoc, setVehicleDoc] = useState<PhotoAsset[]>([]);
  const [permitDoc, setPermitDoc] = useState<PhotoAsset[]>([]);

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
      setError(otpError.message);
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
      setError(verifyError?.message ?? "인증에 실패했어요.");
      return;
    }

    // 기존 가입자인지 확인 — rider_profiles row가 이미 있으면 상태에 따라 이동, 없으면 서류 제출 단계로.
    const { data: existingRider } = await supabase
      .from("rider_profiles")
      .select("verify_status")
      .eq("id", data.user.id)
      .maybeSingle();

    if (existingRider) {
      navigate(existingRider.verify_status === "APPROVED" ? "/" : "/verify", { replace: true });
      return;
    }
    setStep("DOCS");
  }

  async function uploadDoc(userId: string, asset: PhotoAsset, label: string): Promise<string> {
    const ext = asset.file instanceof File ? asset.file.name.split(".").pop() : "jpg";
    const path = `${userId}/${label}-${Date.now()}.${ext ?? "jpg"}`;
    const { error: uploadError } = await supabase.storage.from("rider-docs").upload(path, asset.file, {
      upsert: true,
    });
    if (uploadError) throw uploadError;
    return path;
  }

  async function handleSubmitDocs(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!displayName.trim() || !bizNumber.trim() || !vehicleNumber.trim()) {
      setError("입력값을 확인해주세요.");
      return;
    }
    if (bizDoc.length === 0 || vehicleDoc.length === 0) {
      setError("사업자등록증과 차량 사진은 필수예요.");
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

    try {
      const [bizDocPath, vehicleDocPath, permitDocPath] = await Promise.all([
        uploadDoc(uid, bizDoc[0] as PhotoAsset, "biz"),
        uploadDoc(uid, vehicleDoc[0] as PhotoAsset, "vehicle"),
        permitDoc[0] ? uploadDoc(uid, permitDoc[0], "permit") : Promise.resolve(null),
      ]);

      // CLAUDE.md 절대 규칙 3: 이 insert는 anon 클라이언트(RLS p_profiles_insert/p_rider_self가
      // 본인 행 생성만 허용)로 수행된다 — service_role 키는 여기서 절대 쓰지 않는다.
      const { error: profileError } = await supabase.from("profiles").insert({
        id: uid,
        role: "rider",
        phone,
        display_name: displayName.trim(),
      });
      if (profileError) throw profileError;

      const { error: riderError } = await supabase.from("rider_profiles").insert({
        id: uid,
        biz_number: bizNumber.trim(),
        vehicle_number: vehicleNumber.trim(),
        doc_biz_url: bizDocPath,
        doc_vehicle_url: vehicleDocPath,
        doc_permit_url: permitDocPath,
      });
      if (riderError) throw riderError;

      navigate("/verify", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입 처리 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
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
        {step === "DOCS" ? "라이더 가입 서류 제출" : "휴대폰 번호로 시작하기"}
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

      {step === "DOCS" && (
        <form onSubmit={handleSubmitDocs} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="display-name-input" style={{ fontSize: 14, fontWeight: 600 }}>
              라이더 이름
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
            <label htmlFor="biz-number-input" style={{ fontSize: 14, fontWeight: 600 }}>
              사업자등록번호
            </label>
            <input
              id="biz-number-input"
              data-testid="biz-number-input"
              type="text"
              required
              placeholder="000-00-00000"
              value={bizNumber}
              onChange={(e) => setBizNumber(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="vehicle-number-input" style={{ fontSize: 14, fontWeight: 600 }}>
              차량번호
            </label>
            <input
              id="vehicle-number-input"
              data-testid="vehicle-number-input"
              type="text"
              required
              placeholder="12가 3456"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>사업자등록증 (필수)</span>
            <PhotoUploader photos={bizDoc} onChange={setBizDoc} maxCount={1} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>차량 사진 (필수)</span>
            <PhotoUploader photos={vehicleDoc} onChange={setVehicleDoc} maxCount={1} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>폐기물 수집·운반 허가증 (선택)</span>
            <PhotoUploader photos={permitDoc} onChange={setPermitDoc} maxCount={1} />
          </div>

          <BigButton type="submit" loading={loading} data-testid="submit-docs-button">
            제출하고 심사 요청하기
          </BigButton>
        </form>
      )}
    </main>
  );
}
