# 쿠팡 지출 대시보드 (Chrome 확장, 로컬 저장)

## 설치
1. chrome://extensions → 개발자 모드 ON → "압축해제된 확장 프로그램을 로드합니다" → 이 폴더 선택
2. 아이콘 클릭 → "대시보드 열기"

## 상태
| 기능 | 상태 |
|---|---|
| 대시보드(기간/카테고리/품목), CSV 가져오기·내보내기, chrome.storage.local 저장 | 구현·검증됨 |
| 연도×페이지 순회 엔진(lib/collect.js) | 구현, 요청 간격 2.2~3.5초 |
| 쿠팡 어댑터(lib/adapter.js) | 구현. 쿠팡 내부 주문 API(읽기 전용 GET)를 호출. 합성 응답으로 검증, **실제 쿠팡 탭 수집은 미실행** |
| 상태 대응 | 배송완료/배송중/반품완료/취소완료는 CSV 대조로 확정. 그 외는 `미확인(값)` 으로 표시 |
| 화면 구조 점검(팝업) | 구현 |

## 수집 방법
1. 쿠팡 주문목록(`mc.coupang.com`)에 로그인한 탭을 연다
2. 확장 팝업에서 수집을 시작한다(연도 칩에 보이는 연도를 순서대로, 요청마다 2초 이상 간격)
3. 로그인 풀림, 캡차, 4xx/5xx가 나오면 즉시 멈추고 알린다(재시도 없음)

쿠팡 비공개 내부 API를 쓰므로 구조가 바뀌면 깨질 수 있습니다.

## 테스트
node test/pipeline.test.mjs   # 오라클 픽스처와 일치
node test/engine.test.mjs     # 수집 엔진·병합
node test/adapter.test.mjs    # 쿠팡 어댑터(합성 응답)
node test/e2e_collect.mjs     # Playwright Chromium 에 확장 로드, 합성 쿠팡 응답으로 팝업 수집부터 대시보드까지
node test/e2e.mjs             # 실제 Chromium에 확장 로드
