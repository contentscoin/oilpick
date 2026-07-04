import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MapView } from "./MapView";

describe("MapView", () => {
  it("renders a placeholder when no API key is provided (no crash)", () => {
    render(<MapView center={{ lat: 37.5665, lng: 126.978 }} />);
    expect(screen.getByTestId("map-view-placeholder")).toBeInTheDocument();
  });

  it("renders a placeholder when SDK script load fails", async () => {
    render(<MapView apiKey="test-key" center={{ lat: 37.5665, lng: 126.978 }} />);
    const script = document.getElementById("oilpick-kakao-maps-sdk");
    expect(script).toBeTruthy();
    script?.dispatchEvent(new Event("error"));
    expect(await screen.findByTestId("map-view-placeholder")).toBeInTheDocument();
  });
});
