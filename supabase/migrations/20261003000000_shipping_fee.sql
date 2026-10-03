-- 배송비 컬럼 추가 (외부 주문 도구 형식의 배송비를 지출과 별도로 보여 주기 위함)
-- 1) order_items.shipping_fee: 없으면 null. 총 지출에는 더하지 않는다.
-- 2) replace_orders 가 shipping_fee 도 넣도록 다시 정의한다(시그니처와 권한은 그대로).
--    이 마이그레이션 전에 올라간 앱 버전은 shipping_fee 키를 보내지 않으므로 계속 동작한다.

alter table public.order_items
  add column shipping_fee int check (shipping_fee >= 0);

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
     raw_name, qty, list_price, sale_price, seller, shipping_fee)
  select p_import_id, r->>'order_no', (r->>'seq_in_order')::int, (r->>'ordered_at')::timestamp,
         r->>'bundle_no', r->>'product_no', r->>'status', r->>'raw_name',
         (r->>'qty')::int, nullif(r->>'list_price','')::int, (r->>'sale_price')::int, r->>'seller',
         nullif(r->>'shipping_fee','')::int
    from jsonb_array_elements(p_rows) r;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.replace_orders(uuid, jsonb) from public, anon;
grant execute on function public.replace_orders(uuid, jsonb) to authenticated;
