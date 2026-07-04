import { useRef } from "react";
import { colors, radius } from "../tokens";

/**
 * 03-frontend.md "packages/ui 컴포넌트" — PhotoUploader(카메라 촬영 전용, Capacitor Camera).
 *
 * 가정(04-tasks.md 질문 목록에 동일 내용 기록): Capacitor는 T12에서 추가되므로 지금은
 * 표준 웹 `<input type="file" accept="image/*" capture>`로 구현한다. 공개 API는
 * "사진을 다녀도 photos: PhotoAsset[] (url + file/blob)를 상위로 콜백 전달"로 고정해
 * T12에서 내부 구현만 @capacitor/camera로 교체 가능하게 설계했다 — 이 컴포넌트를 쓰는
 * 화면(예: R4 계량 제출)은 onChange 콜백 시그니처가 바뀌지 않는 한 수정이 필요 없다.
 */
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {photos.map((photo, i) => (
          <div
            key={photo.url}
            data-testid="photo-uploader-thumb"
            style={{ position: "relative", width: 88, height: 88 }}
          >
            <img
              src={photo.url}
              alt={`촬영 사진 ${i + 1}`}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: radius.button }}
            />
            <button
              type="button"
              aria-label="사진 삭제"
              onClick={() => removeAt(i)}
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: "none",
                backgroundColor: colors.status.danger,
                color: "#fff",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        ))}
        {canAddMore && (
          <button
            type="button"
            data-testid="photo-uploader-trigger"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            style={{
              width: 88,
              height: 88,
              borderRadius: radius.button,
              border: `1px dashed ${colors.status.wait}`,
              backgroundColor: "#fafafa",
              color: colors.status.wait,
              fontSize: 28,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            +
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
