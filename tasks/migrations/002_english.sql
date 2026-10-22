-- English by default: the priorities become English (the Italian labels are in the
-- manifest) and the KPI view gets English column names.
update tasks set priority = 'low' where priority = 'bassa';
update tasks set priority = 'medium' where priority = 'media';
update tasks set priority = 'high' where priority = 'alta';
drop view kpi_tasks_status;
create view kpi_tasks_status as
  select tenant_id,
         count(*) filter (where done) as completed,
         count(*) filter (where not coalesce(done, false)) as open,
         count(*) filter (where not coalesce(done, false) and due < current_date) as overdue
  from tasks
  group by tenant_id;
