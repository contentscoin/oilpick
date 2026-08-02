// [16 L5] SUBMIT_MEASURE 계량 확인 요청 카피 — 순수 함수.
// order-transition(최초 발송)과 confirm-remind(라이더 수동 재발송)가 같은 카피를 쓴다
// (00-domain 알림 매트릭스 "SUBMIT_MEASURE" 행이 단일 진실 — 두 경로의 문구가 갈리면 안 된다).
// [14 J4] N = 예상 **순액**(폐유 총액 − 신유 대금) — 상계 주문에서 폐유 총액을 그대로 통지하면
// 점주가 실제와 다른 금액을 보고 확인하게 된다.

import { estimateCash, formatKg, formatKrw, formatPoint } from "@oilpick/core/index.ts";

export interface MeasureNotifyOrder {
  measured_kg: number | string | null;
  snapshot_price_per_kg: number;
  delivered_cans: number | null;
  snapshot_fresh_can_price: number | null;
  payout_method: string | null;
}

export function submitMeasureNotification(order: MeasureNotifyOrder): { title: string; body: string } {
  const kg = Number(order.measured_kg ?? 0);
  const waste = estimateCash(kg, order.snapshot_price_per_kg);
  const purchase = (order.delivered_cans ?? 0) * (order.snapshot_fresh_can_price ?? 0);
  const net = waste - purchase;
  const isPoint = order.payout_method === "POINT";
  let tail: string;
  if (net > 0) {
    tail = isPoint
      ? `확인하시면 포인트 ${formatPoint(net)}가 적립돼요.`
      : `현금 ${formatKrw(net)}을 확인해 주세요.`;
  } else if (net < 0) {
    // 신유 대금이 폐유 수령액보다 큰 경우 — 점주가 지불하는 방향.
    tail = isPoint
      ? `확인하시면 새 기름 대금으로 포인트 ${formatPoint(-net)}가 차감돼요.`
      : `새 기름 대금 현금 ${formatKrw(-net)} 지불을 확인해 주세요.`;
  } else {
    tail = "폐유 금액과 새 기름 대금이 같아 주고받을 금액은 없어요.";
  }
  return {
    title: "계량 결과 도착",
    body: `계량 결과가 도착했어요 — 무게 ${formatKg(kg)}, ${tail}`,
  };
}
