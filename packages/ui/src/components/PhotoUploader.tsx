import { useRef } from "react";
import { colors, radius } from "../tokens";
import { canCompressImages, compressImage } from "../lib/compressImage";

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
 *
 * [O3 2026-08-05] 선택/촬영 결과는 lib/compressImage로 기본 압축(최장변 1600px + JPEG 0.8,
 * EXIF 회전 반영)해 PhotoAsset.file에 싣는다. 압축 실패/불가 환경은 원본 폴백(업로드 비차단).
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

  function appendFiles(files: Array<File | Blob>) {
    const added: PhotoAsset[] = files.map((file) => ({
      url: URL.createObjectURL(file),
      file,
    }));
    onChange([...photos, ...added].slice(0, maxCount));
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    // [O3] 업로드 전 기본 압축(최장변 1600px + JPEG 0.8) — PhotoAsset.file에 압축본이 실려
    // 사용처(rider 서류/계량 사진 업로드)는 API 무변경으로 자동 적용된다. canvas 재인코딩이
    // 불가한 환경(구형 WebView·jsdom)은 기존 동기 경로 그대로 원본을 전달한다(폴백 계약).
    if (!canCompressImages()) {
      appendFiles(files);
      return;
    }
    // compressImage는 개별 실패 시 원본을 돌려주므로(내부 폴백) 여기서 reject는 발생하지 않는다.
    void Promise.all(files.map((file) => compressImage(file))).then(appendFiles);
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
            // [03 레이아웃 강건성] 고정 height → minHeight. 옆 칸(촬영 버튼)이 글자 확대로
            // 커지면 그리드 행 stretch로 같이 늘어나고, 이미지는 absolute로 칸을 채운다.
            style={{ position: "relative", minHeight: TILE_HEIGHT }}
          >
            <img
              src={photo.url}
              alt={`촬영 사진 ${i + 1}`}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: radius.button,
              }}
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
                // [03 레이아웃 강건성] 고정 40 → min 치수(확대 시 × 글리프에 맞춰 늘어난다).
                minWidth: 40,
                minHeight: 40,
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
                  // 시각 24px 원 유지하되 min 치수 + aspectRatio — 확대된 ×가 잘리지 않는다.
                  minWidth: 24,
                  minHeight: 24,
                  aspectRatio: "1",
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
              // [03 레이아웃 강건성] 확대 시 아이콘+라벨이 접혀 두 줄이 될 수 있다.
              flexWrap: "wrap",
              gap: 8,
              // 아직 찍은 사진이 없으면 타일이 하나뿐이라 반쪽만 차지해 어색하다 — 두 칸을 다 쓴다.
              gridColumn: photos.length === 0 ? "1 / -1" : "auto",
              width: "100%",
              // 고정 height → minHeight(글자 확대 시 잘림 방지).
              minHeight: TILE_HEIGHT,
              padding: 8,
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
