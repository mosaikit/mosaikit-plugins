-- which board column and sprint a task is in (the tasks themselves belong to the Tasks plugin; a writer of the project
-- writes these rows, with the default policies of a table: write level to insert and update, manage to delete)
create table placements (
  resource_id  uuid not null,
  tenant_id    uuid not null,
  task_id      uuid not null,
  column_name  text not null,
  sprint_id    text,
  position     int not null default 0,
  primary key (resource_id, task_id)
);

create view kpi_projects_status as
  select tenant_id,
         count(*) as projects,
         count(*) filter (where status = 'active') as active_projects
  from projects
  group by tenant_id;
