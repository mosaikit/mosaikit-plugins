-- a person's boards (the table `boards` is made from the resource): how many, how many have widgets chosen
create view kpi_boards_status as
  select tenant_id,
         count(*) as boards,
         count(*) filter (where coalesce(widgets, '') not in ('', '[]')) as with_widgets,
         count(*) filter (where coalesce(widgets, '') in ('', '[]')) as empty
  from boards
  group by tenant_id;
