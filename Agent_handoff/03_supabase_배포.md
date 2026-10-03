# Supabase와 배포: coushboard

## Task Metadata
- **Created/updated at**: 2026-10-03 20:10:00 KST
- **Model used**: `claude-sonnet-5-5`
- **User requirements**: 새 무료 Supabase 프로젝트에 배포, 회원가입 허용, GitHub 레포 푸시, 기능 검증

## Component Status

### Supabase 프로젝트
- **Current value/logic**: 프로젝트 `kjfmwbwnpdhmdtadiyrs`(coushboard, ap-northeast-2) 생성됨, 마이그레이션 2개 적용 완료(사용자가 SQL Editor로 실행), 테이블 7개 RLS 활성, 가입 즉시 세션(이메일 확인 꺼짐)
- **Implementation**: URL `https://kjfmwbwnpdhmdtadiyrs.supabase.co`, anon 키는 공개용(서비스 롤 키는 사용하지 않음)
- **Related files**: `supabase/migrations/` 2개, `supabase/manual_setup.sql`, `supabase/tests/01_rls.test.sql`
- **Rationale**: 도구 쓰기가 거부되어 사용자가 직접 적용 (PM M1 해결)

### 배송비 마이그레이션 (2026-10-03)
- **Current value/logic**: `supabase/migrations/20261003000000_shipping_fee.sql`: `order_items.shipping_fee int check (>= 0)` 추가, `replace_orders` 가 `shipping_fee` 도 넣도록 재정의(시그니처와 권한 유지)
- **Rationale**: 앱이 `shipping_fee` 컬럼을 읽으므로 **이 마이그레이션을 먼저 적용한 뒤에 앱을 배포해야 한다**(미적용 상태로 배포하면 데이터 읽기가 실패). 이전 버전 앱은 새 컬럼 없이도 동작
- **상태**: 코드와 문서는 완료. 쓰기 도구가 막혀 있어 사용자가 SQL Editor로 적용해야 함

### 테스트 구성
- **Current value/logic**: H8 pgTAP + supabase-js, H9 저장 왕복은 `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` 가 있을 때 실행. 이메일 확인이 켜진 프로젝트는 `SUPABASE_TEST_USER_A/B` 로 미리 만든 사용자 사용
- **Related files**: `tests/db/`, `scripts/verify.mjs`

### 호스팅
- **Current value/logic**: GitHub `ryutt919/coushboard`(비공개) 푸시, Vercel 프로젝트 `coushboard` 운영 배포(https://coushboard.vercel.app, `vercel deploy --prod`). 환경변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(config 타입). `vercel.json` 에 CSP 포함, 폰트 인라인 끔
- **Rationale**: CI 워크플로는 토큰 권한 문제로 `ci/github-actions-ci.yml`

---

## Change History
| Timestamp | Model | User Requirements | Task | Change Summary |
|-----------|-------|-------------------|------|----------------|
| 2026-10-02 23:31:00 KST | `claude-sonnet-5-5` | Supabase 배포 | 프로젝트 생성, 배포 시도 | 프로젝트 생성 완료, 마이그레이션과 Vercel은 권한으로 차단 |
| 2026-10-03 15:50:00 KST | `claude-sonnet-5-5` | Vercel 마무리 | 배포와 검증 | 마이그레이션 적용 확인, Vercel 배포, DB 테스트 16개와 E2E 9개 통과, M3/M4 수정 |
| 2026-10-03 20:10:00 KST | `claude-sonnet-5-5` | 배송비 컬럼 | 마이그레이션 추가 | `20261003000000_shipping_fee.sql` 작성, 적용 대기 |
