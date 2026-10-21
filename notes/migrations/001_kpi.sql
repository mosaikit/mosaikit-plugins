-- KPI: note per tag (la tabella `notes` e' generata dall'host dal manifest)
create view kpi_notes_by_tag as
  select tenant_id, coalesce(tag, '(nessuno)') as tag, count(*) as note
  from notes
  group by tenant_id, coalesce(tag, '(nessuno)');
