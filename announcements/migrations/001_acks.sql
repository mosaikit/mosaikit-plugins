-- who confirmed a notice: one row per person and notice (a reader writes their own row, see [[tables]])
create table acks (
  resource_id  uuid not null,
  tenant_id    uuid not null,
  user_id      uuid not null,
  user_name    text not null,
  confirmed_at timestamptz not null default now(),
  primary key (resource_id, user_id)
);

create view kpi_notices_status as
  select tenant_id,
         count(*) as published,
         count(*) filter (where (starts_on is null or starts_on <= current_date) and (ends_on is null or ends_on >= current_date)) as in_force,
         count(*) filter (where level = 'urgent' and (starts_on is null or starts_on <= current_date) and (ends_on is null or ends_on >= current_date)) as urgent,
         count(*) filter (where coalesce(pinned, false)) as pinned
  from notices
  group by tenant_id;
