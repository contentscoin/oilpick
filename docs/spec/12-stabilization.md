# 12 — 안정화: 3앱 기능 점검 결과 + 수정 계획 (S-태스크)

2026-07-22 CEO 보고 "전체 기능이 각 앱에서 제대로 작동하지 않는 게 많다"에 대한 **점검 결과와
수정 기획의 단일 진실**. 점검은 코드 감사(통합 이음새 중심 — 단위 테스트 838개는 green이므로
테스트가 모킹으로 가리는 지점을 의심) + 배포 상태 원격 검증 시도로 수행했다.
**이 문서는 기획만 담는다 — 구현은 후속 코딩 세션이 S-태스크 순서대로 진행한다.**

## 진단 요약 — "왜 많은 기능이 안 되나"

원인은 한 가지가 아니라 **세 계층이 겹쳐 있다**. 위 계층일수록 증상이 전면적이다.

| 계층 | 원인 | 영향 범위 |
|---|---|---|
| 0. 배포/환경 | 프로덕션 DB 컷오버·초기 데이터·시크릿 미완 | 수거 요청/지급/출금/레퍼럴 등 **서버 의존 기능 전부** |
| 1. P1 코드 결함 | 좌표 파싱 죽은 분기, 주소 입력 미구현 분기 | 콜 목록/지도/거리/가입/최근주소 |
| 2. P2 미구현·열화 | 스펙이 약속했으나 미배선(라이더 위치 실시간 등) | 개별 화면 완성도 |

## 계층 0 — 배포/환경 (코드 수정 없이 해소, **최우선 확인**)

### 0-1. 프로덕션 Supabase 컷오버 실행 여부 ⚠️ 전면 증상의 1순위 용의자
main의 앱은 08/09 스키마(payout_method·referrals·출금 부활)와 Edge 함수 15종을 전제한다.
`bash scripts/deploy-cutover.sh`(supabase login 필요)가 **실행되지 않았다면**: 수거 요청(신계약
order-create), 지급수단 선택, 포인트 적립, 출금, 레퍼럴 전 기능이 서버 에러로 실패한다 —
"전체가 안 된다"는 체감과 정확히 일치한다.
- 이 세션에서 원격 실증을 시도했으나 네트워크 정책으로 차단됨(미실행/실행 여부 미확정).
- **확인법(1분)**: Supabase 대시보드 → SQL Editor → `select count(*) from referrals;`
  - 에러(relation does not exist) → **컷오버 미실행** → `bash scripts/deploy-cutover.sh` 실행.
  - 정상(0 이상) → 컷오버 완료 — 계층 1로.
  - 병행 확인: 대시보드 → Edge Functions 목록에 `referral-code`/`withdraw-request`가 있는가.

### 0-2. 프로덕션 초기 데이터 (DEPLOY.md §1-1)
- **시세 tick 0건이면 수거 요청이 무조건 404**("현재 시세 정보를 찾을 수 없어요") — admin 웹
  시세 관리에서 첫 매입가 1회 설정 필수.
- admin 계정 미생성이면 admin 웹 로그인 자체가 불가(SQL Editor 1회 생성 — DEPLOY.md 절차).
- 전화 OTP: 프로덕션 SMS 프로바이더(Twilio 등) 미설정이면 **실사용자 가입 불가**(DEPLOY.md §1-2).

### 0-3. 앱 환경변수/시크릿
- `VITE_MAP_STYLE_URL`(3앱): 설정 완료(2026-07-22, VWorld 개발키) — 키 **승인 상태**와 **서비스
  URL에 vercel.app 3도메인 등록**이 안 되면 타일 403 → 회색 지도(11-map-renderer.md M8-2).
- `FCM_SERVICE_ACCOUNT` 미설정 → 푸시 무발송(no-op, 알림 테이블만 기록). 실푸시는 키 설정 후.

## 계층 1 — P1 코드 결함 (✅ 수정 완료 — 2026-07-22)

### S1. PostGIS 좌표 파싱 — GeoJSON 가정의 죽은 분기 3곳 【P1 ✅ 완료】
**구현**: core `parseGeographyPoint`(hex EWKB·GeoJSON 겸용) 단일 파서로 통일, 4개 호출부
(useOpenCalls·useRecentAddresses·useDepotsAdmin·useDashboard) 교체, (0,0) 폴백 제거→null 강등.
CallCard 거리 nullable("—"), CallHomePage 거리정렬·CallDetailPage 지도 센터 null 처리. 회귀
테스트(core geo 3케이스 + CallCard null). 아래는 원 진단 기록.

### S1(원 진단). PostGIS 좌표 파싱 — GeoJSON 가정의 죽은 분기 3곳 【P1】
실제 Supabase REST(PostgREST)는 geography(point)를 **WKB hex 문자열**("0101000020E610…")로
반환한다 — `apps/admin/src/hooks/useDashboard.ts:205`의 주석에 로컬 스택 curl 실증 기록이 있다.
그런데 3개 훅이 GeoJSON 객체(`{coordinates:[lng,lat]}`)만 처리한다(죽은 분기):

| 파일 | 증상 |
|---|---|
| `apps/rider/src/hooks/useOpenCalls.ts:28` | 모든 콜 좌표 **(0,0) 폴백** → 거리순 정렬 붕괴·거리 ~13,000km 표기, **콜 상세 지도 센터가 대서양(0,0)** — 실지도(VWorld는 한국 주변만 타일 제공) 활성 후엔 빈 지도. "지도 안 나옴" 체감의 직접 원인 |
| `apps/user/src/hooks/useRecentAddresses.ts:20` | null → 필터 → **최근 주소가 항상 빈 목록** |
| `apps/admin/src/hooks/useDepotsAdmin.ts:19` | 집하장 좌표 소실(08 일몰 화면이라 우선순위 낮음) |

**수정 계획**:
1. `packages/core/src/geo.ts`의 `parseEwkbPoint`를 **GeoJSON 객체 입력도 수용**하도록 확장
   (또는 `parseGeographyPoint` 명칭으로 통합 — hex EWKB·GeoJSON 겸용, admin
   `useDashboard.parseGeographyPoint`의 검증된 로직을 core로 승격). 단일 진실화(CLAUDE.md 규칙 7).
2. 4곳(useOpenCalls·useRecentAddresses·useDepotsAdmin·useDashboard) 전부 core 파서로 교체.
   **(0,0) 폴백 금지** — 파싱 실패는 null로 강등하고 UI가 "좌표 없음"을 다루게 한다
   (useOpenCalls는 현재 {0,0}을 유효 좌표처럼 반환하는 것이 2차 버그).
3. 회귀 테스트: hex EWKB(SRID 유/무)·GeoJSON·비정상 입력 픽스처를 4개 훅 테스트에 공통 적용.
**수용 기준**: 로컬 스택(또는 pg-harness + PostgREST 계약 픽스처)에서 실제 hex 응답으로 콜
목록 좌표·거리·최근 주소·대시보드 핀이 정상 값.

### S2. AddressField — 주소검색 미구현 분기 【P1 ✅ 완료】
**구현**: `if (hasKakaoKey) return null` 죽은 분기 제거 — 항상 동작하는 주소 입력 렌더.
[주소 검색] = Daum 우편번호 위젯(무키, `lib/daumPostcode.ts`) → VWorld Geocoder
(`lib/geocode.ts`, `VWORLD_KEY`는 env 또는 MAP_STYLE_URL에서 추출) → 좌표 확정. 실패·위젯
미로드 시 수동 좌표 입력 폴백. **좌표 미확정(lat/lng null)이면 RequestPage `다음`·AuthPage
`가입 완료` 버튼이 잠긴다 → 기본 좌표 저장(데이터 오염) 근본 차단.** 주소를 손으로 고치면
좌표 재확정 필요(오염 방지). 테스트: AddressField 6·RequestPage 게이트·AuthPage 좌표 게이트.
아래는 원 진단 기록.

### S2(원 진단). AddressField — 주소검색 미구현 분기 【P1, 가입 크리티컬】
`apps/user/src/components/AddressField.tsx:28`: `if (hasKakaoKey) return null;` — **카카오 키가
설정된 프로덕션에서는 가입 화면의 주소 입력 UI가 통째로 사라진다**(연동 미구현 자리표시).
키가 없으면 수동 폴백이 뜨지만 **기본 좌표(집하장 인근)가 그대로 저장** — 매장 실좌표가 아닌
주문이 쌓여 라이더 거리·지도·내비가 전부 어긋난다(데이터 오염).

**수정 계획**:
1. **Daum 우편번호 위젯**(postcode.v2.js — **API 키 불필요**)으로 주소검색 구현.
   ⚠️ 스크립트 경로는 `https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js`(공식 임베드 경로).
   최초 구현(b901e4e)이 쓴 `mapjsdk/mapcomponent/postcode/postcode.v2.js`는 **존재하지 않는 경로**라
   CDN이 403을 돌려줬고, 프로덕션에서 주소검색이 통째로 동작하지 않았다. 키·도메인 등록 문제가 아니다.
   또한 로더는 "사용자 취소"와 "위젯 로드 실패"를 구분해 반환해야 한다(`PostcodeResult`) —
   둘 다 null로 뭉개면 AddressField가 조용히 return해 **버튼이 먹통으로 보인다**(실제 증상).
   로드 실패 시에는 안내를 띄우고 좌표 수동 입력을 열어 진행 경로를 남긴다.
2. 주소→좌표 변환은 **VWorld Geocoder API**(이미 발급한 인증키 재사용, `api.vworld.kr/req/address`)
   — 카카오 REST 키 신규 발급 없이 해결. 실패 시 수동 좌표 폴백 유지.
3. (선택 고도화) MapView로 지도핀 미세조정(03-frontend U2 원 스펙 "지도핀 미세조정" 복원).
4. **기존 데이터 보정**: 이미 가입된 supplier_profiles.location이 기본 좌표인 행 식별
   (기본값과 일치 여부) → 마이페이지 "매장 주소 수정" 화면(기존에 없으면 신설)로 재설정 유도.
**수용 기준**: 키 유무와 무관하게 주소검색→좌표 저장이 동작, `VITE_KAKAO_KEY`는 더 이상 주소
입력의 게이트가 아님(03-frontend·env 문서 동기화).
**운영 검증 필요(🔴)**: VWorld Geocoder를 브라우저에서 fetch 호출 시 CORS가 막힐 수 있다
(VWorld API는 서버 호출 전제). 프로덕션에서 주소 검색 후 좌표가 잡히는지 실측 →
막히면 geocode.ts를 JSONP(script + callback) 또는 Edge Function 프록시로 전환. 어느 경우든
좌표 미확정 시 제출이 막히므로 **데이터 오염은 발생하지 않는다**(최악의 경우 수동 입력 강등).

## 계층 2 — P2 미구현·열화 (스펙 약속 대비)

### S3. user 주문상세 — 지도 실좌표 + 데모 ETA 제거 【✅ 완료 — 2026-07-25】
✅ ① 지도 센터를 주문 `pickup_location` 파싱 실좌표(+핀)로 교체(useOrder에 pickupLat/Lng 추가, core 파서).
✅ ③ 데모 ETA("12분 후 도착") 제거 — 00-domain "장식 프리뷰에 임의 시간 표기 금지" 정합.
✅ ② **라이더 위치 + 실 ETA 완료**(14 J1 + 11 M9-b):
  - 위치는 원 진단의 `rider_profiles.last_location` postgres_changes 구독 대신 **broadcast 채널
    `order:{id}:location` 구독**으로 구현했다 — rider-location Edge가 실제로 push하는 경로가 그쪽이고
    (02-api.md), 15초 간격 좌표를 테이블 왕복 없이 받는다. 채널은 private + realtime.messages RLS로
    당사자만 구독(무인증 GPS 도청 차단). `useRiderLocation` + MapView `riderMarker`(60초 무갱신 흐림).
  - ETA는 `useDirections` → directions Edge(카카오모빌리티) 실 라우팅 값. `formatEta`로 라벨링하고
    MapView `routePath`로 경로선까지 그린다. `KAKAO_MOBILITY_KEY` 미설정 시 Edge가 `configured:false`를
    주므로 선·ETA가 자연히 미표시(조용한 비활성) — 가짜 시간 표기 금지 원칙 유지.

### S4. rider 콜 목록/상세 — S1 후 실측 검증 【P2】
S1 수정 후: 거리순 정렬·거리 표기·콜 상세 지도 센터·M9-a 내비 딥링크 좌표를 로컬 스택
실데이터로 검증(qa-checklist 갱신). 좌표 null 콜의 UI(거리 미표기·지도 프리뷰) 확정.

### S6. `PICKED_UP` 주문은 운영자가 꺼낼 수 없다 — 상태머신 막다른 길 【P2, 미수정·기록】

**증상(2026-07-26 프로덕션 실측)**: 레거시 `PICKED_UP` 주문 1건이 남아 라이더 한 명이 영구히
콜을 받지 못했다. 라이더당 활성 주문 1건 제약(`idx_rider_single_active_order`)과 order-accept
가드가 `PICKED_UP`을 활성으로 세기 때문이다.

**막다른 길인 이유** — `PICKED_UP`에서 나가는 경로가 전부 닫혀 있다:

| 액션 | 허용 상태 | `PICKED_UP` |
|---|---|---|
| `CANCEL`(admin) | `ACCEPTED`·`ARRIVED`·`DISPUTED` | ❌ 목록에 없음 |
| `FORCE_COMPLETE`(admin) | `ARRIVED` + 계량 존재 | ❌ |
| `DELIVER`(rider) | `PICKED_UP` → `COMPLETED` | ⚠️ RPC에는 있으나 **호출 UI가 없다** |

`DELIVER`는 `fn_transition_order`에 그대로 살아 있지만, 07 F13이 집하장 개념을 폐기하며 라이더 앱의
호출부와 어드민 `/depots` 메뉴·라우트를 제거했다(`AdminShell.tsx` 주석 참조). 스캐너 모듈
(`apps/rider/src/lib/native/scanner.ts`)만 잔존한다. 즉 **RPC는 있는데 누를 버튼이 없다.**

**행 삭제도 불가** — 해당 주문에는 `point_ledger` 참조가 있다(실측: 점주 `EARN` +405,000,
라이더 `HOLD` 2,000). `point_ledger.order_id`는 cascade가 아니라 FK 위반으로 막히고, 애초에
포인트 원장은 append-only 감사 기록이라 삭제 대상이 아니다.

**취소는 의미상으로도 틀리다** — `EARN`이 이미 발행됐다는 건 거래가 성립했다는 뜻이다. 취소하면
지급은 남고 주문만 사라져 대사가 어긋난다. (초기에 "CANCEL 허용 상태에 `PICKED_UP` 추가"를
검토했으나 원장 확인 후 폐기 — 맞는 방향은 **완료 처리**다.)

**현재 판단(CEO, 2026-07-26): 방치.** 신 모델은 `PICKED_UP`을 생성하지 않으므로(07 이후 경로는
`ARRIVED → COMPLETED`) 재발하지 않고, 영향은 테스트 라이더 1명이 묶이는 것뿐이다.

**수정하게 된다면** 두 갈래:
1. 어드민 `FORCE_COMPLETE` 허용 상태에 `PICKED_UP` 추가 — 원장은 `on conflict do nothing`으로
   멱등이라 EARN 중복 지급은 없다. 단 `fn_settle_trade`가 `final_kg` 기준으로 도는데 레거시 주문에
   `final_kg`가 없으면 전무거래로 거부되므로 사전 확인 필요.
2. **레거시 완결 전용 어드민 액션 신설**(권장) — `PICKED_UP → COMPLETED`만 하고 원장은 손대지 않는
   경로. `DELIVER`가 이미 정확히 그 일을 하므로 어드민에 진입점만 붙이는 수준이다.

⚠️ 레거시 데이터를 손대거나 상태머신을 확장할 때 이 항목을 먼저 볼 것.

### S5. 실기기/실서비스 검증 항목 (qa-checklist 🔴 재확인)
- Capacitor WebView WebGL(MapLibre) 실기기, 카카오맵/TMap 딥링크 앱 호출, FCM 실푸시,
  QR 카메라, OTP 실SMS — 코드가 아니라 **실기기·시크릿 확보 후 검증**이 필요한 것들.
  "안 된다" 목록에서 이 부류(환경 부재)와 결함을 구분해 관리한다.

## 작업 순서 (코딩 세션 지시)
1. **사용자**: 0-1 확인(1분 SQL) → 미실행이면 컷오버 → 0-2 시세 tick·admin 계정 → 재현 테스트.
2. S1(좌표 파서 통일 — 파급 최대·리스크 최소) → S2(주소 입력 재구현+보정) → S3 → S4.
3. S6는 **의도적 미수정**(CEO 판단) — 신 모델 미도달이라 재발 없음. 레거시 데이터 정리나
   상태머신 확장 시에만 꺼내 볼 것.
3. 각 태스크: 스펙 문서(00/01/02/03) 동기화 → 구현 → 게이트(lint/test/build+pgTAP) →
   로컬 스택 실측 → 커밋/PR. 13-org-dealer.md(좌상 구조)는 안정화 뒤 착수 권장.
