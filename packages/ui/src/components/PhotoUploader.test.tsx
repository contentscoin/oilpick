import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotoUploader } from "./PhotoUploader";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PhotoUploader", () => {
  it("renders an add trigger when empty", () => {
    render(<PhotoUploader photos={[]} onChange={() => {}} />);
    expect(screen.getByTestId("photo-uploader-trigger")).toBeInTheDocument();
  });

  // [O3] jsdom엔 canvas 2d가 없어 압축 불가 → 동기 경로로 **원본을 그대로** 전달한다.
  // 압축 불가 환경(구형 WebView) 폴백 계약 검증을 겸한다 — 업로드는 절대 막히지 않는다.
  it("calls onChange with the original file when compression is unavailable", () => {
    const onChange = vi.fn();
    render(<PhotoUploader photos={[]} onChange={onChange} />);
    const input = screen.getByTestId("photo-uploader-input") as HTMLInputElement;
    const file = new File(["dummy"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const [photos] = onChange.mock.calls[0] as [Array<{ file: File; url: string }>];
    expect(photos).toHaveLength(1);
    expect(photos[0]?.file).toBe(file);
    expect(typeof photos[0]?.url).toBe("string");
  });

  // [O3] canvas 재인코딩이 가능한 환경이면 PhotoAsset.file에 압축본(JPEG *.jpg)이 실린다 —
  // 사용처(rider 서류/계량 업로드)는 이 file을 그대로 올리므로 API 무변경 자동 적용.
  it("compresses the selected photo before calling onChange when canvas is available", async () => {
    // jsdom엔 CanvasRenderingContext2D가 없다 — canCompressImages의 조용한 사전 검사 통과용.
    vi.stubGlobal("CanvasRenderingContext2D", class {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      callback: BlobCallback,
    ) {
      callback(new Blob(["c"], { type: "image/jpeg" }));
    });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve({ width: 4000, height: 3000, close: vi.fn() } as unknown as ImageBitmap)),
    );

    const onChange = vi.fn();
    render(<PhotoUploader photos={[]} onChange={onChange} />);
    const input = screen.getByTestId("photo-uploader-input") as HTMLInputElement;
    const file = new File(["x".repeat(1024)], "receipt.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const [photos] = onChange.mock.calls[0] as [Array<{ file: File; url: string }>];
    expect(photos).toHaveLength(1);
    expect(photos[0]?.file).toBeInstanceOf(File);
    expect(photos[0]?.file.name).toBe("receipt.jpg");
    expect(photos[0]?.file.type).toBe("image/jpeg");
    expect(typeof photos[0]?.url).toBe("string");
  });

  it("hides the trigger once maxCount photos are attached", () => {
    const photo = { url: "blob:test", file: new File(["x"], "a.jpg") };
    render(<PhotoUploader photos={[photo]} onChange={() => {}} maxCount={1} />);
    expect(screen.queryByTestId("photo-uploader-trigger")).not.toBeInTheDocument();
    expect(screen.getByTestId("photo-uploader-thumb")).toBeInTheDocument();
  });
});
