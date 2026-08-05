import { useState } from "react";
import { colors, inputClassName, inputStyle } from "@oilpick/ui";
import { openPostcodeSearch } from "../lib/daumPostcode";
import { geocodeAddress } from "../lib/geocode";

export interface AddressValue {
  address: string;
  /** 좌표. 미확정(검색/지오코딩 전, 지오코딩 실패)이면 null — 제출 게이트가 이를 막는다. */
  lat: number | null;
  lng: number | null;
}

export interface AddressFieldProps {
  value: AddressValue;
  onChange: (value: AddressValue) => void;
}

/**
 * U2 가입/수거요청의 매장 주소 입력(12 S2 재구현). 03-frontend.md: "주소 검색 → 좌표 저장".
 * - [주소 검색]: Daum 우편번호 위젯(API 키 불필요) → 도로명 주소 선택.
 * - 좌표: 선택한 주소를 geocode Edge Function(서버측 VWorld 프록시)으로 변환 — 브라우저
 *   직접 호출은 CORS로 차단되고 키가 번들에 노출된다(12 S2 재설계).
 * - 지오코딩 실패·위젯 로드 실패: 주소 텍스트 직접 입력 + 위/경도 수동 입력으로 강등.
 * 좌표가 확정되기 전(lat/lng null)에는 호출부가 제출을 막는다 — 기본 좌표 저장(데이터 오염)
 * 을 근본 차단한다(구현 전에는 카카오 키 유무로 UI가 사라지거나 기본 좌표가 저장됐다).
 */
export function AddressField({ value, onChange }: AddressFieldProps) {
  const [searching, setSearching] = useState(false);
  const [manualCoords, setManualCoords] = useState(false);
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  // 위젯 자체를 못 띄운 경우(스크립트 차단·네트워크 실패). 취소와 구분해서 안내해야 한다.
  const [searchUnavailable, setSearchUnavailable] = useState(false);

  const coordsConfirmed = value.lat != null && value.lng != null;

  async function handleSearch() {
    setSearching(true);
    setGeocodeFailed(false);
    setSearchUnavailable(false);
    try {
      const result = await openPostcodeSearch();
      if (result.status === "cancelled") return;
      if (result.status === "unavailable") {
        // 침묵 금지 — 버튼을 눌러도 아무 일이 없으면 사용자는 앱이 멈춘 걸로 받아들인다.
        // 주소는 직접 입력할 수 있으므로 좌표 수동 입력을 함께 열어 진행 경로를 남긴다.
        setSearchUnavailable(true);
        setManualCoords(true);
        return;
      }
      const picked = result.address;
      const point = await geocodeAddress(picked);
      if (point) {
        onChange({ address: picked, lat: point.lat, lng: point.lng });
        setManualCoords(false);
      } else {
        // 주소는 확정, 좌표만 실패 → 수동 좌표 입력 유도(기본 좌표 저장 금지).
        onChange({ address: picked, lat: null, lng: null });
        setGeocodeFailed(true);
        setManualCoords(true);
      }
    } finally {
      setSearching(false);
    }
  }

  return (
    <div data-testid="address-field" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label htmlFor="address-input" style={{ fontSize: 14, fontWeight: 600 }}>
        매장 주소
      </label>

      {/* [M] flexWrap + input minWidth:0(+size 1) — 확대 시 버튼이 자연 개행되고 input이 행을 밀어내지 않는다. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input
          id="address-input"
          data-testid="address-input"
          type="text"
          required
          size={1}
          placeholder="예: 서울특별시 강서구 화곡로 1"
          value={value.address}
          // 주소를 손으로 고치면 좌표는 다시 미확정(검색으로 재확정 필요) — 오염 방지.
          onChange={(e) => onChange({ address: e.target.value, lat: null, lng: null })}
          className={inputClassName}
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          data-testid="address-search-button"
          onClick={handleSearch}
          disabled={searching}
          style={{
            flexShrink: 0,
            minHeight: 44,
            padding: "0 16px",
            borderRadius: 12,
            border: "none",
            backgroundColor: colors.primary.DEFAULT,
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: searching ? "default" : "pointer",
            opacity: searching ? 0.6 : 1,
          }}
        >
          {searching ? "검색 중…" : "주소 검색"}
        </button>
      </div>

      {/* 위젯을 못 띄운 경우 — 주소가 비어 있어도 반드시 보여야 하므로 좌표 상태 표기와 분리한다. */}
      {searchUnavailable && (
        <p data-testid="address-search-unavailable" style={{ margin: 0, fontSize: 12, color: colors.status.danger }}>
          주소 검색을 불러오지 못했어요. 주소를 직접 입력하고 아래에서 위치를 지정해주세요.
        </p>
      )}

      {/* 좌표 확정 상태 표기 — 확정 전에는 경고, 확정되면 초록 확인. */}
      {coordsConfirmed ? (
        <p data-testid="address-coords-confirmed" style={{ margin: 0, fontSize: 12, fontWeight: 600, color: colors.primary.DEFAULT }}>
          ✓ 지도 위치가 확인됐어요
        </p>
      ) : value.address ? (
        <p data-testid="address-coords-pending" style={{ margin: 0, fontSize: 12, color: colors.status.danger }}>
          {geocodeFailed
            ? "주소의 지도 위치를 자동으로 찾지 못했어요. 아래에서 위치를 확인해주세요."
            : "‘주소 검색’으로 정확한 위치를 확정해주세요."}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="address-manual-coords-toggle"
        onClick={() => setManualCoords((v) => !v)}
        style={{
          alignSelf: "flex-start",
          background: "none",
          border: "none",
          color: colors.status.wait,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {manualCoords ? "위/경도 직접 입력 닫기" : "위/경도 직접 입력(선택)"}
      </button>
      {manualCoords && (
        // [M] 확대 시 두 입력이 자연 개행되게 wrap + minWidth:0(placeholder가 행을 밀어내지 않게).
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <input
            data-testid="address-lat-input"
            type="number"
            step="0.0001"
            aria-label="위도"
            placeholder="위도"
            value={value.lat ?? ""}
            onChange={(e) => onChange({ ...value, lat: e.target.value === "" ? null : Number(e.target.value) })}
            className={inputClassName}
            style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: 14 }}
          />
          <input
            data-testid="address-lng-input"
            type="number"
            step="0.0001"
            aria-label="경도"
            placeholder="경도"
            value={value.lng ?? ""}
            onChange={(e) => onChange({ ...value, lng: e.target.value === "" ? null : Number(e.target.value) })}
            className={inputClassName}
            style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: 14 }}
          />
        </div>
      )}
    </div>
  );
}
