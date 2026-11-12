-- the boards themselves are the resource `whiteboards` (the kernel makes its table); this adds the view of the KPIs
create view kpi_whiteboards_status as
  select tenant_id,
         count(*) as whiteboards
  from whiteboards
  group by tenant_id;
