-- Chat 2.0 (one-to-one and group chats). The chats and their messages are the resources `chats` and `chat_messages`;
-- the tables below hold what belongs to a person or to a message. Chat 1.x (channels) is not touched.

-- the last message and the counters of a chat (one row per chat)
create table chat_state (
  resource_id   uuid primary key,
  tenant_id     uuid not null,
  last_at       timestamptz,
  last_author   uuid,
  last_preview  text not null default '',
  last_kind     text not null default 'message',
  message_count int not null default 0
);

-- the people of a chat and the settings each one has for it
create table chat_members (
  resource_id   uuid not null,
  tenant_id     uuid not null,
  user_id       uuid not null,
  user_name     text not null,
  joined_at     timestamptz not null default now(),
  -- what a newcomer sees: null all the history, else only what is newer
  history_from  timestamptz,
  left_at       timestamptz,
  last_read_at  timestamptz,
  unread        int not null default 0,
  mentions      int not null default 0,
  marked_unread boolean not null default false,
  pinned_at     timestamptz,
  muted         boolean not null default false,
  hidden        boolean not null default false,
  primary key (resource_id, user_id)
);
create index chat_members_user on chat_members (user_id);

-- the reactions to a message (resource_id is the message)
create table chat_reactions (
  resource_id uuid not null,
  tenant_id   uuid not null,
  user_id     uuid not null,
  user_name   text not null,
  emoji       text not null,
  primary key (resource_id, user_id, emoji)
);

-- who is or was in a call (resource_id is the message of the call); seen_at is renewed every minute while the person stays
create table chat_call_joins (
  resource_id uuid not null,
  tenant_id   uuid not null,
  user_id     uuid not null,
  user_name   text not null,
  joined_at   timestamptz not null default now(),
  seen_at     timestamptz not null default now(),
  left_at     timestamptz,
  primary key (resource_id, user_id, joined_at)
);

create view kpi_chat_activity as
  select c.tenant_id,
         count(*) as chats,
         count(*) filter (where c.kind = 'group') as group_chats,
         count(*) filter (where c.kind = 'direct') as direct_chats,
         coalesce(sum(s.message_count), 0) as messages
  from chats c left join chat_state s on s.resource_id = c.resource_id
  group by c.tenant_id;
