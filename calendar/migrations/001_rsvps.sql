-- the answers to the invitations: one row per invitee and event (a reader writes their own row, see [[tables]])
create table rsvps (
  resource_id uuid not null,
  tenant_id   uuid not null,
  user_id     uuid not null,
  user_name   text not null,
  answer      text not null check (answer in ('yes', 'no', 'maybe')),
  answered_at timestamptz not null default now(),
  primary key (resource_id, user_id)
);

create view kpi_events_status as
  select e.tenant_id,
         count(*) as events,
         count(*) filter (where coalesce(e.repeat, 'none') <> 'none') as recurring_events
  from events e
  group by e.tenant_id;
