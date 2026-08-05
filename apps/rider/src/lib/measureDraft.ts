import type { BarcodeItem, PayoutMethod, PickupGeo } from "@oilpick/core";
import type { PhotoAsset } from "@oilpick/ui";

/**
 * [16 L4 §3-2] 계량 제출 드래프트 — 오프라인 내성.
 *
 * 하루 중 가장 긴 수기 입력(kg·지급수단·바코드≤50·신유 통수·사진)이 가장 약한 네트워크 지점
 * (지하 주방 등)에서 일어난다. 화면 이탈·제출 실패 시 전부 재입력하던 것을, orderId 키의
 * 로컬 드래프트로 보존한다:
 *  - 텍스트 입력·업로드 체크포인트 → localStorage(동기, 입력 즉시)
 *  - 사진 Blob → IndexedDB(비동기·용량). indexedDB가 없는 환경(구형 웹뷰 등)에서는 사진만
 *    보존을 건너뛴다(텍스트는 유지 — 기능 강등, 크래시 금지).
 *
 * 서버 호출은 기존과 동일하게 order-transition SUBMIT_MEASURE 1회 — 재제출 멱등(08 P2)이라
 * 드래프트 재제출도 안전하다. 파기: 제출 성공·주문 종결(복원 가드)·7일 경과(DRAFT_TTL_MS).
 * 낡은 드래프트 오제출 가드는 화면(ArrivedPanel)이 복원 시·제출 직전 서버 status·final_kg를
 * 재확인하는 것으로 담당한다(이 모듈은 저장소만).
 */

export interface MeasureDraftText {
  kg: string;
  payout: PayoutMethod | null;
  deliveredCans: number;
  /** 레거시(코드만) — 구드래프트 복원 호환. 신규 저장도 코드 목록을 함께 기록한다. */
  barcodes: string[];
  /**
   * [O2] 바코드+사진 항목(코드·업로드된 서명 URL만 — 파일 원본은 저장하지 않는다: 사진은 첨부
   * 즉시 업로드된다). 없으면(구드래프트) barcodes에서 사진 없는 항목으로 복원한다.
   */
  barcodeItems?: BarcodeItem[];
  geo: PickupGeo | null;
  /**
   * 업로드 체크포인트: 사진 지문(photoFingerprint) → 발급된 1년 서명 URL.
   * 순차 업로드가 중간에 실패해도 성공분은 재업로드하지 않고 URL을 재사용한다.
   */
  uploadedUrls: Record<string, string>;
  savedAt: number;
}

export interface MeasureDraft {
  text: MeasureDraftText;
  photos: PhotoAsset[];
}

/** 드래프트 보존 기한(7일) — 경과분은 load/purge 시 자동 파기. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const KEY_PREFIX = "oilpick:measure-draft:";
const DB_NAME = "oilpick-rider-measure-drafts";
const STORE = "photos";

const textKey = (orderId: string) => `${KEY_PREFIX}${orderId}`;

/**
 * 업로드 체크포인트 키. PhotoAsset에 id가 없어(url은 objectURL이라 세션마다 바뀜) 파일
 * 크기+이름으로 지문을 만든다 — 한 주문 최대 3장 범위에서 충돌 가능성은 무시할 수준이고,
 * 동일 파일 재첨부는 같은 업로드를 재사용해도 내용이 같아 무해하다.
 */
export function photoFingerprint(file: File | Blob): string {
  return `${file.size}:${file instanceof File ? file.name : "blob"}`;
}

// ── IndexedDB 최소 래퍼(의존성 없음) ─────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB 미지원"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open 실패"));
  });
}

const orderRange = (orderId: string) => IDBKeyRange.bound(`${orderId}:`, `${orderId}:￿`);

/**
 * 트랜잭션 1개 안에서 요청들을 전부 큐잉하고 tx.oncomplete로 완료를 기다린다.
 * (요청 사이에 await를 끼우면 마이크로태스크 경계에서 트랜잭션이 비활성화될 수 있다 —
 * TransactionInactiveError. 요청은 동기적으로 모두 등록하는 것이 IDB 계약이다.)
 */
function runTx(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("indexedDB 트랜잭션 중단"));
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB 트랜잭션 실패"));
  });
}

/** 해당 주문의 사진 Blob 전체 교체(replace-set — 부분 갱신 대신 전체를 다시 쓴다). */
async function idbPutPhotos(orderId: string, blobs: Blob[]): Promise<void> {
  const db = await openDb();
  try {
    await runTx(db, "readwrite", (store) => {
      store.delete(orderRange(orderId));
      blobs.forEach((blob, i) => store.put(blob, `${orderId}:${i}`));
    });
  } finally {
    db.close();
  }
}

async function idbGetPhotos(orderId: string): Promise<Blob[]> {
  const db = await openDb();
  try {
    const blobs = await new Promise<unknown[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll(orderRange(orderId));
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error ?? new Error("indexedDB 조회 실패"));
    });
    // instanceof Blob 대신 덕타이핑 — IDB 구조적 복제가 다른 realm의 Blob 생성자를 쓸 수 있다
    // (jsdom/웹뷰 경계에서 instanceof가 false로 새는 것을 실측 확인).
    return blobs.filter(
      (b): b is Blob =>
        typeof b === "object" &&
        b !== null &&
        typeof (b as Blob).size === "number" &&
        typeof (b as Blob).slice === "function",
    );
  } finally {
    db.close();
  }
}

async function idbDeletePhotos(orderId: string): Promise<void> {
  const db = await openDb();
  try {
    await runTx(db, "readwrite", (store) => {
      store.delete(orderRange(orderId));
    });
  } finally {
    db.close();
  }
}

// ── 공개 API ────────────────────────────────────────────────────────────────

/** 텍스트 입력·체크포인트 저장(입력 즉시 호출 — 동기 localStorage). */
export function saveDraftText(orderId: string, text: Omit<MeasureDraftText, "savedAt">): void {
  try {
    localStorage.setItem(textKey(orderId), JSON.stringify({ ...text, savedAt: Date.now() }));
  } catch {
    // 저장 불가(용량·프라이버시 모드) — 드래프트는 보험 기능, 입력 흐름을 막지 않는다.
  }
}

/** 사진 Blob 저장(변경 시 호출 — 비동기, 실패는 무시: 사진만 보존 강등). */
export async function saveDraftPhotos(orderId: string, photos: PhotoAsset[]): Promise<void> {
  try {
    await idbPutPhotos(orderId, photos.map((p) => p.file));
  } catch {
    // indexedDB 미지원/실패 — 텍스트 드래프트만 유지.
  }
}

/** 업로드 체크포인트 기록 — 사진 1장 업로드+서명 성공 직후 호출. */
export function recordUploadedUrl(orderId: string, fingerprint: string, url: string): void {
  const raw = readText(orderId);
  if (!raw) return;
  saveDraftText(orderId, { ...raw, uploadedUrls: { ...raw.uploadedUrls, [fingerprint]: url } });
}

function readText(orderId: string): MeasureDraftText | null {
  try {
    const raw = localStorage.getItem(textKey(orderId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MeasureDraftText;
    if (typeof parsed?.savedAt !== "number") return null;
    return { ...parsed, uploadedUrls: parsed.uploadedUrls ?? {} };
  } catch {
    return null;
  }
}

/**
 * 드래프트 복원. 7일 경과분은 여기서 파기하고 null. 사진은 IndexedDB에서 Blob을 꺼내
 * objectURL을 재생성한다(URL 수명은 이번 세션 — PhotoUploader 미리보기 계약과 동일).
 */
export async function loadDraft(orderId: string): Promise<MeasureDraft | null> {
  const text = readText(orderId);
  if (!text) return null;
  if (Date.now() - text.savedAt > DRAFT_TTL_MS) {
    await clearDraft(orderId);
    return null;
  }
  let photos: PhotoAsset[] = [];
  try {
    const blobs = await idbGetPhotos(orderId);
    photos = blobs.map((file) => ({ file, url: URL.createObjectURL(file) }));
  } catch {
    photos = []; // 사진 복원 실패 — 텍스트만 복원(강등).
  }
  return { text, photos };
}

/** 드래프트 파기(제출 성공·주문 종결·만료·수동 지우기). */
export async function clearDraft(orderId: string): Promise<void> {
  try {
    localStorage.removeItem(textKey(orderId));
  } catch {
    /* noop */
  }
  try {
    await idbDeletePhotos(orderId);
  } catch {
    /* noop */
  }
}

/** 만료 드래프트 전역 청소 — 화면 진입 시 1회 호출(다시는 열리지 않을 주문의 잔여물 제거). */
export async function purgeExpiredDrafts(): Promise<void> {
  const expired: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      const orderId = key.slice(KEY_PREFIX.length);
      const text = readText(orderId);
      if (!text || Date.now() - text.savedAt > DRAFT_TTL_MS) expired.push(orderId);
    }
  } catch {
    return;
  }
  for (const orderId of expired) {
    await clearDraft(orderId);
  }
}
