-- English by default: English column names in the KPI view.
drop view kpi_maps;
create view kpi_maps as
  select tenant_id, count(*) as maps, coalesce(sum(layers), 0)::bigint as layers
  from maps
  group by tenant_id;
