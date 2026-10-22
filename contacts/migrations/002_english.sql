-- English by default: the company kinds become English (the Italian labels are in
-- the manifest) and the KPI view gets English column names.
update contacts set company = 'Internal' where company = 'Interna';
update contacts set company = 'Customer' where company = 'Cliente';
update contacts set company = 'Supplier' where company = 'Fornitore';
drop view kpi_contacts_by_company;
create view kpi_contacts_by_company as
  select tenant_id, coalesce(company, '(not given)') as company, count(*) as contacts
  from contacts
  group by tenant_id, coalesce(company, '(not given)');
