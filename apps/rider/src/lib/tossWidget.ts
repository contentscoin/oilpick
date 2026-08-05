// 토스페이먼츠 결제위젯 로더(07 F4 — [17 Q3] 복권, a4b4fdd^ 원형 그대로). SDK
// (@tosspayments/tosspayments-sdk v2)를 얇게 감싸 화면이 의존하는 최소 인터페이스
// (TossWidgetHandle)만 노출한다. 테스트는 이 로더를 주입/모킹해 실 네트워크·실 SDK 없이
// 결제 화면 로직을 검증한다(태스크 지시: SDK 모킹, 실 위젯 E2E 보류). 기본 PG는 코엠(17 C3)
// 이라 이 로더는 토스 레거시 분기에서만 쓰인다.

import { loadTossPayments, ANONYMOUS } from "@tosspayments/tosspayments-sdk";

export interface TossPaymentRequest {
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
}

/** 결제 화면이 사용하는 위젯 조작 최소 집합. */
export interface TossWidgetHandle {
  /** 결제 금액 설정(원). renderPaymentMethods 전에 호출. */
  setAmount(value: number): Promise<void>;
  renderPaymentMethods(selector: string): Promise<void>;
  renderAgreement(selector: string): Promise<void>;
  /** 결제 요청 → successUrl/failUrl로 리다이렉트. */
  requestPayment(req: TossPaymentRequest): Promise<void>;
}

export type TossWidgetLoader = (clientKey: string) => Promise<TossWidgetHandle>;

/** 실 SDK 로더(가맹/테스트 키 발급 후 동작). ANONYMOUS 고객키로 1회성 결제. */
export const loadTossWidget: TossWidgetLoader = async (clientKey) => {
  const tossPayments = await loadTossPayments(clientKey);
  const widgets = tossPayments.widgets({ customerKey: ANONYMOUS });
  return {
    async setAmount(value) {
      await widgets.setAmount({ currency: "KRW", value });
    },
    async renderPaymentMethods(selector) {
      await widgets.renderPaymentMethods({ selector, variantKey: "DEFAULT" });
    },
    async renderAgreement(selector) {
      await widgets.renderAgreement({ selector, variantKey: "AGREEMENT" });
    },
    async requestPayment(req) {
      await widgets.requestPayment(req);
    },
  };
};
