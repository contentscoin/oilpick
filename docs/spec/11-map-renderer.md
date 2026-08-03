# 11 — 지도 렌더러 평가: 카카오맵 vs mapcn(MapLibre)

2026-07-19 CEO 지시 "지도는 mapcn(mapcdn.dev로 오기) 적용 검토 + 실시간 네비게이션 가능?"에 대한
**결정 근거 문서**. CLAUDE.md "스택(변경 금지) — 지도: 카카오맵 JS SDK"에 걸린 항목이므로,
코드부터 갈아끼우지 않고 이 문서로 판단을 확정한 뒤 실행한다. 이 문서가 지도 렌더러 결정의 단일 진실.

> ⚠️ `mapcdn.dev`는 존재하지 않는 도메인(DNS 미해석). 실제 지시 대상은 **`mapcn.dev`**(mapcn)로 해석.

## M0. 결론 (TL;DR)
1. **mapcn/MapLibre로는 "실시간 네비게이션"이 안 된다.** mapcn은 *렌더링* 라이브러리다. 턴바이턴 내비는
   렌더러가 아니라 **라우팅 API + 안내 엔진 + 상시 GPS**의 문제이고, 이는 카카오든 MapLibre든 **별도**로 붙여야 한다.
2. 렌더러 교체 자체는 네비게이션 목표를 진전시키지 못하며, 한국에서는 타일 소스를 잘못 고르면 **지도
   데이터 품질이 내려간다**(아래 M5). 1차 권고는 카카오 유지였으나 **CEO 지시로 교체 확정**(M7 결정 이력).
3. **내비게이션의 실제 가치**는 렌더러와 무관한 두 트랙에 있다(M9): (a) 길찾기 앱 딥링크 핸드오프에 실제
   좌표를 실어 카카오맵/TMap이 턴바이턴을 담당(저비용·한국 최적 — **M9-a 구현 완료**), (b) 선택적으로 인앱
   실시간 위치·경로 표시(MapLibre 렌더 + 카카오모빌리티 라우팅 폴리라인 + Capacitor Geolocation — 후속).
4. 교체 경로는 **MapLibre + env 주입 타일(한국은 VWorld 권장)**이며 마이그레이션 면은 좁다(M6·M8 — 구현
   완료). 타일 URL 미설정 시 기존 일러스트 프리뷰 폴백이 그대로 동작한다(안전 롤아웃).

## M1. 가장 중요한 구분 — 렌더러 ≠ 라우팅 ≠ 턴바이턴
"실시간 네비게이션"을 렌더러 선택 문제로 오해하면 안 된다. 세 계층이 완전히 별개다:

| 계층 | 하는 일 | 카카오 | mapcn/MapLibre |
|---|---|---|---|
| **렌더러** | 타일·마커·내가 준 경로선을 화면에 그림 | 카카오맵 SDK | MapLibre GL(mapcn이 감쌈) |
| **라우팅(경로계산)** | 출발→도착 도로 경로·거리·ETA 산출 | 카카오모빌리티 Directions | ❌ 없음 — OSRM/Valhalla/ORS/카카오모빌리티 별도 |
| **턴바이턴 안내** | 회전 안내·이탈 재탐색·음성·상시 GPS | 카카오내비(앱/SDK) | ❌ 없음 — 직접 구현 또는 국내 내비 SDK |

**mapcn이 채우는 건 첫 줄(렌더러) 하나뿐.** 라우팅·턴바이턴은 렌더러를 뭘 쓰든 그대로 남는 숙제다.

## M2. mapcn 실체 (조사 결과)
- 출처: <https://www.mapcn.dev>, <https://github.com/AnmolSaini16/mapcn> (라이선스 MIT).
- **MapLibre GL JS 기반 React 컴포넌트 라이브러리**(shadcn/ui 스타일, Tailwind 테마). "컴포넌트를 프로젝트에
  복사해 커스터마이즈"하는 방식.
- 제공: 베이스맵, 마커/팝업/툴팁, **"Routes"(내가 이미 가진 좌표 배열을 선으로 그림 — 경로를 *계산*하는 게
  아님)**, 컨트롤 버튼(줌/나침반/현위치/전체화면 — 이게 소개의 "navigation controls"이며 **턴바이턴이 아님**).
- 타일 기본값 **CARTO(OSM 기반)** — 상업적 사용은 **CARTO Enterprise 라이선스 필요**. "다른 MapLibre 호환
  타일로 교체 가능"이라고 명시.
- 결론: 렌더링 DX·테마는 훌륭하나, 이 앱이 필요로 하는 "네비게이션"과는 층위가 다르다.

## M3. 이 앱이 지도에 실제로 요구하는 것
폐식용유 수거 매칭이지 지도-헤비 제품이 아니다. 지도의 임무는 4가지뿐:
1. 수거지 핀 표시, 2. 라이더 위치 표시, 3. (선택) 경로선·ETA, 4. **운전 안내는 외부 내비 앱으로 핸드오프**.
현재 구현(`packages/ui/src/components/MapView.tsx`, `apps/rider/.../ActiveRunPage.tsx`):
- MapView = 카카오맵 래퍼. 키 없으면 장식 프리뷰(핀·스쿠터·경로 일러스트, 실좌표 아님).
- "길찾기 앱으로 이동" = `<a href="kakaomap://route">` 딥링크 핸드오프. **단, 좌표가 안 실려 있음**
  (하드코딩 `kakaomap://route`) — 카카오내비를 열지만 목적지가 안 넘어가는 **실제 갭**(M9-a에서 수정 대상).

## M4. 기능 대조 (이 앱 기준)
| 항목 | 카카오맵(현행) | mapcn/MapLibre |
|---|---|---|
| 한국 도로/라벨 데이터 | ★ 최상(국내 1위 지도) | △ CARTO/글로벌 OSM은 부실 / VWorld면 양호 |
| 주소검색 결합 | ★ AddressField가 이미 카카오 사용 | 그대로 카카오 필요(교체해도 안 사라짐) |
| 내비 핸드오프 | ★ `kakaomap://`·카카오내비 네이티브 | 동일하게 외부 앱 핸드오프(렌더러 무관) |
| 라우팅 폴리라인 | 카카오모빌리티 Directions | 별도 API(카카오모빌리티/OSRM 등) |
| 테마/디자인 자유 | △ SDK 스타일 제약 | ★ Tailwind·토큰 완전 커스터마이즈 |
| 벤더 독립 | △ 카카오 종속 | △ 부분 개선(주소검색은 여전히 카카오) |
| 번들 비용 | SDK는 외부 script(앱 번들 밖) | maplibre-gl **~230KB gzip**을 앱 번들에 추가 |
| 오프라인/셀프호스팅 | ✗ | ★ 가능(타일 셀프호스팅) |

## M5. 한국 데이터 제약 (핵심 리스크)
한국은 **정밀 측량·지도 데이터의 국외 반출 규제**(공간정보관리법)가 있어, 글로벌 OSM 기반 스택은 국내
도로 커버리지·주소·턴바이턴이 부실하다(구글맵 한국 운전경로가 약한 근본 이유). MapLibre 자체는 렌더러라
문제없지만 **타일·라우팅 데이터 소스**가 관건이다:
- **CARTO(mapcn 기본)·글로벌 MapTiler/OSM** → 한국 도로·상호·라벨 밀도 낮음. 상업 라이선스도 필요. **비권장.**
- **VWorld(국토교통부 브이월드, `api.vworld.kr`)** → **국내 서비스용 무료**, 한국 커버리지 양호, WMTS/래스터
  타일을 MapLibre에 연결 가능. **MapLibre를 한국에서 쓰려면 사실상 이 경로.** 도메인 등록·API 키 필요.
- 라우팅은 어차피 별도: 한국 턴바이턴/도로경로는 **카카오모빌리티·TMap·네이버**가 현실적(글로벌 OSRM은
  국내 커버리지·규제로 부적합).
- 이 환경에서 CARTO/OSM 타일 실물 확인은 egress 차단(HTTP 000)으로 불가 — 위는 문서화된 사실 기반 판단.

## M6. 마이그레이션 비용·영향 범위 (교체 가정 시)
- **교체면은 좁다**: `MapView`는 깔끔한 prop 인터페이스(`apiKey/center/markers/level/pickupLabel/etaLabel`)
  뒤의 단일 ~285줄 컴포넌트. 내부만 MapLibre로 바꾸면 호출부(`ActiveRunPage`·`CallDetailPage`)는 불변 가능.
- **의존성 신설**: `@oilpick/ui`는 현재 런타임 의존성이 `@oilpick/core` 하나뿐인 순수 컴포넌트 라이브러리.
  maplibre-gl(~230KB gzip)이 **첫 무거운 의존성**이 되며 ui를 쓰는 **3앱 전체 번들에 영향**(rider 공용 chunk가
  현재 gzip 108KB → 약 2배). 지연 로딩(dynamic import)으로 지도 화면에서만 로드하도록 코드 스플릿 필요.
- **VWorld 연동**: 키 발급·도메인 등록·스타일(JSON) 구성. `VITE_KAKAO_KEY`와 별개 env 추가.
- **테스트/폴백**: MapView 테스트(카카오 script id 검증)·장식 프리뷰 폴백 로직 재작성. Capacitor WebView에서
  MapLibre WebGL 동작 검증(iOS/Android 실기기 — WebGL 컨텍스트·성능).
- **스펙 개정**: CLAUDE.md 스택 항목·03-frontend.md MapView 절·README env 표를 함께 고쳐야 함(규칙 6·7).
- **잔존 카카오**: AddressField 주소검색은 카카오 유지 → "카카오 제거"가 아니라 "지도만 이원화"가 됨.

## M7. 결정 이력
- **1차 권고(2026-07-19, 본 문서 초판)**: 카카오맵 렌더러 유지(교체 보류) — 렌더러 교체가 내비 목표를
  진전시키지 못하고(M1), 글로벌 타일은 한국 데이터 다운그레이드(M5), 주소검색 카카오 잔존으로 벤더 독립
  명분 절반.
- **확정(2026-07-19, CEO 지시 "mapcn 적용해볼래")**: **MapLibre(mapcn 패턴) 렌더러로 교체.** 단, 위험을
  아래처럼 방어한다:
  - **타일 URL env 게이트**(`VITE_MAP_STYLE_URL`): 미설정 시 기존 일러스트 프리뷰 폴백 그대로 — 깨진
    회색 지도가 유저에게 노출되지 않는다. 실지도 활성화는 타일 확보(VWorld 권장) 후 env만 채우면 된다.
  - **한국 커버리지**: 프로덕션 타일은 VWorld(국토부) 사용을 강권(M5). CARTO 기본값은 상업 라이선스
    이슈로 채택하지 않는다.
  - **지연 로딩**: maplibre-gl(~230KB gzip)은 dynamic import — styleUrl 없는 화면/앱은 청크를 받지 않는다.
  - 주소검색(AddressField)은 카카오 유지(user 앱 `VITE_KAKAO_KEY` — 지도와 무관).

## M8. 실행 계획 → 구현 완료 (2026-07-19)
1. [x] 스펙 개정: CLAUDE.md 스택 항목·03-frontend.md MapView 절·.env.example 3종·DEPLOY.md env 표.
2. [ ] **VWorld 인증키 발급·서비스 URL 등록**(사용자 액션) → `VITE_MAP_STYLE_URL` 설정 시 실지도 활성화.
   래스터 템플릿: `https://api.vworld.kr/req/wmts/1.0.0/<인증키>/Base/{z}/{y}/{x}.png` — VWorld WMTS는
   경로가 z/**y**/x 순서다. 플레이스홀더는 이름으로 치환되므로 이 순서 그대로 넣으면 되고, MapView가
   `{z}` 포함 여부로 템플릿을 감지해 인라인 래스터 스타일로 감싼다. 레이어: Base(일반)/gray/midnight/
   Satellite/Hybrid. 발급 절차: vworld.kr 회원가입 → 오픈API → 인증키 발급(서비스 URL·목적 입력,
   승인 후 활성) — 등록 URL과 다른 도메인 요청은 거부될 수 있으니 Vercel 3앱 도메인(+로컬 개발
   http://localhost:5173)을 등록한다. 키 유형: **개발키**(유효 6개월·3회 연장)로 개발/데모 충분,
   **정식 런칭 시 운영키**(유효 2년)로 전환(env 키 문자열 교체+재배포만 — 코드 변경 0.
   launch-plan 체크리스트 참조). 2026-07-22 개발키 발급됨.
3. [x] `MapView` 내부 MapLibre 재구현(prop 인터페이스 유지: `apiKey` → `styleUrl`만 교체, center/markers/
   level/pickupLabel/etaLabel 불변). maplibre-gl dynamic import + 실패·WebGL 미지원 시 프리뷰 폴백.
4. [x] 라우팅 폴리라인(카카오모빌리티 Directions) — M9-b에서 `MapView.routePath`로 구현(2026-07-25).
5. [x] 테스트 재작성(MapView 4케이스: 게이트·[lng,lat] 초기화 계약·래스터 템플릿 래핑·실패 폴백).
   [ ] Capacitor iOS/Android 실기기 WebGL 검증(qa-checklist 🔴 — 실기기 필요).
6. [x] 번들: dynamic import로 초기 로드 영향 0(타일 미설정 시 maplibre 청크 자체를 안 받음).

## M9. 내비게이션 로드맵 (렌더러와 별개 — 실제 가치가 여기 있음)
- **M9-a 딥링크 핸드오프 — 구현 완료(2026-07-19)**: `pickup_orders.pickup_location`(EWKB)을 core
  `parseEwkbPoint`로 파싱해 ACCEPTED 패널의 길찾기 링크에 실좌표를 실었다.
  `kakaomap://route?ep={lat},{lng}&by=CAR`(주 버튼) + `tmap://route`(대안) + `map.kakao.com/link/to`
  (앱 미설치 웹 폴백). 좌표 파싱 실패(레거시)면 주소 검색 웹 링크로 강등 — 죽은 딥링크 금지.
  실제 턴바이턴은 검증된 국내 내비 앱(카카오맵/TMap)이 담당한다 — 한국 gig 앱 표준 패턴.
- **M9-b 인앱 실시간 위치·경로 표시(배선 완료·키 대기)**: 지도에 라이더 GPS 점(Capacitor
  Geolocation, rider엔 이미 `@capacitor/geolocation` 있음) + 수거지 핀 + 카카오모빌리티 라우팅
  폴리라인 + ETA. **턴바이턴은 아님**(유저가 라이더 접근을 지켜보는 UX).
  - **세팅 완료(2026-07-22)**: Edge Function `directions`(카카오모빌리티 프록시) + core
    `directionsInput/OutputSchema` + user `lib/directions.requestDirections` + config 등록.
    REST 키는 서버 시크릿 `KAKAO_MOBILITY_KEY`(CLAUDE.md 규칙 3 — 클라이언트 노출 금지).
    **키 미설정 시 `configured:false`로 조용히 비활성**(경로선 미표시, 라이더 위치 마커만).
    키 확보 후 `supabase secrets set KAKAO_MOBILITY_KEY=…`만 하면 재배포 없이 활성화된다.
  - **UI 연결 완료(2026-07-25)**: OrderDetailPage 지도에 ① 라이더 마커 ② 경로선 ③ ETA를 모두 붙였다.
    - 라이더 위치는 `rider_profiles.last_location` 구독이 아니라 **broadcast 채널
      `order:{id}:location`**(rider-location Edge가 실제 push하는 경로) 구독으로 구현 —
      `useRiderLocation`, private 채널 + realtime.messages RLS(당사자만). 60초 무갱신 시 마커 흐림.
    - 경로·ETA는 `useDirections`(신규 훅) → `requestDirections`. 15초 위치 푸시가 라우팅 API를 난타하지
      않도록 **좌표를 소수 3자리(≈110m)로 절삭해 쿼리 키를 만들고 staleTime 60초**를 둔다. ARRIVED
      이후·좌표 stale이면 조회하지 않는다.
    - MapView에 `routePath`(GeoJSON LineString 레이어, 스타일 로드 후 추가·이후 setData만 교체) +
      실지도 ETA 칩을 추가. core `formatEta`(null 입력→null 반환으로 "가짜 시간" 원천 차단).
  - **라이더측 수신 UI 완료(2026-08-02, 16 L3 §3-1)**: user 앱과 대칭 — rider `useDirections`/
    `lib/directions`(동일한 좌표 3자리 절삭+staleTime 60초 계약, 타입은 core 공유)로
    ① ActiveRunPage ACCEPTED 패널 지도에 내 위치→수거지 경로선+ETA 칩 ② CallDetailPage(수락 전)에
    "도로 기준" 거리·소요 칩. origin은 내 위치 1회 조회(useGeolocation) — 권한 거부·실패 시 칩·경로선
    미표기 폴백. 주 내비는 계속 M9-a 외부 앱 딥링크(턴바이턴 아님 — M9-c 비권장 유지).
  - ✅ **실측 완료(2026-08-03)**: 프로덕션 시크릿에 `KAKAO_MOBILITY_KEY` 등록(카카오모빌리티
    디벨로퍼스 무료 쿼터 — 일 10,000건). 실 키로 Directions 실호출(시청→서울역 3,773m·715초·
    83꼭짓점) → vertexes 파싱 → MapView 경로선 렌더까지 확인. 이 실측에서 라이더 실시간 마커가
    setLngLat 전에 addTo되어 실지도 모드에서 크래시하는 버그를 발견·수정(packages/ui MapView).
- **M9-c 인앱 풀 턴바이턴(비권장 유지)**: 음성·재탐색까지 내장. 고비용, 한국 규제·국내 내비 SDK 라이선스,
  백그라운드 GPS 배터리. MVP엔 과투자 — 국내 gig/배달앱도 대개 M9-a(핸드오프)를 택한다.
