-- the numbers of the KPI page: how many bookmarks a tenant has and how many are favourites
create view kpi_bookmarks_status as
  select tenant_id,
         count(*) as total,
         count(*) filter (where coalesce(favorite, false)) as favorites
  from bookmarks
  group by tenant_id;
