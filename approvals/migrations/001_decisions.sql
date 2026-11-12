-- the decisions on a request: one row per approver and request, final (a reader writes their own row, see [[tables]])
create table decisions (
  resource_id uuid not null,
  tenant_id   uuid not null,
  user_id     uuid not null,
  user_name   text not null,
  verdict     text not null check (verdict in ('approved', 'rejected')),
  comment     text,
  decided_at  timestamptz not null default now(),
  primary key (resource_id, user_id)
);

create view kpi_requests_status as
  select r.tenant_id,
         count(*) as requests,
         count(*) filter (where coalesce(r.cancelled, false)) as cancelled_requests,
         count(*) filter (where exists (select 1 from decisions d where d.resource_id = r.resource_id)) as decided_requests
  from requests r
  group by r.tenant_id;
