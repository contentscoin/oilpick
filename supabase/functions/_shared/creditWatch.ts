// [16 L8] 좌상 크레딧 경보 판정 — 순수 함수. settlement-watch(cron)가 유일한 소비자.
// EF 통합 테스트 하네스가 없으므로(16 §0-4) 판정을 분리해 deno test로 고정한다.

/** 80% 밴드 — 16 §10-2 권고 기본값(임계·한도 자체는 좌상별 dealer_accounts 설정 그대로). */
export const CREDIT_BAND_RATIO = 0.8;

export interface CreditWatchRow {
  usage: number;
  credit_limit: number;
  over_threshold: boolean;
}

export interface CreditAlerts {
  /** usage/credit_limit ≥ 80% — 한도 하드스톱(DEALER_LIMIT_EXCEEDED) 예방 경보. */
  band80: boolean;
  /** 미정산 사용액 ≥ claim_threshold — admin 청구 검토 유도(자동청구 없음, 14 §4 불변). */
  overThreshold: boolean;
}

export function dueCreditAlerts(row: CreditWatchRow): CreditAlerts {
  return {
    // 한도 0(미설정·잠금)은 비율 판정 불능 — 경보 대상 아님(0으로 나누기 방지).
    band80: row.credit_limit > 0 && row.usage >= row.credit_limit * CREDIT_BAND_RATIO,
    overThreshold: row.over_threshold === true,
  };
}
