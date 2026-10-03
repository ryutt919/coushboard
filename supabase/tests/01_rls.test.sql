-- RLS 검증 (pgTAP). handoff의 rls_test.sql 검사 항목을 그대로 옮기고 몇 가지를 더했다.
-- 실행: supabase test db
begin;
select plan(20);

-- 새 public 테이블이 RLS 없이 만들어지면 실패한다
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS가 꺼진 public 테이블이 없다');

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- 사용자 A
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

select lives_ok($$
  insert into public.imports (id, kind, file_name, file_sha256, row_count)
  values ('11111111-1111-1111-1111-111111111111', 'orders', 'a.csv', repeat('a', 64), 2)
$$, 'A: imports 입력');

select lives_ok($$
  select public.replace_orders('11111111-1111-1111-1111-111111111111', '[
   {"order_no":"1000000000001","seq_in_order":0,"ordered_at":"2024-11-03 10:00:00","product_no":"501","status":"배송완료","raw_name":"탐사수 무라벨, 2L, 12개","qty":1,"list_price":"6790","sale_price":6790},
   {"order_no":"1000000000001","seq_in_order":1,"ordered_at":"2024-11-03 10:00:00","product_no":"501","status":"배송완료","raw_name":"탐사수 무라벨, 2L, 12개","qty":1,"list_price":"6790","sale_price":6790}
  ]'::jsonb)
$$, 'A: replace_orders 2행');

select is((select count(*)::int from public.order_items), 2, 'A: 자기 행 2개가 보인다');

-- 같은 주문번호로 다시 올리면 교체(2행 -> 1행)
select lives_ok($$
  select public.replace_orders('11111111-1111-1111-1111-111111111111', '[
   {"order_no":"1000000000001","seq_in_order":0,"ordered_at":"2024-11-03 10:00:00","product_no":"501","status":"반품완료","raw_name":"탐사수 무라벨, 2L, 12개","qty":1,"list_price":"6790","sale_price":6790,"shipping_fee":3000}
  ]'::jsonb)
$$, 'A: 같은 주문번호 재업로드');
select is((select count(*)::int from public.order_items), 1, '교체 후 1행');
select is((select status from public.order_items), '반품완료', '교체 후 상태가 갱신됨');
select is((select shipping_fee from public.order_items), 3000, '배송비가 저장됨');

-- 사용자 B
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
select is((select count(*)::int from public.order_items), 0, 'B: A의 행이 보이지 않는다');
select is((select count(*)::int from public.imports), 0, 'B: A의 업로드 이력이 보이지 않는다');

select throws_ok($$
  insert into public.imports (user_id, kind, file_name, file_sha256, row_count)
  values ('00000000-0000-0000-0000-00000000000a', 'orders', 'x.csv', repeat('b', 64), 0)
$$, '42501', null, 'B: A의 user_id로 쓰기 거부');

select throws_ok($$
  select public.replace_orders('11111111-1111-1111-1111-111111111111', '[]'::jsonb)
$$, 'P0001', 'import not found', 'B: A의 import로 replace_orders 거부');

select throws_ok($$
  select public.replace_receipts('11111111-1111-1111-1111-111111111111', '[]'::jsonb)
$$, 'P0001', 'import not found', 'B: A의 import로 replace_receipts 거부');

delete from public.order_items;
update public.order_items set qty = 99;

-- anon
reset role;
set local role anon;
select throws_ok($$select 1 from public.order_items$$, '42501', null, 'anon: order_items 조회 거부');
select throws_ok($$select public.replace_orders('11111111-1111-1111-1111-111111111111', '[]'::jsonb)$$, '42501', null, 'anon: replace_orders 실행 거부');
select throws_ok($$select public.replace_receipts('11111111-1111-1111-1111-111111111111', '[]'::jsonb)$$, '42501', null, 'anon: replace_receipts 실행 거부');

-- A로 돌아와 데이터가 그대로인지
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select is((select count(*)::int from public.order_items), 1, 'A: B의 삭제가 영향을 주지 않았다');
select is((select qty from public.order_items), 1, 'A: B의 수정이 영향을 주지 않았다');

-- 같은 파일 SHA-256 이중 업로드 방지
select throws_ok($$
  insert into public.imports (kind, file_name, file_sha256, row_count) values ('orders', 'dup.csv', repeat('a', 64), 1)
$$, '23505', null, 'A: 같은 파일(SHA-256) 이중 업로드 거부');

select * from finish();
rollback;
