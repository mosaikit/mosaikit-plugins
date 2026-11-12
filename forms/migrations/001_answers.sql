-- the answers of a form: one row per person (or per browser, for a visitor of a public link) and form.
-- `user_id` is the id of the signed-in person, or the random id a visitor's browser keeps (one answer per browser: a hint,
-- not a proof); `user_name` is the username or `visitor`; `body` is a JSON object of field id to value.
-- A reader and a visitor of a public link write it (see [[tables]] in the manifest); nobody changes a row.
create table answers (
  resource_id  uuid not null,
  tenant_id    uuid not null,
  user_id      uuid not null,
  user_name    text not null,
  body         text not null,
  submitted_at timestamptz not null default now(),
  primary key (resource_id, user_id)
);

create view kpi_forms_status as
  select f.tenant_id,
         count(*) as forms,
         count(*) filter (where coalesce(f."open", false) and (f.closes_on is null or f.closes_on >= current_date)) as open_forms,
         coalesce(sum(c.n), 0) as answers
  from forms f
  left join (select resource_id, count(*) as n from answers group by resource_id) c on c.resource_id = f.resource_id
  group by f.tenant_id;
