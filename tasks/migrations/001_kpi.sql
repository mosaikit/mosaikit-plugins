create view kpi_tasks_status as
  select tenant_id,
         count(*) filter (where done) as completate,
         count(*) filter (where not coalesce(done, false)) as aperte,
         count(*) filter (where not coalesce(done, false) and due < current_date) as scadute
  from tasks
  group by tenant_id;
