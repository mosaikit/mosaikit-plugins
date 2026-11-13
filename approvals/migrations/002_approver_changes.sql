-- the changes of the approvers of an open request: who changed them and when (a writer of the request writes the row)
create table approver_changes (
  n           serial primary key,
  resource_id uuid not null,
  tenant_id   uuid not null,
  user_id     uuid not null,
  user_name   text not null,
  old_list    text not null,
  new_list    text not null,
  changed_at  timestamptz not null default now()
);
