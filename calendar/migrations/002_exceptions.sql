-- exceptions of a recurring series: one row per changed or removed occurrence, named by the first day of the occurrence
-- (a writer of the event writes the row; a null column leaves the value of the series)
create table exceptions (
  resource_id uuid not null,
  tenant_id   uuid not null,
  on_date     date not null,
  skipped     boolean not null default false,
  title       text,
  location    text,
  starts_time text,
  ends_time   text,
  primary key (resource_id, on_date)
);
