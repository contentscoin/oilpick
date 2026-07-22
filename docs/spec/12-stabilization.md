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

## 계층 1 — P1 코드 결함 (확정 — 즉시 수정 대상)

### S1. PostGIS 좌표 파싱 — GeoJSON 가정의 죽은 분기 3곳 【P1】
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

### S2. AddressField — 주소검색 미구현 분기 【P1, 가입 크리티컬】
`apps/user/src/components/AddressField.tsx:28`: `if (hasKakaoKey) return null;` — **카카오 키가
설정된 프로덕션에서는 가입 화면의 주소 입력 UI가 통째로 사라진다**(연동 미구현 자리표시).
키가 없으면 수동 폴백이 뜨지만 **기본 좌표(집하장 인근)가 그대로 저장** — 매장 실좌표가 아닌
주문이 쌓여 라이더 거리·지도·내비가 전부 어긋난다(데이터 오염).

**수정 계획**:
1. **Daum 우편번호 위젯**(postcode.v2.js — **API 키 불필요**)으로 주소검색 구현.
2. 주소→좌표 변환은 **VWorld Geocoder API**(이미 발급한 인증키 재사용, `api.vworld.kr/req/address`)
   — 카카오 REST 키 신규 발급 없이 해결. 실패 시 수동 좌표 폴백 유지.
3. (선택 고도화) MapView로 지도핀 미세조정(03-frontend U2 원 스펙 "지도핀 미세조정" 복원).
4. **기존 데이터 보정**: 이미 가입된 supplier_profiles.location이 기본 좌표인 행 식별
   (기본값과 일치 여부) → 마이페이지 "매장 주소 수정" 화면(기존에 없으면 신설)로 재설정 유도.
**수용 기준**: 키 유무와 무관하게 주소검색→좌표 저장이 동작, `VITE_KAKAO_KEY`는 더 이상 주소
입력의 게이트가 아님(03-frontend·env 문서 동기화).

## 계층 2 — P2 미구현·열화 (스펙 약속 대비)

### S3. user 주문상세 — 라이더 위치 실시간·지도 실좌표 【P2】
`apps/user/src/pages/OrderDetailPage.tsx`: ① 지도 센터가 하드코딩(마곡) — 주문의
pickup_location을 파싱해 실좌표 센터+핀으로. ② 03-frontend U7이 약속한 "라이더 위치 Realtime"
미배선(주석으로 유예) — rider-location이 갱신하는 `rider_profiles.last_location`을
postgres_changes로 구독(배정 라이더 row, RLS p_rider_read_assigned 확인)해 지도에 라이더
마커 표시. ③ placeholder의 데모 ETA("12분 후 도착") 제거 — 실데이터 없으면 미표기(00-domain
"장식 프리뷰에 임의 시간 표기 금지" 원칙 정합). 11-map-renderer M9-b(경로선·ETA)의 전 단계.

### S4. rider 콜 목록/상세 — S1 후 실측 검증 【P2】
S1 수정 후: 거리순 정렬·거리 표기·콜 상세 지도 센터·M9-a 내비 딥링크 좌표를 로컬 스택
실데이터로 검증(qa-checklist 갱신). 좌표 null 콜의 UI(거리 미표기·지도 프리뷰) 확정.

### S5. 실기기/실서비스 검증 항목 (qa-checklist 🔴 재확인)
- Capacitor WebView WebGL(MapLibre) 실기기, 카카오맵/TMap 딥링크 앱 호출, FCM 실푸시,
  QR 카메라, OTP 실SMS — 코드가 아니라 **실기기·시크릿 확보 후 검증**이 필요한 것들.
  "안 된다" 목록에서 이 부류(환경 부재)와 결함을 구분해 관리한다.

## 작업 순서 (코딩 세션 지시)
1. **사용자**: 0-1 확인(1분 SQL) → 미실행이면 컷오버 → 0-2 시세 tick·admin 계정 → 재현 테스트.
2. S1(좌표 파서 통일 — 파급 최대·리스크 최소) → S2(주소 입력 재구현+보정) → S3 → S4.
3. 각 태스크: 스펙 문서(00/01/02/03) 동기화 → 구현 → 게이트(lint/test/build+pgTAP) →
   로컬 스택 실측 → 커밋/PR. 13-org-dealer.md(좌상 구조)는 안정화 뒤 착수 권장.
