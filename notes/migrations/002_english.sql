-- English by default: the tag values become English (the Italian labels are in the
-- manifest) and the KPI view gets English column names.
update notes set tag = 'personal' where tag = 'personale';
update notes set tag = 'work' where tag = 'lavoro';
update notes set tag = 'urgent' where tag = 'urgente';
drop view kpi_notes_by_tag;
create view kpi_notes_by_tag as
  select tenant_id, coalesce(tag, '(none)') as tag, count(*) as notes
  from notes
  group by tenant_id, coalesce(tag, '(none)');
