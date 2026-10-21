create view kpi_sites as
  select tenant_id, count(*) as siti, coalesce(sum(files), 0)::bigint as file, coalesce(sum(size), 0)::bigint as byte
  from sites
  group by tenant_id;
