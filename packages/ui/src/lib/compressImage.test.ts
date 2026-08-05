import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IMAGE_COMPRESS_MAX_DIMENSION,
  IMAGE_COMPRESS_MIME,
  IMAGE_COMPRESS_QUALITY,
  canCompressImages,
  compressImage,
  fitWithin,
} from "./compressImage";

/** 압축 가능 환경 흉내 — jsdom엔 canvas 2d가 없어 getContext/toBlob/createImageBitmap을 스텁. */
function stubCanvasSupport(options?: { blob?: Blob | null; bitmap?: { width: number; height: number } }) {
  const drawImage = vi.fn();
  const close = vi.fn();
  const bitmap = { width: 4000, height: 3000, ...options?.bitmap, close };
  const encoded = options?.blob === undefined ? new Blob(["c"], { type: IMAGE_COMPRESS_MIME }) : options.blob;
  const toBlobCalls: Array<{ width: number; height: number; type: string | undefined; quality: unknown }> = [];
  // jsdom엔 CanvasRenderingContext2D 인터페이스가 없다 — canCompressImages의 조용한 사전 검사 통과용.
  vi.stubGlobal("CanvasRenderingContext2D", class {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    { drawImage } as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: unknown,
  ) {
    toBlobCalls.push({ width: this.width, height: this.height, type, quality });
    callback(encoded);
  });
  const createImageBitmapMock = vi.fn(() => Promise.resolve(bitmap as unknown as ImageBitmap));
  vi.stubGlobal("createImageBitmap", createImageBitmapMock);
  return { drawImage, close, createImageBitmapMock, toBlobCalls };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fitWithin", () => {
  it("상한 이하는 원본 크기 그대로(업스케일 금지)", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it("가로가 긴 이미지는 가로를 상한에 맞추고 종횡비를 유지한다", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("세로가 긴 이미지는 세로를 상한에 맞춘다", () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("스케일 결과는 반올림하고 최소 1px을 보장한다", () => {
    // 3333 → 1600 스케일에서 2000 * (1600/3333) = 960.09... → 960.
    expect(fitWithin(3333, 2000, 1600)).toEqual({ width: 1600, height: 960 });
    // 극단 종횡비 — 0으로 떨어지지 않는다.
    expect(fitWithin(100000, 10, 1600)).toEqual({ width: 1600, height: 1 });
  });

  it("유효하지 않은 입력(0·음수·NaN)은 원본을 그대로 돌려준다", () => {
    expect(fitWithin(0, 0, 1600)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(4000, 3000, 0)).toEqual({ width: 4000, height: 3000 });
    expect(fitWithin(Number.NaN, 3000, 1600)).toEqual({ width: Number.NaN, height: 3000 });
  });
});

describe("compressImage — 폴백(업로드 비차단) 계약", () => {
  it("canvas 2d 미지원 환경(jsdom 기본)에서는 원본 File을 그대로 반환한다", async () => {
    // jsdom은 canvas 패키지 없이 getContext("2d")가 null — canCompressImages()가 false.
    expect(canCompressImages()).toBe(false);
    const original = new File(["x".repeat(64)], "photo.jpg", { type: "image/jpeg" });
    const result = await compressImage(original);
    expect(result).toBe(original);
  });

  it("이미지가 아닌 파일은 압축 시도 없이 원본을 반환한다", async () => {
    const { createImageBitmapMock } = stubCanvasSupport();
    const pdf = new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" });
    await expect(compressImage(pdf)).resolves.toBe(pdf);
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it("JPEG 재인코딩이 내용을 깨뜨리는 포맷(GIF·SVG)은 원본을 유지한다", async () => {
    const { createImageBitmapMock } = stubCanvasSupport();
    const gif = new File(["GIF89a"], "anim.gif", { type: "image/gif" });
    const svg = new File(["<svg/>"], "icon.svg", { type: "image/svg+xml" });
    await expect(compressImage(gif)).resolves.toBe(gif);
    await expect(compressImage(svg)).resolves.toBe(svg);
    expect(createImageBitmapMock).not.toHaveBeenCalled();
  });

  it("디코드 실패 시 원본으로 폴백한다(예외를 밖으로 던지지 않는다)", async () => {
    stubCanvasSupport();
    // createImageBitmap 전 시도 실패 + <img> 디코드도 실패하는 환경.
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.reject(new Error("decode error"))),
    );
    class BrokenImage {
      decoding = "";
      src = "";
      decode() {
        return Promise.reject(new Error("broken image"));
      }
    }
    vi.stubGlobal("Image", BrokenImage);
    const original = new File(["x".repeat(64)], "photo.jpg", { type: "image/jpeg" });
    await expect(compressImage(original)).resolves.toBe(original);
  });

  it("toBlob이 null을 돌려주면(인코딩 실패) 원본으로 폴백한다", async () => {
    stubCanvasSupport({ blob: null });
    const original = new File(["x".repeat(64)], "photo.jpg", { type: "image/jpeg" });
    await expect(compressImage(original)).resolves.toBe(original);
  });
});

describe("compressImage — 압축 경로", () => {
  it("최장변 1600px로 리사이즈하고 JPEG 0.8로 재인코딩한 File(*.jpg)을 돌려준다", async () => {
    const { drawImage, close, createImageBitmapMock, toBlobCalls } = stubCanvasSupport();
    const original = new File(["x".repeat(1024)], "receipt.png", { type: "image/png" });

    const result = await compressImage(original);

    // EXIF 회전 반영 옵션으로 디코드했다.
    expect(createImageBitmapMock).toHaveBeenCalledWith(original, { imageOrientation: "from-image" });
    // 4000x3000 → 1600x1200 캔버스에 그려서 인코딩했다.
    expect(toBlobCalls).toEqual([
      { width: 1600, height: 1200, type: IMAGE_COMPRESS_MIME, quality: IMAGE_COMPRESS_QUALITY },
    ]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(close).toHaveBeenCalled();
    expect(result).toBeInstanceOf(File);
    expect((result as File).name).toBe("receipt.jpg");
    expect(result.type).toBe(IMAGE_COMPRESS_MIME);
    expect(fitWithin(4000, 3000, IMAGE_COMPRESS_MAX_DIMENSION)).toEqual({ width: 1600, height: 1200 });
  });

  it("리사이즈가 없고 재인코딩이 원본보다 크면 원본을 유지한다", async () => {
    stubCanvasSupport({
      bitmap: { width: 100, height: 80 },
      blob: new Blob(["y".repeat(50)], { type: IMAGE_COMPRESS_MIME }),
    });
    const original = new File(["tiny"], "small.jpg", { type: "image/jpeg" });
    await expect(compressImage(original)).resolves.toBe(original);
  });

  it("리사이즈가 없어도 재인코딩이 더 작으면 압축본을 쓴다", async () => {
    stubCanvasSupport({
      bitmap: { width: 1000, height: 800 },
      blob: new Blob(["z"], { type: IMAGE_COMPRESS_MIME }),
    });
    const original = new File(["x".repeat(1024)], "already-small-dims.jpeg", { type: "image/jpeg" });
    const result = await compressImage(original);
    expect(result).toBeInstanceOf(File);
    expect((result as File).name).toBe("already-small-dims.jpg");
    expect(result.size).toBe(1);
  });
});
