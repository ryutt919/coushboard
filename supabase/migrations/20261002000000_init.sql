-- 쿠팡 지출 대시보드 — 초기 스키마
-- 원칙: 모든 테이블에 user_id + RLS. anon 역할은 어떤 테이블에도 접근 불가.
-- 원본 행은 중복까지 그대로 저장하고, 중복 제거·분류·집계는 클라이언트 파이프라인(runPipeline)이 한다.

create extension if not exists pgcrypto;

-- 1. 업로드 이력 ---------------------------------------------------------
create table public.imports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('orders', 'receipts')),
  file_name    text not null,
  file_sha256  text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  row_count    int  not null check (row_count >= 0),
  created_at   timestamptz not null default now()
);
create index imports_user_idx on public.imports (user_id, created_at desc);

-- 2. 주문목록 원본 행 ------------------------------------------------------
-- seq_in_order: 같은 주문 안에서 파일상 몇 번째 행인지(0부터). 내보내기 중복 행을 구분하기 위해 필요.
create table public.order_items (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_id     uuid not null references public.imports(id) on delete cascade,
  order_no      text not null check (order_no ~ '^[0-9]+$'),
  seq_in_order  int  not null check (seq_in_order >= 0),
  ordered_at    timestamp not null,            -- 파일의 현지 시각 그대로(KST). 시간대 변환 금지
  bundle_no     text,
  product_no    text not null check (product_no ~ '^[0-9]+$'),
  status        text not null check (status in ('배송완료', '교환완료', '배송중', '반품완료', '취소완료')),
  raw_name      text not null,
  qty           int  not null check (qty > 0),
  list_price    int  check (list_price >= 0),
  sale_price    int  not null check (sale_price >= 0),
  seller        text,
  unique (user_id, order_no, seq_in_order)
);
create index order_items_user_date_idx on public.order_items (user_id, ordered_at desc);

-- 3. 카드 영수증 (검증용) --------------------------------------------------
create table public.receipts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  import_id    uuid not null references public.imports(id) on delete cascade,
  receipt_key  text not null,
  order_no     text not null check (order_no ~ '^[0-9]+$'),
  paid_at      timestamp not null,
  item_name    text,
  item_count   int check (item_count > 0),     -- 비어 있으면 null
  total        int not null check (total >= 0),
  unique (user_id, receipt_key)
);
create index receipts_user_order_idx on public.receipts (user_id, order_no);
-- 카드번호·승인번호·할부 등은 저장하지 않는다(집계에 불필요).

-- 4. 사용자 설정 -----------------------------------------------------------
create table public.category_rules (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  rules       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table public.category_overrides (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  scope       text not null check (scope in ('row', 'group')),
  target      text not null,      -- row: '<order_no>:<seq_in_order>', group: 품목 키
  category    text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, scope, target)
);

create table public.product_merges (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_base   text not null,
  to_group    text not null,
  primary key (user_id, from_base)
);

create table public.dedupe_overrides (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_no      text not null,
  seq_in_order  int  not null,
  action        text not null check (action in ('keep', 'drop')),
  primary key (user_id, order_no, seq_in_order)
);

-- 5. RLS ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['imports','order_items','receipts','category_rules',
                           'category_overrides','product_merges','dedupe_overrides']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy %I on public.%I for all to authenticated
                     using (user_id = (select auth.uid()))
                     with check (user_id = (select auth.uid()))$p$, t || '_owner', t);
  end loop;
end $$;

-- 6. 주문목록 교체 업로드 ---------------------------------------------------
-- 새 파일에 들어 있는 주문번호의 기존 행을 지우고 새 행을 넣는다(한 트랜잭션).
-- security invoker: 호출자 권한 + RLS가 그대로 적용된다.
create or replace function public.replace_orders(p_import_id uuid, p_rows jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare n int;
begin
  if not exists (select 1 from public.imports where id = p_import_id and kind = 'orders') then
    raise exception 'import not found';
  end if;

  delete from public.order_items
   where user_id = auth.uid()
     and order_no in (select distinct r->>'order_no' from jsonb_array_elements(p_rows) r);

  insert into public.order_items
    (import_id, order_no, seq_in_order, ordered_at, bundle_no, product_no, status,
     raw_name, qty, list_price, sale_price, seller)
  select p_import_id, r->>'order_no', (r->>'seq_in_order')::int, (r->>'ordered_at')::timestamp,
         r->>'bundle_no', r->>'product_no', r->>'status', r->>'raw_name',
         (r->>'qty')::int, nullif(r->>'list_price','')::int, (r->>'sale_price')::int, r->>'seller'
    from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.replace_orders(uuid, jsonb) from public, anon;
grant execute on function public.replace_orders(uuid, jsonb) to authenticated;
