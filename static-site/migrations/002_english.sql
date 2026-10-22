-- English by default: English column names in the KPI view.
drop view kpi_sites;
create view kpi_sites as
  select tenant_id, count(*) as sites, coalesce(sum(files), 0)::bigint as files, coalesce(sum(size), 0)::bigint as bytes
  from sites
  group by tenant_id;
