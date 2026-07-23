import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddressField } from "./AddressField";

// 12 S2: 주소검색(Daum 무키) + 지오코딩(VWorld)을 모킹해 컴포넌트 로직만 검증한다.
const { mockOpenPostcodeSearch, mockGeocodeAddress } = vi.hoisted(() => ({
  mockOpenPostcodeSearch: vi.fn(),
  mockGeocodeAddress: vi.fn(),
}));
vi.mock("../lib/daumPostcode", () => ({ openPostcodeSearch: mockOpenPostcodeSearch }));
vi.mock("../lib/geocode", () => ({ geocodeAddress: mockGeocodeAddress }));

describe("AddressField (12 S2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("주소 입력과 검색 버튼을 렌더한다(키 유무와 무관)", () => {
    render(<AddressField value={{ address: "", lat: null, lng: null }} onChange={vi.fn()} />);
    expect(screen.getByTestId("address-field")).toBeInTheDocument();
    expect(screen.getByTestId("address-input")).toBeInTheDocument();
    expect(screen.getByTestId("address-search-button")).toBeInTheDocument();
  });

  it("주소를 손으로 고치면 좌표를 미확정(null)으로 되돌린다(오염 방지)", () => {
    const onChange = vi.fn();
    render(<AddressField value={{ address: "옛주소", lat: 37.5, lng: 127 }} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("address-input"), { target: { value: "서울시 강서구" } });
    expect(onChange).toHaveBeenCalledWith({ address: "서울시 강서구", lat: null, lng: null });
  });

  it("좌표가 확정되면 확인 표시, 미확정이면 경고를 보인다", () => {
    const { rerender } = render(
      <AddressField value={{ address: "서울시 강서구 1", lat: null, lng: null }} onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("address-coords-pending")).toBeInTheDocument();
    rerender(<AddressField value={{ address: "서울시 강서구 1", lat: 37.5, lng: 127 }} onChange={vi.fn()} />);
    expect(screen.getByTestId("address-coords-confirmed")).toBeInTheDocument();
  });

  it("주소 검색→지오코딩 성공 시 주소+좌표로 onChange한다", async () => {
    mockOpenPostcodeSearch.mockResolvedValue("서울특별시 강서구 화곡로 1");
    mockGeocodeAddress.mockResolvedValue({ lat: 37.5509, lng: 126.8225 });
    const onChange = vi.fn();
    render(<AddressField value={{ address: "", lat: null, lng: null }} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("address-search-button"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        address: "서울특별시 강서구 화곡로 1",
        lat: 37.5509,
        lng: 126.8225,
      }),
    );
  });

  it("지오코딩 실패 시 좌표 null + 수동 입력 유도(기본 좌표 저장 금지)", async () => {
    mockOpenPostcodeSearch.mockResolvedValue("서울특별시 강서구 화곡로 1");
    mockGeocodeAddress.mockResolvedValue(null);
    const onChange = vi.fn();
    render(<AddressField value={{ address: "", lat: null, lng: null }} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("address-search-button"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ address: "서울특별시 강서구 화곡로 1", lat: null, lng: null }),
    );
    expect(await screen.findByTestId("address-lat-input")).toBeInTheDocument();
  });

  it("위/경도 수동 입력 토글", () => {
    render(<AddressField value={{ address: "", lat: null, lng: null }} onChange={vi.fn()} />);
    expect(screen.queryByTestId("address-lat-input")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("address-manual-coords-toggle"));
    expect(screen.getByTestId("address-lat-input")).toBeInTheDocument();
    expect(screen.getByTestId("address-lng-input")).toBeInTheDocument();
  });
});
