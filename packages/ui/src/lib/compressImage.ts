/**
 * [O3 2026-08-05, CEO 지시 "사진첨부할때는 압축해서 업로드"] 사진 업로드 전 클라이언트 압축.
 *
 * 규약(03-frontend.md packages/ui 컴포넌트 절):
 * - canvas 리사이즈 최장변 1600px 상한(업스케일 금지) + JPEG 품질 0.8 재인코딩.
 * - EXIF 회전은 createImageBitmap(imageOrientation:"from-image") 사용 가능 브라우저에서 반영.
 * - 압축 실패(디코드 불가·canvas 미지원 등)는 어떤 경우에도 업로드를 막지 않는다 — **원본 폴백**.
 *
 * 이 파일은 순수 헬퍼다(React 무관). 압축 적용 지점은 PhotoUploader(handleFiles) 한 곳 —
 * PhotoAsset.file에 압축본이 실려 각 앱의 업로드 코드(rider AuthPage 서류, ActiveRunPage 계량
 * 사진 등)는 API 무변경으로 자동 적용된다(절대 규칙 7: 공용 계층 단일 구현).
 */

/** 재인코딩 출력 MIME. */
export const IMAGE_COMPRESS_MIME = "image/jpeg";
/** 리사이즈 최장변 상한(px). */
export const IMAGE_COMPRESS_MAX_DIMENSION = 1600;
/** JPEG 재인코딩 품질. */
export const IMAGE_COMPRESS_QUALITY = 0.8;

/** JPEG 재인코딩 시 내용이 깨지는 포맷(애니메이션·벡터)은 압축 대상에서 제외 — 원본 유지. */
const SKIP_MIME_TYPES = new Set(["image/gif", "image/svg+xml"]);

export interface CompressImageOptions {
  /** 최장변 상한(px). 기본 IMAGE_COMPRESS_MAX_DIMENSION. */
  maxDimension?: number;
  /** JPEG 품질(0~1). 기본 IMAGE_COMPRESS_QUALITY. */
  quality?: number;
}

/**
 * 최장변 상한에 맞춘 목표 크기 계산. 순수 함수(단위 테스트 대상).
 * - 상한 이하(또는 유효하지 않은 입력)면 원본 크기 그대로 — 업스케일 금지.
 * - 축소 시 종횡비 유지, 반올림, 최소 1px 보장.
 */
export function fitWithin(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0 || !Number.isFinite(maxDimension) || maxDimension <= 0) {
    return { width, height };
  }
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * 이 환경에서 canvas 재인코딩이 가능한지 동기 판정.
 * PhotoUploader가 false면 기존 동기 경로(원본 그대로)를 그대로 타 — 구형 WebView·jsdom에서
 * 콜백 타이밍이 바뀌지 않는다(압축 불가 환경 폴백).
 */
export function canCompressImages(): boolean {
  if (typeof document === "undefined") return false;
  // jsdom(canvas 패키지 없음)엔 CanvasRenderingContext2D 인터페이스 자체가 없다 — 이때
  // getContext("2d")를 호출하면 "Not implemented" 로그만 남기고 null이므로, 소음 없이
  // 인터페이스 존재를 먼저 확인한다(실브라우저는 항상 정의돼 있어 다음 검사로 진행).
  if (typeof CanvasRenderingContext2D === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    if (typeof canvas.toBlob !== "function") return false;
    return canvas.getContext("2d") != null;
  } catch {
    return false;
  }
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

/** createImageBitmap(EXIF 회전 반영) 우선, 미지원/실패 시 <img> 디코드 폴백. */
async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
      // 옵션 미지원 구형 브라우저(TypeError 등)는 옵션 없이 한 번 더 — 회전 없이라도 디코드.
      .catch(() => createImageBitmap(file))
      .catch(() => null);
    if (bitmap) {
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    if (typeof img.decode === "function") {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image decode failed"));
      });
    }
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error("image has no dimensions");
    return { source: img, width, height, cleanup: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** 압축 결과 파일명 — 원본 이름의 확장자를 .jpg로 교체(업로드 경로의 ext 파생 로직과 정합). */
function toJpegFileName(input: File | Blob): string {
  const base =
    input instanceof File && input.name ? input.name.replace(/\.[^./\\]+$/, "") : "photo";
  return `${base || "photo"}.jpg`;
}

/**
 * 사진 압축 본체. 성공 시 JPEG File(이름 *.jpg), 실패·불가 시 **원본 그대로** 반환.
 * - 리사이즈가 없었는데 재인코딩이 원본보다 크면 원본 유지(품질 손실만 남는 역효과 방지).
 * - 예외는 밖으로 던지지 않는다 — 호출부(업로드)는 반환값을 그대로 올리면 된다.
 */
export async function compressImage(
  file: File | Blob,
  options: CompressImageOptions = {},
): Promise<File | Blob> {
  const maxDimension = options.maxDimension ?? IMAGE_COMPRESS_MAX_DIMENSION;
  const quality = options.quality ?? IMAGE_COMPRESS_QUALITY;
  try {
    if (!file.type.startsWith("image/") || SKIP_MIME_TYPES.has(file.type)) return file;
    if (!canCompressImages()) return file;

    const decoded = await decodeImage(file);
    try {
      const target = fitWithin(decoded.width, decoded.height, maxDimension);
      const canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = target.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(decoded.source, 0, 0, target.width, target.height);
      const blob = await canvasToBlob(canvas, IMAGE_COMPRESS_MIME, quality);
      if (!blob || blob.size === 0) return file;
      const resized = target.width !== decoded.width || target.height !== decoded.height;
      if (!resized && blob.size >= file.size) return file;
      return new File([blob], toJpegFileName(file), { type: IMAGE_COMPRESS_MIME });
    } finally {
      decoded.cleanup();
    }
  } catch {
    // 디코드 불가·canvas 예외 등 어떤 실패든 업로드를 막지 않는다 — 원본 폴백.
    return file;
  }
}
