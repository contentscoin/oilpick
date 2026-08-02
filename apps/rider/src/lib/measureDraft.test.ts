// [16 L4 §3-2] 계량 드래프트 저장소 계약. IndexedDB는 fake-indexeddb로 대체한다.
// jsdom의 Blob은 fake-indexeddb의 구조적 복제가 인식하지 못한다(실 브라우저 IDB는 Blob 지원) —
// 사진 케이스는 node:buffer Blob으로 검증한다.
import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_TTL_MS,
  clearDraft,
  loadDraft,
  photoFingerprint,
  purgeExpiredDrafts,
  recordUploadedUrl,
  saveDraftPhotos,
  saveDraftText,
} from "./measureDraft";

const TEXT = {
  kg: "12.5",
  payout: "CASH" as const,
  deliveredCans: 2,
  barcodes: ["880123"],
  geo: { lat: 37.5, lng: 127.0, capturedAt: "2026-08-02T00:00:00Z" },
  uploadedUrls: {},
};

/** savedAt을 직접 조작해 만료를 흉내낸다 — fake timers는 fake-indexeddb 내부 타이머를 얼려 금지. */
function backdateDraft(orderId: string, ageMs: number) {
  const key = `oilpick:measure-draft:${orderId}`;
  const raw = JSON.parse(localStorage.getItem(key)!);
  raw.savedAt = Date.now() - ageMs;
  localStorage.setItem(key, JSON.stringify(raw));
}

afterEach(async () => {
  await clearDraft("o1");
  localStorage.clear();
});

describe("measureDraft", () => {
  it("텍스트+사진 저장 후 복원한다(objectURL 재생성)", async () => {
    URL.createObjectURL = vi.fn(() => "blob:restored");
    saveDraftText("o1", TEXT);
    await saveDraftPhotos("o1", [
      { url: "blob:x", file: new NodeBlob(["photo"], { type: "image/jpeg" }) as unknown as Blob },
    ]);

    const draft = await loadDraft("o1");
    expect(draft).not.toBeNull();
    expect(draft!.text.kg).toBe("12.5");
    expect(draft!.text.barcodes).toEqual(["880123"]);
    expect(draft!.photos).toHaveLength(1);
    expect(draft!.photos[0]!.url).toBe("blob:restored");
  });

  it("업로드 체크포인트를 기록·복원한다", async () => {
    saveDraftText("o1", TEXT);
    recordUploadedUrl("o1", "5:a.jpg", "https://signed.example/a.jpg");
    const draft = await loadDraft("o1");
    expect(draft!.text.uploadedUrls).toEqual({ "5:a.jpg": "https://signed.example/a.jpg" });
  });

  it("7일 경과 드래프트는 load 시 파기하고 null", async () => {
    saveDraftText("o1", TEXT);
    backdateDraft("o1", DRAFT_TTL_MS + 1000);
    expect(await loadDraft("o1")).toBeNull();
    expect(localStorage.getItem("oilpick:measure-draft:o1")).toBeNull();
  });

  it("purgeExpiredDrafts가 만료분만 지운다", async () => {
    saveDraftText("stale", TEXT);
    backdateDraft("stale", DRAFT_TTL_MS + 1000);
    saveDraftText("live", TEXT);

    await purgeExpiredDrafts();
    expect(localStorage.getItem("oilpick:measure-draft:stale")).toBeNull();
    expect(localStorage.getItem("oilpick:measure-draft:live")).not.toBeNull();
    await clearDraft("live");
  });

  it("clearDraft가 텍스트·사진을 모두 지운다", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    saveDraftText("o1", TEXT);
    await saveDraftPhotos("o1", [{ url: "blob:x", file: new NodeBlob(["p"]) as unknown as Blob }]);
    await clearDraft("o1");
    expect(await loadDraft("o1")).toBeNull();
  });

  it("photoFingerprint — File은 크기:이름, Blob은 크기:blob", () => {
    expect(photoFingerprint(new File(["abcde"], "a.jpg"))).toBe("5:a.jpg");
    expect(photoFingerprint(new Blob(["abc"]))).toBe("3:blob");
  });
});
