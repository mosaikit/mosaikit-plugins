-- the answers of a survey: one row per person and survey (a reader writes their own row, see [[tables]]).
-- `answers` is a JSON object of question id to answer; `score` and `max_score` are set only for a quiz.
create table responses (
  resource_id  uuid not null,
  tenant_id    uuid not null,
  user_id      uuid not null,
  user_name    text not null,
  answers      text not null,
  score        int,
  max_score    int,
  submitted_at timestamptz not null default now(),
  primary key (resource_id, user_id)
);

create view kpi_surveys_status as
  select s.tenant_id,
         count(*) as surveys,
         count(*) filter (where not coalesce(s.closed, false) and (s.closes_on is null or s.closes_on >= current_date)) as open_surveys,
         coalesce(sum(c.n), 0) as responses
  from surveys s
  left join (select resource_id, count(*) as n from responses group by resource_id) c on c.resource_id = s.resource_id
  group by s.tenant_id;
