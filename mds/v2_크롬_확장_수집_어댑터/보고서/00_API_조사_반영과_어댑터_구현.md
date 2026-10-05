# 보고서: 쿠팡 내부 API 조사 반영과 수집 어댑터 구현

## Task Metadata
- **Created/updated at**: 2026-10-05 14:30:00 KST
- **Model used**: `claude-sonnet-5-5`
- **User requirements**: Chrome 확장 인수인계서(HANDOFF v2)에 따라 `lib/adapter.js` 를 구현한다. 확장 zip을 프로젝트 폴더에 두었다. 확인되지 않은 것은 확정처럼 구현하지 않는다.
- **버전**: v2 (폴더 mds/v2_크롬_확장_수집_어댑터)

## 요약
- `coupang-ledger-ext/lib/adapter.js` 를 구현했다. DOM 클릭 없이 `mc.coupang.com` 내부 주문 API(읽기 전용 GET)를 같은 오리진으로 호출한다.
- 인수인계서의 상태 매핑 가설을 사용자 CSV(`data/`)와 대조해 **2025년 352줄이 줄 수, 상태별 개수, 주문 수까지 일치**함을 확인했다. 매핑은 확정.
- 합성 응답 테스트 3종 통과. **실제 쿠팡 페이지에서의 수집 실행은 아직 하지 않았다**(열린 문제 M7).

## 입력 확인
- 확장 코드는 프로젝트 루트의 `coupang-ledger-ext.zip` 에 있었고 `coupang-ledger-ext/` 로 풀어 저장소에 넣었다(zip 자체는 커밋하지 않음)
- 엔진 인터페이스(`lib/collect.js` 주석): `listYears`, `goYear`, `readPage`, `hasNext`, `nextPage`. 인수인계서 §6 매핑이 그대로 맞았다
- 엔진의 기본 요청 간격이 1.2~1.8초여서 사용자 조건(2초 이상)에 어긋났다. 기본값을 `delayMs 2200, jitter 0.6` 으로 바꿔 2.2~3.5초로 맞췄다

## CSV 대조 결과 (인수인계서 §4.1, §5)
- 대조 대상: `data/쿠팡_전체_주문목록_주문번호포함.csv` 의 2025년 행. 개인 구매 데이터라 보고서에는 합계 수준만 적는다
- 2025년 CSV 352줄, 주문 181건. 인수인계서의 API 측정치와 같다(352줄, 181건)
- 상태별 개수 일치

| CSV 상태 | CSV 줄 수 | API 조건 | 인수인계서 줄 수 |
|---|---|---|---|
| 배송완료 | 248 | FINAL_DELIVERY, 취소/반품 없음 | 248 |
| 반품완료 | 89 | cancelReturnStatus=RETURN_COMPLETE | 89 |
| 취소완료 | 13 | cancelReturnStatus=CANCELED | 13 |
| 배송중 | 2 | DELIVERING, 취소/반품 없음 | 2 |

- 샘플 5건 개별 확인(주문일시 기준)
  - 정가와 판매가가 다른 주문에서 CSV 판매가가 `discountedUnitPrice` 와 같았다. 수량과 줄 수도 일치
  - 반품, 취소 샘플은 각각 반품완료, 취소완료이고 금액 일치
  - 교환 사례는 CSV에 **1줄, 반품완료**였다(교환완료 아님). 줄의 `cancelReturnStatus=RETURN_COMPLETE` 매핑이 그대로 맞다
  - 같은 주문 안의 같은 상품 두 줄은 CSV에도 2줄이다. 수집 행에 중복 제거를 적용하지 않는 규칙을 뒷받침한다
- CSV의 다른 연도(2021~2024, 2026)에도 상태는 배송완료, 반품완료, 취소완료, 배송중 4종뿐이다

## 구현
- 호출: `GET /ssr/api/myorders/model?requestYear=Y&pageIndex=N&size=5`, `credentials: same-origin`
- `listYears()`: 페이지의 연도 칩(텍스트가 정확히 4자리 연도인 말단 노드)을 읽는다. 해시 클래스명은 쓰지 않는다. 칩이 없거나 호스트가 `mc.coupang.com` 이 아니면 명확한 오류
- `hasNext()`: `api.hasNext && api.nextYear === 현재 연도`. 연도 안에서 `nextPageIndex !== pageIndex + 1` 이면 `PAGING_BROKEN` 으로 중단
- `rowsFromOrder()`: `deliveryGroupList[].productList[]` 에서만 행을 만든다(취소/반품 묶음은 복제본이라 읽지 않음)
  - 상품번호=`vendorItemId`, 상품명=`vendorItemName`, 판매가=`discountedUnitPrice`, 일시=`orderedAt` 을 KST로 변환, ID는 문자열
  - 필수 필드가 없으면 `UNEXPECTED_SHAPE` 로 던진다(조용히 넘기지 않음)
- `mapStatus()`: 위 표의 4가지는 확정. 그 외는 `미확인(값)` 으로 남기고 콘솔 경고를 값마다 한 번만 낸다
  - 줄의 `EXCHANGE_COMPLETE` 만 `교환완료` 로 대응(2025년에는 줄에 나타난 적 없어 미검증)
- 오류 처리: 4xx/5xx, 리다이렉트, JSON이 아닌 응답은 즉시 던진다. 재시도 없음
- 읽기 전용 GET만 보낸다. 쿠키, 토큰, 헤더 값은 코드 어디에도 출력하지 않는다

## 검증
- `node test/adapter.test.mjs`(신규): 합성 응답으로 열 대응, 상태 대응, 취소 묶음 무시, 같은 상품 두 줄 유지, 연도 경계(연도가 끝나도 hasNext=true, nextYear만 바뀌는 동작 재현), 429와 로그인 리다이렉트와 HTML 응답에서 1회 호출 후 중단, 페이징 불연속 중단, 미확인 상태 경고 1회
- `node test/engine.test.mjs`, `node test/pipeline.test.mjs` 기존 테스트 통과(엔진 기본 간격 변경 후에도)
- 실제 구매 데이터는 테스트나 저장소에 넣지 않았다(합성 픽스처만)

## 미확인, 한계
- 실제 쿠팡 탭에서 확장으로 전체 수집을 돌려 연도별 줄 수를 CSV와 대조하는 단계(M7)
- 가장 오래된 연도(2021)의 끝에서 `hasNext` 가 false가 되는지는 보지 못했다. 연도 칩 목록을 기준으로 순회하므로 영향은 없다
- 취소 없이 `ACCEPT`/`INSTRUCT` 인 줄(결제 직후 주문)이 CSV에서 어떤 상태인지 모른다. 지금은 `미확인(...)` 으로 남고 대시보드 "구매 확정/반품" 필터에는 잡히지 않는다
- `size` 를 5보다 키워도 되는지는 시험하지 않았다
- 수집 도중 오류가 나면 그때까지 읽은 행은 저장되지 않는다(엔진이 끝까지 모은 뒤 한 번에 전달). 2분 안팎이라 두었으나, 필요하면 연도 단위 저장으로 바꿀 수 있다
- 쿠팡 비공개 내부 API이므로 구조가 바뀌면 깨진다. 이용약관 저촉 여부는 확인하지 못했다

## 재현
- `cd coupang-ledger-ext && node test/adapter.test.mjs && node test/engine.test.mjs && node test/pipeline.test.mjs`
- 실제 수집: `chrome://extensions` 에서 `coupang-ledger-ext/` 로드, 쿠팡 주문목록(`mc.coupang.com`) 탭에서 팝업의 수집 시작

## 산출물
- [coupang-ledger-ext/lib/adapter.js](../../../coupang-ledger-ext/lib/adapter.js), [coupang-ledger-ext/test/adapter.test.mjs](../../../coupang-ledger-ext/test/adapter.test.mjs), [coupang-ledger-ext/lib/collect.js](../../../coupang-ledger-ext/lib/collect.js)(기본 간격)

## Change History
| Timestamp | Model | User Requirements | Task | Change Summary |
|---|---|---|---|---|
| 2026-10-05 14:30:00 KST | `claude-sonnet-5-5` | 인수인계서에 따라 어댑터 구현 | 보고서 작성 | 최초 작성 |
