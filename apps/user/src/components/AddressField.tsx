import { useState } from "react";
import { colors, inputClassName, inputStyle } from "@oilpick/ui";
import { KAKAO_KEY } from "../lib/env";

export interface AddressValue {
  address: string;
  lat: number;
  lng: number;
}

export interface AddressFieldProps {
  value: AddressValue;
  onChange: (value: AddressValue) => void;
}

/**
 * U2 가입 화면의 주소 입력. 03-frontend.md: "주소는 카카오 주소검색 → 지도핀 미세조정 →
 * lat/lng 저장". 이 개발 환경에는 카카오 주소검색(Daum Postcode) API 키가 없다
 * (04-tasks.md 질문 목록에 기록 — MapView와 동일 패턴). VITE_KAKAO_KEY가 없으면 수동 텍스트
 * 입력 필드로 폴백하고, 위/경도는 기본값(집하장 인근 좌표)을 유지한 채 사용자가 필요하면
 * 직접 숫자로 조정할 수 있게 한다. 실제 키가 주입되면 이 컴포넌트를 Daum Postcode 위젯
 * 호출로 교체해야 한다(현재는 그 호출부만 없고 폴백 UI가 항상 쓰인다).
 */
export function AddressField({ value, onChange }: AddressFieldProps) {
  const [manualCoords, setManualCoords] = useState(false);
  const hasKakaoKey = Boolean(KAKAO_KEY);

  if (hasKakaoKey) {
    // 실제 키가 있는 배포 환경을 위한 자리 — 카카오 주소검색 SDK 연동은 키 발급 후 구현.
    // 지금 이 분기로 들어올 일은 없다(VITE_KAKAO_KEY가 항상 비어있는 개발 환경).
    return null;
  }

  return (
    <div data-testid="address-field-fallback" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label htmlFor="address-input" style={{ fontSize: 14, fontWeight: 600 }}>
        매장 주소
      </label>
      <p style={{ margin: 0, fontSize: 12, color: colors.status.wait }}>
        카카오 주소검색을 사용할 수 없어 직접 입력으로 대체돼요.
      </p>
      <input
        id="address-input"
        data-testid="address-input"
        type="text"
        required
        placeholder="예: 서울특별시 강서구 오일픽로 1"
        value={value.address}
        onChange={(e) => onChange({ ...value, address: e.target.value })}
        className={inputClassName}
        style={inputStyle}
      />
      <button
        type="button"
        data-testid="address-manual-coords-toggle"
        onClick={() => setManualCoords((v) => !v)}
        style={{
          alignSelf: "flex-start",
          background: "none",
          border: "none",
          color: colors.primary.DEFAULT,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {manualCoords ? "위/경도 직접 입력 닫기" : "위/경도 직접 입력(선택)"}
      </button>
      {manualCoords && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            data-testid="address-lat-input"
            type="number"
            step="0.0001"
            aria-label="위도"
            value={value.lat}
            onChange={(e) => onChange({ ...value, lat: Number(e.target.value) })}
            className={inputClassName}
            style={{ ...inputStyle, flex: 1, fontSize: 14 }}
          />
          <input
            data-testid="address-lng-input"
            type="number"
            step="0.0001"
            aria-label="경도"
            value={value.lng}
            onChange={(e) => onChange({ ...value, lng: Number(e.target.value) })}
            className={inputClassName}
            style={{ ...inputStyle, flex: 1, fontSize: 14 }}
          />
        </div>
      )}
    </div>
  );
}
