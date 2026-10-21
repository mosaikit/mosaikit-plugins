create view kpi_contacts_by_company as
  select tenant_id, coalesce(company, '(non indicata)') as azienda, count(*) as contatti
  from contacts
  group by tenant_id, coalesce(company, '(non indicata)');
