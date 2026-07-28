# 15 — 모션 디자인 고도화 (beUI 패턴 적용, K-태스크)

2026-07-28 CEO 제공 목업(`payou 모바일 앱 x beUI 고도화`)을 반영한 6차 고도화.
**이 문서가 모션 컴포넌트·모션 토큰·확장 팔레트의 단일 진실이다.**

05-design-upgrade.md(질감·깊이·위계)가 *정적* 완성도를 올렸다면, 15는 *시간 축*을 다룬다.
정보구조(03-frontend.md)와 상태머신(00-domain.md)은 건드리지 않는다 — 화면 수·라우팅·전이 규칙 불변.

## 원칙

1. **모션은 장식이 아니라 상태 서술이다.** 각 모션은 "지금 무엇이 바뀌었는가 / 다음에 무엇을
   해야 하는가" 중 하나를 답해야 한다. 답하지 못하는 모션은 넣지 않는다.
2. **50대 사장님 원칙 유지.** base 16px 미만 금지, 터치 타깃 48px, 전문용어 금지는 그대로다.
   모션이 가독성을 깎으면 모션을 버린다.
3. **`prefers-reduced-motion` 절대 준수.** 모든 신규 컴포넌트는 `usePrefersReducedMotion()`
   또는 CSS `@media (prefers-reduced-motion: reduce)`로 정지 경로를 갖는다. 정지 시에도
   **정보는 100% 동일**해야 한다(모션에만 담긴 정보 금지 — 예: 카운트업 중간값이 유일한 표시 X).
4. **금액·수치는 모션 후 최종값이 진실이다.** NumberFlow의 중간 프레임은 표시 전용이며,
   접근성 트리(`aria-live`/텍스트)에는 최종값만 노출한다. 원장·정산 로직과 무관.

## 팔레트 확장 (CEO 결정 2026-07-28 — "목업 그대로")

10-brand.md B6의 로고 팔레트(딥그린·크림·골드)는 **브랜드 아이덴티티로 불변**이다.
아래는 그 위에 얹는 **UI 액센트 확장**이며, 리브랜딩이 아니다.

| 토큰 | 값 | 용도 | 제약 |
|---|---|---|---|
| `colors.lime.DEFAULT` | `#CCFF66` | 다크 서피스 위 강조(Island 도트, 성공 pill, 스와이프 액션) | **다크 배경 전용.** 흰 배경 위 텍스트 금지(대비 미달) |
| `colors.lime.soft` | `rgba(204,255,102,0.32)` | 밝은 배경 위 pill 배경(텍스트는 `primary.dark`) | 배경으로만 |
| `colors.cyan.DEFAULT` | `#5EE6F2` | 라이더 앱 실시간/추적 상태 강조 | 다크 배경 전용 |
| `surfaceDark.beui` | `#08090A` | beUI식 최심층 배경(Island 본체) | |
| `surfaceDark.panel` | `#101317` | 다크 패널(지갑 카드·정산 블록·예상액 바) | |

> **왜 라임인가** — 기존 `chart.lineOnDark(#4ADE9B)`는 딥그린 명도 확장이라 다크 히어로 위에서
> 브랜드와 *너무 가깝게* 붙는다. 라임은 "지금 살아 있다(live)"는 상태 신호를 브랜드 그린과
> 분리해 읽히게 한다. 대신 **밝은 배경 위 텍스트로는 절대 쓰지 않는다** — 4.5:1 미달.

## 모션 토큰 확장 (`tokens.ts` motion)

기존 `fast/base/slow/ease`에 추가:

| 토큰 | 값 | 용도 |
|---|---|---|
| `motion.spring` | `cubic-bezier(0.23,1,0.32,1)` | 시트 등장·아일랜드 확장(감속 강조) |
| `motion.sheet` | `600ms` | Bottom Sheet 등장 |
| `motion.count` | `900ms` | NumberFlow 카운트업/롤링 |
| `motion.pulse` | `3s` | Island 호흡, 라이브 도트 |

## 컴포넌트 매핑 (목업 → payou 화면)

`packages/ui`에 신설. 각 컴포넌트는 vitest 테스트 필수(CLAUDE.md 절대규칙 8은 원장·상태머신·매칭
한정이지만, 15 신규 컴포넌트는 렌더/reduced-motion 경로 테스트를 필수로 둔다).

| 신규 컴포넌트 | 대응 화면 | 무엇을 말하는가 |
|---|---|---|
| `OtpInput` | user `AuthPage` | 자리별 입력 진행, 성공 체크, 오류 흔들림 |
| `DynamicIsland` | user `HomePage`·`OrderDetailPage`, rider `ActiveRunPage` | 지금 진행 중인 단 하나의 상태(ETA·배정 대기·도착) |
| `NumberFlow` | user 홈 예상액·`RequestPage` 예상 수령액, rider 계량·실적 | 값이 *바뀌었다*는 사실 자체 |
| `SwipeableRow` | user `WalletPage` 원장 행 | 행에 숨은 액션(영수증·문의)이 있다 |
| `HeroCard` | user 홈, rider 운행·실적 | 이 화면의 주인공 숫자 |
| `LiveDot` | Island·체크리스트 | 실시간 갱신 중 |
| `CheckList` | rider `ActiveRunPage` | 현장 절차의 남은 단계 |

기존 컴포넌트 재사용(신설 금지): `BottomSheet`, `QtyStepper`, `PhotoUploader`, `OrderTimeline`,
`PointBalanceCard`, `CallCard`, `Toast`/`ToastProvider`, `MapView`, `TabBar`, `PageHeader`.

## 화면별 적용 (10화면)

**사용자 앱**
| 화면 | 적용 |
|---|---|
| `AuthPage` | `OtpInput` — 6자리 슬롯, 활성 슬롯 포커스 링, 성공 시 체크 |
| `HomePage` | `DynamicIsland`(평균 배정 시간) + `HeroCard`+`NumberFlow`(통 수→예상액) |
| `RequestPage` | `BottomSheet` 흐름 유지 + 예상 수령액 다크 바에 `NumberFlow` |
| `OrderDetailPage` | 지도 위 `DynamicIsland`(ETA·거리) + 시트 내 `OrderTimeline` |
| `WalletPage` | 다크 `PointBalanceCard` + 원장 `SwipeableRow`(영수증) |

**라이더 앱**
| 화면 | 적용 |
|---|---|
| `CallHomePage` | `DynamicIsland`(콜 수신 중) + 신규 콜 스택(`oilpick-stagger` 재사용) |
| `CallDetailPage` | 시트 하단 액션바 — 수락을 시각적 1순위로 |
| `ActiveRunPage` | `DynamicIsland`(ETA) + `HeroCard` + `CheckList`(방문 체크) |
| `ActiveRunPage` 계량 | `PhotoUploader` 유지 + 최종 지급액 `NumberFlow` |
| `EarningsPage` | `HeroCard` count-up + 일별 막대 |

## 하지 않는 것 (범위 밖 — 명시)

- 라우팅/화면 수 변경, 상태머신 전이 변경, API 변경 — **없음**
- `admin` 앱 — 범위 밖(shadcn 독립, 03-frontend.md 그대로)
- 제스처 라이브러리 도입 — 없음. `SwipeableRow`는 포인터 이벤트로 자체 구현
- 애니메이션 라이브러리(framer-motion 등) 추가 — **금지**. CSS + rAF만 사용(번들 규율)

## 완료 기준

- [ ] `pnpm lint` / `pnpm test` / `pnpm build` 3종 통과
- [ ] 신규 컴포넌트 전부 reduced-motion 경로 테스트 보유
- [ ] 라임/시안이 밝은 배경 위 텍스트로 쓰인 곳 0건
- [ ] 기존 화면 테스트 무회귀
