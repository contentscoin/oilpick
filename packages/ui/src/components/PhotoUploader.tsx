import { useRef } from "react";
import { colors, radius } from "../tokens";

/** [15] 업로드 타일 안내 아이콘(카메라). 목업 04 계량 upload 타일. */
function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M4 8.5h2.6l1.2-2h8.4l1.2 2H20a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * 03-frontend.md "packages/ui 컴포넌트" — PhotoUploader(카메라 촬영 전용, Capacitor Camera).
 *
 * 가정(04-tasks.md 질문 목록에 동일 내용 기록): Capacitor는 T12에서 추가되므로 지금은
 * 표준 웹 `<input type="file" accept="image/*" capture>`로 구현한다. 공개 API는
 * "사진을 다녀도 photos: PhotoAsset[] (url + file/blob)를 상위로 콜백 전달"로 고정해
 * T12에서 내부 구현만 @capacitor/camera로 교체 가능하게 설계했다 — 이 컴포넌트를 쓰는
 * 화면(예: R4 계량 제출)은 onChange 콜백 시그니처가 바뀌지 않는 한 수정이 필요 없다.
 */
/** 목업 upload 타일 높이(2열 그리드 기준). */
const TILE_HEIGHT = 82;
/** 목업 upload 타일 점선 — primary(#1C5A38) 34%. */
const UPLOAD_BORDER = "rgba(28,90,56,0.34)";
/** 목업 upload 타일 바탕(아주 옅은 그린 틴트). */
const UPLOAD_BG = "#F8FBF8";

export interface PhotoAsset {
  /** 미리보기/표시용 URL. 웹 구현에서는 URL.createObjectURL(file) 결과, Capacitor 구현에서는
   * webPath 또는 dataUrl이 들어올 수 있다 — 소비 측은 <img src>로만 사용할 것. */
  url: string;
  /** 원본 File/Blob. 업로드(Supabase Storage) 시 사용. Capacitor 구현에서는 fetch(webPath)로
   * 변환한 Blob이 들어온다. */
  file: File | Blob;
}

export interface PhotoUploaderProps {
  photos: PhotoAsset[];
  onChange: (photos: PhotoAsset[]) => void;
  /** 최대 첨부 장수. 기본 1(R4 계량 제출 사진은 스펙상 "필수" 1장 기준). */
  maxCount?: number;
  disabled?: boolean;
  className?: string;
}

export function PhotoUploader({ photos, onChange, maxCount = 1, disabled, className }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const added: PhotoAsset[] = Array.from(fileList).map((file) => ({
      url: URL.createObjectURL(file),
      file,
    }));
    onChange([...photos, ...added].slice(0, maxCount));
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  const canAddMore = photos.length < maxCount;

  return (
    <div className={className} data-testid="photo-uploader">
      {/* [15] 목업 04 계량 "upload-grid" — 2열 고정 그리드. 예전엔 flex-wrap 88px 정사각
          타일이라 타일 수에 따라 줄바꿈 위치가 널뛰고 우측에 빈 여백이 남았다. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {photos.map((photo, i) => (
          <div
            key={photo.url}
            data-testid="photo-uploader-thumb"
            style={{ position: "relative", height: TILE_HEIGHT }}
          >
            <img
              src={photo.url}
              alt={`촬영 사진 ${i + 1}`}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: radius.button }}
            />
            {/* 시각 24px 원 유지 + 투명 패딩으로 히트 영역 40px 확보(라이더 장갑 낀 손 고려).
                그리드로 바뀌며 타일 바깥으로 튀어나온 위치(-14)는 옆 칸을 침범한다 — 안쪽 정렬. */}
            <button
              type="button"
              aria-label="사진 삭제"
              onClick={() => removeAt(i)}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 40,
                height: 40,
                padding: 8,
                borderRadius: "50%",
                border: "none",
                background: "none",
                cursor: "pointer",
              }}
            >
              <span
                aria-hidden
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  backgroundColor: colors.status.danger,
                  color: "#fff",
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ×
              </span>
            </button>
          </div>
        ))}
        {canAddMore && (
          <button
            type="button"
            data-testid="photo-uploader-trigger"
            aria-label="사진 추가"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              // 아직 찍은 사진이 없으면 타일이 하나뿐이라 반쪽만 차지해 어색하다 — 두 칸을 다 쓴다.
              gridColumn: photos.length === 0 ? "1 / -1" : "auto",
              width: "100%",
              height: TILE_HEIGHT,
              borderRadius: radius.button,
              // 목업의 dashed 초록 테두리 — 회색 점선은 "비활성"으로 읽혀 촬영 유도가 약했다.
              border: `1.6px dashed ${UPLOAD_BORDER}`,
              backgroundColor: UPLOAD_BG,
              color: colors.primary.DEFAULT,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            <CameraIcon />
            {/* 전폭일 때만 글자를 붙인다 — 반칸에선 아이콘만으로 충분하고 글자가 눌린다. */}
            {photos.length === 0 && <span style={{ fontSize: 14, fontWeight: 600 }}>사진 촬영</span>}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        data-testid="photo-uploader-input"
        type="file"
        accept="image/*"
        capture="environment"
        multiple={maxCount > 1}
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
        style={{ display: "none" }}
      />
    </div>
  );
}
