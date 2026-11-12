-- the answer key of a quiz: a JSON object of question id to the indexes of its correct options. It is not a table a reader
-- writes and the UI cannot select from it: only the commands of the plugin read it (to score) and writers change it.
create table keys (
  resource_id uuid not null,
  tenant_id   uuid not null,
  correct     text not null,
  primary key (resource_id)
);
