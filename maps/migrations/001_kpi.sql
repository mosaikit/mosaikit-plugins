create view kpi_maps as
  select tenant_id, count(*) as mappe, coalesce(sum(layers), 0)::bigint as livelli
  from maps
  group by tenant_id;
