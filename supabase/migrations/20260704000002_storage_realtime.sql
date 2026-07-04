-- Storage 버킷 2개 + 정책, Realtime publication.
-- 근거: docs/spec/01-db-schema.sql 말미 주석
--   "Storage 버킷: order-photos (관련자 read / rider write), rider-docs (본인 write, admin read)"
--   "Realtime publication: pickup_orders, notifications 활성화"
-- 04-tasks.md T3 DoD.

-- ===== Storage 버킷 =====
insert into storage.buckets (id, name, public)
values ('order-photos', 'order-photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('rider-docs', 'rider-docs', false)
on conflict (id) do nothing;

-- order-photos: 관련자(주문 supplier/rider/admin) read, 배정 rider write.
-- 업로드 경로 컨벤션: {orderId}/{filename}. storage.foldername(name)[1] = order_id 로 매칭.
create policy p_order_photos_read on storage.objects for select
  using (
    bucket_id = 'order-photos'
    and (
      is_admin()
      or exists (
        select 1 from pickup_orders o
        where o.id::text = (storage.foldername(name))[1]
          and (o.supplier_id = auth.uid() or o.rider_id = auth.uid())
      )
    )
  );

create policy p_order_photos_write on storage.objects for insert
  with check (
    bucket_id = 'order-photos'
    and exists (
      select 1 from pickup_orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.rider_id = auth.uid()
    )
  );

-- rider-docs: 본인(rider) write, 본인 또는 admin read. 업로드 경로 컨벤션: {riderId}/{filename}.
create policy p_rider_docs_read on storage.objects for select
  using (
    bucket_id = 'rider-docs'
    and (
      is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create policy p_rider_docs_write on storage.objects for insert
  with check (
    bucket_id = 'rider-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ===== Realtime publication =====
alter publication supabase_realtime add table pickup_orders;
alter publication supabase_realtime add table notifications;
