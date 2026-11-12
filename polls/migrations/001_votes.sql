-- who voted for what: one row per person, poll and chosen option (a reader writes their own rows, see [[tables]])
create table votes (
  resource_id  uuid not null,
  tenant_id    uuid not null,
  user_id      uuid not null,
  user_name    text not null,
  option_index int not null,
  voted_at     timestamptz not null default now(),
  primary key (resource_id, user_id, option_index)
);

create view kpi_polls_status as
  select tenant_id,
         count(*) as total,
         count(*) filter (where not coalesce(closed, false) and (closes_on is null or closes_on >= current_date)) as open_polls,
         count(*) filter (where coalesce(closed, false) or closes_on < current_date) as closed_polls
  from polls
  group by tenant_id;
