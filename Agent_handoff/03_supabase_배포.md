# Supabase와 배포: coushboard

## Task Metadata
- **Created/updated at**: 2026-10-02 23:31:00 KST
- **Model used**: `claude-sonnet-5-5`
- **User requirements**: 새 무료 Supabase 프로젝트에 배포, 회원가입 허용, GitHub 레포 푸시, 기능 검증

## Component Status

### Supabase 프로젝트
- **Current value/logic**: 프로젝트 `kjfmwbwnpdhmdtadiyrs`(coushboard, ap-northeast-2) 생성됨, 테이블 0개(마이그레이션 미적용)
- **Implementation**: URL `https://kjfmwbwnpdhmdtadiyrs.supabase.co`, anon 키는 공개용(서비스 롤 키는 사용하지 않음)
- **Related files**: `supabase/migrations/` 2개, `supabase/manual_setup.sql`, `supabase/tests/01_rls.test.sql`
- **Rationale**: `apply_migration` 도구가 거부되어 적용 보류 (PM M1)

### 테스트 구성
- **Current value/logic**: H8 pgTAP + supabase-js, H9 저장 왕복은 `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` 가 있을 때 실행. 이메일 확인이 켜진 프로젝트는 `SUPABASE_TEST_USER_A/B` 로 미리 만든 사용자 사용
- **Related files**: `tests/db/`, `scripts/verify.mjs`

### 호스팅
- **Current value/logic**: GitHub `ryutt919/coushboard`(비공개) 푸시 완료. Vercel 프로젝트 생성은 403 (PM M2). `vercel.json` 에 CSP 포함
- **Rationale**: CI 워크플로는 토큰 권한 문제로 `ci/github-actions-ci.yml`

---

## Change History
| Timestamp | Model | User Requirements | Task | Change Summary |
|-----------|-------|-------------------|------|----------------|
| 2026-10-02 23:31:00 KST | `claude-sonnet-5-5` | Supabase 배포 | 프로젝트 생성, 배포 시도 | 프로젝트 생성 완료, 마이그레이션과 Vercel은 권한으로 차단 |
