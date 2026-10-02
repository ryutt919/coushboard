-- RLS 검증 (plain SQL). 실패하면 예외로 중단된다.
-- Supabase 로컬(supabase start)에서는 pgTAP으로 옮겨 `supabase test db`로 돌린다.
-- 이 파일은 auth.users / auth.uid() / anon / authenticated 역할이 있다는 전제로 동작한다.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- 사용자 A로 데이터 입력
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

insert into public.imports (id, kind, file_name, file_sha256, row_count)
values ('11111111-1111-1111-1111-111111111111', 'orders', 'a.csv', repeat('a', 64), 2);

select public.replace_orders('11111111-1111-1111-1111-111111111111', '[
 {"order_no":"1000000000001","seq_in_order":0,"ordered_at":"2024-11-03 10:00:00","product_no":"501","status":"배송완료","raw_name":"탐사수 무라벨, 2L, 12개","qty":1,"list_price":"6790","sale_price":6790},
 {"order_no":"1000000000001","seq_in_order":1,"ordered_at":"2024-11-03 10:00:00","product_no":"501","status":"배송완료","raw_name":"탐사수 무라벨, 2L, 12개","qty":1,"list_price":"6790","sale_price":6790}
]'::jsonb);

do $$ begin
  if (select count(*) from public.order_items) <> 2 then raise exception 'A should see 2 rows'; end if;
end $$;

-- 같은 주문번호로 다시 올리면 교체(2행 → 1행)
select public.replace_orders('11111111-1111-1111-1111-111111111111', '[
 {"order_no":"1000000000001","seq_in_order":0,"ordered_at":"2024-11-03 10:00:00","product_no":"501","status":"반품완료","raw_name":"탐사수 무라벨, 2L, 12개","qty":1,"list_price":"6790","sale_price":6790}
]'::jsonb);
do $$ begin
  if (select count(*) from public.order_items) <> 1 then raise exception 'replace should leave 1 row'; end if;
  if (select status from public.order_items) <> '반품완료' then raise exception 'replace should update status'; end if;
end $$;

-- 사용자 B: A의 데이터가 보이지 않아야 함
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  if (select count(*) from public.order_items) <> 0 then raise exception 'B must not see A rows'; end if;
  if (select count(*) from public.imports) <> 0 then raise exception 'B must not see A imports'; end if;
end $$;

-- B가 A의 user_id로 쓰기 시도 → 실패해야 함
do $$ begin
  begin
    insert into public.imports (user_id, kind, file_name, file_sha256, row_count)
    values ('00000000-0000-0000-0000-00000000000a', 'orders', 'x.csv', repeat('b', 64), 0);
    raise exception 'B wrote a row owned by A';
  exception when insufficient_privilege then null;   -- RLS 위반 = 42501
  end;
end $$;

-- B가 A의 import로 replace_orders 호출 → import가 안 보여서 실패해야 함
do $$ begin
  begin
    perform public.replace_orders('11111111-1111-1111-1111-111111111111', '[]'::jsonb);
    raise exception 'B used A import';
  exception when raise_exception then
    if sqlerrm <> 'import not found' then raise; end if;
  end;
end $$;

-- B의 delete/update가 A 행에 영향 없어야 함
delete from public.order_items;
update public.order_items set qty = 99;

-- anon: 어떤 테이블도 읽을 수 없어야 함
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.order_items;
    raise exception 'anon could read order_items';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.replace_orders('11111111-1111-1111-1111-111111111111', '[]'::jsonb);
    raise exception 'anon could call replace_orders';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A로 돌아와 데이터가 그대로인지 확인
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  if (select count(*) from public.order_items) <> 1 then raise exception 'A rows were changed by B'; end if;
  if (select qty from public.order_items) <> 1 then raise exception 'A qty was changed by B'; end if;
end $$;

select 'RLS TESTS PASSED' as result;
rollback;
