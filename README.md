# coushboard: 쿠팡 지출 대시보드

쿠팡 주문목록 CSV를 브라우저에서 읽어 기간별, 카테고리별, 품목별 지출을 보여 주는 대시보드입니다.
계산(파싱, 중복 제거, 분류, 집계)은 브라우저에서 하고, Supabase에는 원본 행과 사용자 설정만 저장합니다.

- 프론트엔드: Vite + React + TypeScript (Vercel 정적 배포)
- 인증과 저장: Supabase Auth + Postgres + RLS (사용자마다 자기 데이터만 접근)
- 누구나 이메일과 비밀번호로 회원가입해 쓸 수 있고, 가입 없이 가짜 데이터로 만든 **예시 화면**을 볼 수 있습니다

## 화면

| 화면 | 내용 |
|---|---|
| 대시보드 | 기간 프리셋, 상태 필터, 개요(요약 4칸, 카테고리별, 월별/연도별 막대, 결제 내역)와 세부 내역(자주 산 품목, 개당 가격, 구매 이력) |
| CSV 올리기 | 열 검증과 짝짓기, 같은 파일 재업로드 방지, 업로드 결과, 데이터 기간 띠, 중복 행 되돌리기 |
| 카테고리 정리 | 미분류 원클릭 지정, 규칙 추가 미리보기와 예외, 규칙 충돌 감지, JSON 백업과 복원 |

## 예시 화면 (mock 데이터)

로그인 화면의 **예시 화면 보기**를 누르면 가짜(mock) 주문 데이터(`src/lib/demo.ts`, 시드 고정)로 모든 화면을 써 볼 수 있습니다.
서버와 통신하지 않고 메모리에만 두며, 새로고침하면 처음으로 돌아갑니다. 업로드 화면에서 연습용 CSV도 받을 수 있습니다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 를 채웁니다
npm run dev                  # http://localhost:5173
```

환경변수가 없어도 예시 화면은 동작합니다. anon 키와 URL만 쓰며, 관리자(서비스 롤) 키는 어디에도 두지 않습니다.

### 로컬 Supabase 스택 (Supabase CLI, Docker 필요)

```bash
supabase start          # 로컬 스택 시작
supabase db reset       # supabase/migrations 를 처음부터 적용
supabase test db        # RLS 검증 (pgTAP, supabase/tests)
supabase status -o env  # API_URL, ANON_KEY 확인
```

테스트는 운영 프로젝트에 붙이지 않습니다. 개발은 로컬 스택만 써도 됩니다.

## 운영 Supabase 설정

1. 프로젝트 생성(리전: 서울 `ap-northeast-2`).
2. 스키마는 마이그레이션 파일로만 바꿉니다: `supabase link --project-ref <ref>` 후 `supabase db push`
   (`supabase/migrations/` 의 두 파일: 초기 스키마와 RLS, 영수증 함수와 업로드 중복 방지).
3. Authentication 설정
   - 회원가입을 열어 둡니다(Enable sign ups). 누구나 가입해 자기 데이터만 볼 수 있습니다.
   - **Confirm email**을 끄면 가입 즉시 로그인됩니다. 켜 두면 확인 메일의 링크를 누른 뒤 로그인합니다
     (기본 메일 발송은 시간당 횟수 제한이 있으므로 사용자가 늘면 자체 SMTP를 연결하세요).
   - Site URL과 Redirect URLs에 배포 도메인과 `http://localhost:5173` 을 등록합니다.
4. Vercel 환경변수에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 두 개만 넣습니다.

### 무료 플랜 프로젝트가 일시 중지되었을 때

일정 기간 접속이 없으면 무료 프로젝트가 일시 중지될 수 있습니다(정확한 기준은 Supabase 문서 확인).
Supabase 대시보드에서 프로젝트를 열고 **Restore project**(재개)를 누르면 데이터 그대로 복구됩니다.
재개 전에는 로그인과 데이터 읽기가 실패하고 화면에 오류 안내가 나옵니다.

## 어떤 데이터가 Supabase에 저장되나

| 테이블 | 내용 |
|---|---|
| `imports` | 업로드 이력(종류, 파일명, SHA-256, 행 수) |
| `order_items` | 주문목록 원본 행(중복 행 포함, 주문 안 순번 `seq_in_order`) |
| `receipts` | 카드 영수증 행(카드번호, 승인번호, 할부는 저장하지 않음) |
| `category_rules`, `category_overrides`, `product_merges`, `dedupe_overrides` | 내가 만든 카테고리 규칙, 직접 지정, 품목 합치기, 중복 되돌리기 |

모든 테이블에 `user_id` 와 RLS(`user_id = auth.uid()`)가 걸려 있고 `anon` 권한은 없습니다. 집계 결과는 저장하지 않습니다.
날짜는 `timestamp`(시간대 없음)로 저장하고 KST 그대로 씁니다.

### 전체 삭제와 내보내기

업로드 화면 아래 **내 데이터 관리**에서 할 수 있습니다.
- **전체 내보내기 (JSON)**: 주문, 영수증, 설정을 모두 파일로 받습니다.
- **내 데이터 전체 삭제**: 확인 2단계를 거쳐 내 주문, 영수증, 설정을 지웁니다(계정은 남습니다).
- 카테고리 정리 화면의 **규칙 내보내기/가져오기**는 규칙과 지정 내역만 백업합니다.

## 테스트와 검증

```bash
npm run verify                # lint, typecheck, H1~H4, H6, (H8/H9), build, H5 를 순서대로 실행
npm run test                  # 단위, 골든, 성질, 차등 테스트
npm run verify:real -- --orders <경로> [--receipts <경로>]   # 실데이터 차등 테스트(로컬 전용)
```

- 데이터 로직 `src/lib/pipeline.ts` 는 참조 구현 `tools/oracle/oracle.py`(파이썬 표준 라이브러리만)와 같은 JSON 구조를 냅니다.
  픽스처는 `tests/fixtures/` 의 가짜 데이터입니다.
- `verify:real` 은 같은 파일을 oracle 과 TS 구현에 돌려 여러 기간과 상태 조합을 깊게 비교하고, 다르면 첫 불일치 경로와 양쪽 값을 출력합니다. 상품명은 출력하지 않습니다.
- DB 테스트(`tests/db`)는 `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` 가 있을 때만 돌고, 없으면 `verify` 가 SKIPPED 로 표시합니다.
- E2E(Playwright)는 예시 화면과 픽스처 업로드 시나리오를 서버 없이 검사하고, Supabase 연결 시나리오는 `E2E_EMAIL` 이 있을 때 돕니다.

## 개인정보 가드

- `.gitignore` 로 `*.csv`, `*.xlsx`, `data/`, `.env*` 를 막고 `tests/fixtures/` 만 예외입니다.
- `scripts/privacy-scan.mjs` 가 pre-commit 훅(`.githooks`, `git config core.hooksPath .githooks`)과 CI 에서 돕니다.
  픽스처 밖 CSV, 실제 주문번호 형식, 관리자 키, `.env` 를 찾으면 실패합니다.
  로컬에서 `COUPANG_REAL_CSV=<경로>` 를 주면 실데이터 상품명이 저장소에 있는지도 대조합니다.
- `vercel.json` 의 CSP 로 외부 통신은 자기 도메인과 Supabase 호스트로만 제한하고, 웹폰트는 자체 호스팅합니다.

## 구현 메모

- 중복 제거: 같은 `(주문번호, 상품번호, 판매가, 수량)` 은 1행만 남기고, 영수증 `item_count` 합이 더 크면 차이만큼 되살립니다.
- 카테고리 분류 순서: 직접 지정(행, 품목) 다음 키워드 규칙(카테고리 순서대로) 다음 미분류.
- 인증은 이메일과 비밀번호입니다. 설계 문서의 매직 링크/OTP 와 달리 가입 후 바로 쓸 수 있고, 메일 발송 제한과 무관하게 동작합니다.
- 기간 프리셋의 "오늘" 은 시스템 날짜가 아니라 데이터의 마지막 주문일입니다.
