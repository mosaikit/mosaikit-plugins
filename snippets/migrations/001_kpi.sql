-- snippets by kind, for the indicators of the tenant
create view kpi_snippets_by_kind as
  select tenant_id,
         kind,
         count(*) as snippets
  from snippets
  group by tenant_id, kind;
