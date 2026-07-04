import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhotoUploader } from "./PhotoUploader";

describe("PhotoUploader", () => {
  it("renders an add trigger when empty", () => {
    render(<PhotoUploader photos={[]} onChange={() => {}} />);
    expect(screen.getByTestId("photo-uploader-trigger")).toBeInTheDocument();
  });

  it("calls onChange with a photo asset when a file is selected", () => {
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

  it("hides the trigger once maxCount photos are attached", () => {
    const photo = { url: "blob:test", file: new File(["x"], "a.jpg") };
    render(<PhotoUploader photos={[photo]} onChange={() => {}} maxCount={1} />);
    expect(screen.queryByTestId("photo-uploader-trigger")).not.toBeInTheDocument();
    expect(screen.getByTestId("photo-uploader-thumb")).toBeInTheDocument();
  });
});
