-- 추가 마이그레이션 (init 이후)
-- 1) 같은 파일(SHA-256)의 이중 업로드를 DB에서도 막는다(경쟁 상태 대비).
-- 2) 영수증 업로드를 한 트랜잭션으로 처리하는 replace_receipts 함수.
--    receipt_key가 같은 영수증은 새 내용으로 덮어쓴다. 실패하면 아무것도 바뀌지 않는다.

create unique index imports_user_kind_sha_key on public.imports (user_id, kind, file_sha256);

create or replace function public.replace_receipts(p_import_id uuid, p_rows jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare n int;
begin
  if not exists (select 1 from public.imports where id = p_import_id and kind = 'receipts') then
    raise exception 'import not found';
  end if;

  insert into public.receipts (import_id, receipt_key, order_no, paid_at, item_name, item_count, total)
  select p_import_id, r->>'receipt_key', r->>'order_no', (r->>'paid_at')::timestamp,
         r->>'item_name', nullif(r->>'item_count','')::int, (r->>'total')::int
    from jsonb_array_elements(p_rows) r
  on conflict (user_id, receipt_key) do update
     set import_id  = excluded.import_id,
         order_no   = excluded.order_no,
         paid_at    = excluded.paid_at,
         item_name  = excluded.item_name,
         item_count = excluded.item_count,
         total      = excluded.total;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.replace_receipts(uuid, jsonb) from public, anon;
grant execute on function public.replace_receipts(uuid, jsonb) to authenticated;
