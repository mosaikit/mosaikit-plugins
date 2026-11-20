//! The chats of Chat 2.0: one-to-one and group conversations. A chat is a resource shared with each person who takes part
//! (at the `manage` level, so that every member can add people, as in Teams); its messages are children of it. The
//! per-person state (unread, pin, mute, hidden, what was read) lives in `chat_members`, the last message and the counters
//! in `chat_state`. Everything the page needs in one call (the list, a page of messages with reactions and calls) is
//! assembled here; the page never computes who may see what.

use crate::text::*;
use mosaikit_plugin_sdk::prelude::*;

// ------------------------------------------------------------------------------------------------------------ helpers

fn me(ctx: &Ctx) -> Result<String> {
    ctx.user
        .clone()
        .ok_or_else(|| Error::coded("not_signed_in", "sign in first"))
}

fn tenant(ctx: &Ctx) -> Result<String> {
    ctx.tenant
        .clone()
        .ok_or_else(|| Error::coded("no_tenant", "no tenant"))
}

fn arg(args: &Value, key: &str) -> String {
    args.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn arg_id(args: &Value, key: &str) -> Result<String> {
    let v = arg(args, key);
    if is_id(&v) {
        Ok(v.to_lowercase())
    } else {
        Err(Error::coded("id_invalid", format!("`{key}` is not an id")))
    }
}

fn arg_bool(args: &Value, key: &str) -> Option<bool> {
    args.get(key).and_then(Value::as_bool)
}

fn s(v: &Value, k: &str) -> String {
    match v.get(k) {
        Some(Value::String(x)) => x.clone(),
        Some(Value::Null) | None => String::new(),
        Some(o) => o.to_string(),
    }
}

fn n(v: &Value, k: &str) -> i64 {
    v.get(k).and_then(Value::as_i64).unwrap_or(0)
}

fn q(ctx: &Ctx, sql: &str, params: &[Value]) -> Result<Vec<Value>> {
    ctx.db().query(sql, params)
}

fn now(ctx: &Ctx) -> Result<Value> {
    Ok(ctx
        .db()
        .query_one("select now() as n", &[])?
        .and_then(|r| r.get("n").cloned())
        .unwrap_or(Value::Null))
}

fn not_a_member() -> Error {
    Error::coded("not_a_member", "you are not in this chat")
}

/// My active row of a chat.
fn my_member(ctx: &Ctx, chat: &str) -> Result<Value> {
    let user = me(ctx)?;
    ctx.db()
        .query_one(
            "select user_name as name, history_from, muted from chat_members where resource_id = $1::uuid and user_id = $2::uuid and left_at is null",
            &[json!(chat), json!(user)],
        )?
        .ok_or_else(not_a_member)
}

/// The chat itself: `{ name, kind, created_by }`.
fn chat_row(ctx: &Ctx, chat: &str) -> Result<Value> {
    ctx.db()
        .query_one(
            "select name, kind, created_by from chats where resource_id = $1::uuid",
            &[json!(chat)],
        )?
        .ok_or_else(|| Error::coded("chat_not_found", "no such chat"))
}

fn active_people(ctx: &Ctx, chat: &str) -> Result<Vec<Person>> {
    Ok(q(
        ctx,
        "select user_id::text as id, user_name as name, muted from chat_members where resource_id = $1::uuid and left_at is null order by joined_at, user_id",
        &[json!(chat)],
    )?
    .iter()
    .map(|r| Person { id: s(r, "id"), name: s(r, "name"), muted: truthy(r.get("muted")) })
    .collect())
}

/// `[{ id, name }]` from the page: well-formed ids, names for the screen, no duplicates, at most [`MAX_MEMBERS`].
fn people_arg(args: &Value, key: &str, but: &str) -> Result<Vec<(String, String)>> {
    let mut out: Vec<(String, String)> = Vec::new();
    for u in args
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
    {
        let id = u
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_lowercase();
        if !is_id(&id) {
            return Err(Error::coded("id_invalid", "a person needs an id"));
        }
        if id != but && !out.iter().any(|(i, _)| *i == id) {
            let name = clean_name(
                u.get("name").and_then(Value::as_str).unwrap_or_default(),
                80,
            );
            out.push((id, if name.is_empty() { "?".into() } else { name }));
        }
    }
    if out.len() > MAX_MEMBERS {
        return Err(Error::coded(
            "too_many_people",
            format!("a chat has at most {MAX_MEMBERS} people"),
        ));
    }
    Ok(out)
}

fn add_state(ctx: &Ctx, chat: &str) -> Result<()> {
    ctx.db().exec(
        "insert into chat_state (resource_id, tenant_id) values ($1::uuid, $2::uuid)",
        &[json!(chat), json!(tenant(ctx)?)],
    )?;
    Ok(())
}

/// What a newcomer sees of the history.
#[derive(Debug, Clone, PartialEq)]
enum History {
    All,
    None,
    From(String),
}

fn history_arg(args: &Value) -> History {
    match args.get("history") {
        Some(Value::String(h)) if h == "none" => History::None,
        Some(Value::String(h)) if h == "all" || h.is_empty() => History::All,
        Some(Value::String(h)) if h.len() <= 40 => History::From(h.clone()),
        _ => History::All,
    }
}

/// Makes `user` a member of the chat (or again, if they left) and shares the chat with them.
fn join(
    ctx: &Ctx,
    chat: &str,
    user: &str,
    name: &str,
    history: &History,
    share: bool,
) -> Result<()> {
    let existing = ctx.db().query_one(
        "select 1 as x from chat_members where resource_id = $1::uuid and user_id = $2::uuid",
        &[json!(chat), json!(user)],
    )?;
    if existing.is_some() {
        let (hist, mut params) = match history {
            History::All => ("null", vec![]),
            History::None => ("now()", vec![]),
            History::From(t) => ("$4::timestamptz", vec![json!(t)]),
        };
        let mut all = vec![json!(chat), json!(user), json!(name)];
        all.append(&mut params);
        ctx.db().exec(
            &format!(
                "update chat_members set left_at = null, joined_at = now(), history_from = {hist}, unread = 0, mentions = 0, hidden = false, marked_unread = false, user_name = $3
                 where resource_id = $1::uuid and user_id = $2::uuid"
            ),
            &all,
        )?;
    } else {
        let (hist, mut params) = match history {
            History::All => ("null", vec![]),
            History::None => ("now()", vec![]),
            History::From(t) => ("$5::timestamptz", vec![json!(t)]),
        };
        let mut all = vec![json!(chat), json!(tenant(ctx)?), json!(user), json!(name)];
        all.append(&mut params);
        ctx.db().exec(
            &format!("insert into chat_members (resource_id, tenant_id, user_id, user_name, history_from) values ($1::uuid, $2::uuid, $3::uuid, $4, {hist})"),
            &all,
        )?;
    }
    if share {
        ctx.resources()
            .set_share(chat, "user", Some(user), "manage", None)?;
    }
    Ok(())
}

/// A message of the chat that is not written by a person at the keyboard: «X added Y», «X started a call».
struct NewMessage<'a> {
    chat: &'a str,
    kind: &'a str,
    text: &'a str,
    author: &'a str,
    reply_to: &'a str,
    importance: &'a str,
    mentions: &'a [String],
    attachments: &'a [Value],
    meta: Value,
}

/// Creates the resource and the row of a message; returns its id.
fn insert_message(ctx: &Ctx, m: &NewMessage) -> Result<String> {
    let id = ctx
        .resources()
        .create("chat_messages", m.kind, Some(m.chat))?;
    ctx.db().exec(
        "insert into chat_messages (resource_id, kind, text, author_id, reply_to, edited, deleted, importance, mentions, attachments, meta, pinned, pinned_by)
         values ($1::uuid, $2, $3, $4, $5, false, false, $6, $7, $8, $9, false, '')",
        &[
            json!(id),
            json!(m.kind),
            json!(m.text),
            json!(m.author),
            json!(m.reply_to),
            json!(m.importance),
            json!(Value::from(m.mentions.to_vec()).to_string()),
            json!(Value::from(m.attachments.to_vec()).to_string()),
            json!(if m.meta.is_null() { String::new() } else { m.meta.to_string() }),
        ],
    )?;
    Ok(id)
}

fn system_message(
    ctx: &Ctx,
    chat: &str,
    event: &str,
    by: &Person,
    users: &[(String, String)],
    name: &str,
) -> Result<()> {
    let meta = json!({
        "event": event,
        "by": { "id": by.id, "name": by.name },
        "users": users.iter().map(|(id, n)| json!({ "id": id, "name": n })).collect::<Vec<_>>(),
        "name": name,
    });
    insert_message(
        ctx,
        &NewMessage {
            chat,
            kind: "system",
            text: "",
            author: &by.id,
            reply_to: "",
            importance: "normal",
            mentions: &[],
            attachments: &[],
            meta,
        },
    )?;
    Ok(())
}

fn myself(ctx: &Ctx, chat: &str) -> Result<Person> {
    let m = my_member(ctx, chat)?;
    Ok(Person {
        id: me(ctx)?,
        name: s(&m, "name"),
        muted: truthy(m.get("muted")),
    })
}

// ------------------------------------------------------------------------------------------------------------- list

fn chat_json(r: &Value, members: &[Value]) -> Value {
    json!({
        "id": s(r, "id"),
        "name": s(r, "name"),
        "kind": s(r, "kind"),
        "created_by": s(r, "created_by"),
        "last_at": r.get("last_at").cloned().unwrap_or(Value::Null),
        "last_preview": s(r, "last_preview"),
        "last_author": s(r, "last_author"),
        "last_kind": s(r, "last_kind"),
        "unread": n(r, "unread"),
        "mentions": n(r, "mentions"),
        "marked_unread": truthy(r.get("marked_unread")),
        "pinned_at": r.get("pinned_at").cloned().unwrap_or(Value::Null),
        "muted": truthy(r.get("muted")),
        "hidden": truthy(r.get("hidden")),
        "last_read_at": r.get("last_read_at").cloned().unwrap_or(Value::Null),
        "history_from": r.get("history_from").cloned().unwrap_or(Value::Null),
        "members": members,
    })
}

/// The chats of the caller (the ones they have not left), with the people of each.
fn my_chats(ctx: &Ctx) -> Result<Vec<Value>> {
    let user = me(ctx)?;
    let chats = q(
        ctx,
        "select c.resource_id::text as id, c.name, c.kind, c.created_by, st.last_at, st.last_preview, st.last_author, st.last_kind,
                m.unread, m.mentions, m.marked_unread, m.pinned_at, m.muted, m.hidden, m.last_read_at, m.history_from
         from chats c
         join chat_members m on m.resource_id = c.resource_id
         left join chat_state st on st.resource_id = c.resource_id
         where m.user_id = $1::uuid and m.left_at is null
         order by st.last_at desc",
        &[json!(user)],
    )?;
    let people = q(
        ctx,
        "select m.resource_id::text as chat, m.user_id::text as id, m.user_name as name, m.last_read_at
         from chat_members m
         join chat_members me on me.resource_id = m.resource_id
         where me.user_id = $1::uuid and me.left_at is null and m.left_at is null
         order by m.joined_at, m.user_id",
        &[json!(user)],
    )?;
    Ok(chats
        .iter()
        .map(|c| {
            let id = s(c, "id");
            let members: Vec<Value> = people
                .iter()
                .filter(|p| s(p, "chat") == id)
                .map(|p| json!({ "id": s(p, "id"), "name": s(p, "name"), "last_read_at": p.get("last_read_at").cloned().unwrap_or(Value::Null) }))
                .collect();
            chat_json(c, &members)
        })
        .collect())
}

/// `chats.overview`: `{ me, chats }`, the chats of the caller, newest first.
pub fn overview(ctx: &Ctx, _args: Value) -> Result<Value> {
    Ok(json!({ "me": me(ctx)?, "chats": my_chats(ctx)? }))
}

fn display_name(c: &Value, me: &str) -> String {
    let name = s(c, "name");
    if !name.trim().is_empty() {
        return name;
    }
    let others: Vec<String> = c
        .get("members")
        .and_then(Value::as_array)
        .map(|m| {
            m.iter()
                .filter(|p| s(p, "id") != me)
                .map(|p| s(p, "name"))
                .collect()
        })
        .unwrap_or_default();
    if others.is_empty() {
        s(c, "kind")
    } else {
        others.join(", ")
    }
}

/// Widget `unread-chats`: the chats with unread messages, the most unread first.
pub fn widget_unread(ctx: &Ctx, _args: Value) -> Result<Value> {
    let user = me(ctx)?;
    let mut list: Vec<(i64, String, String)> = my_chats(ctx)?
        .iter()
        .filter(|c| n(c, "unread") > 0 && !truthy(c.get("muted")))
        .map(|c| (n(c, "unread"), display_name(c, &user), s(c, "id")))
        .collect();
    list.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    let more = list.len().saturating_sub(6);
    let items: Vec<Value> = list
        .into_iter()
        .take(6)
        .map(|(u, name, id)| json!({ "id": id, "title": name, "meta": u.to_string(), "tone": "" }))
        .collect();
    Ok(json!({ "items": items, "more": more }))
}

// ----------------------------------------------------------------------------------------------------- people, chats

/// `chats.open_direct { user, name }`: the one-to-one chat with a person (the same one every time); made if it does not exist.
pub fn open_direct(ctx: &Ctx, args: Value) -> Result<Value> {
    let user = me(ctx)?;
    let other = arg_id(&args, "user")?;
    let other_name = {
        let nme = clean_name(&arg(&args, "name"), 80);
        if nme.is_empty() {
            "?".to_string()
        } else {
            nme
        }
    };
    let my_name = clean_name(&arg(&args, "my_name"), 80);
    let key = pair_key(&user, &other);
    if let Some(row) = ctx.db().query_one(
        "select resource_id::text as id from chats where pair = $1",
        &[json!(key)],
    )? {
        let id = s(&row, "id");
        // a person who hid the chat or left it comes back to it
        let mine = ctx.db().query_one(
            "select 1 as x from chat_members where resource_id = $1::uuid and user_id = $2::uuid",
            &[json!(id), json!(user)],
        )?;
        if mine.is_some() {
            ctx.db().exec(
                "update chat_members set hidden = false, left_at = null where resource_id = $1::uuid and user_id = $2::uuid",
                &[json!(id), json!(user)],
            )?;
        } else {
            join(ctx, &id, &user, &my_name, &History::All, false)?;
        }
        return Ok(json!({ "id": id, "created": false }));
    }
    let id = ctx.resources().create("chats", "Chat", None)?;
    ctx.db().exec(
        "insert into chats (resource_id, name, kind, pair, created_by) values ($1::uuid, '', 'direct', $2, $3)",
        &[json!(id), json!(key), json!(user)],
    )?;
    add_state(ctx, &id)?;
    join(
        ctx,
        &id,
        &user,
        if my_name.is_empty() { "?" } else { &my_name },
        &History::All,
        false,
    )?;
    if other != user {
        join(ctx, &id, &other, &other_name, &History::All, true)?;
    }
    Ok(json!({ "id": id, "created": true }))
}

/// `chats.create_group { name?, users: [{ id, name }], my_name }`: a group chat with the people chosen (and the caller).
pub fn create_group(ctx: &Ctx, args: Value) -> Result<Value> {
    let user = me(ctx)?;
    let people = people_arg(&args, "users", &user)?;
    if people.is_empty() {
        return Err(Error::coded(
            "people_missing",
            "a group needs at least one other person",
        ));
    }
    let name = clean_name(&arg(&args, "name"), 80);
    let my_name = clean_name(&arg(&args, "my_name"), 80);
    let id = ctx.resources().create(
        "chats",
        if name.is_empty() { "Group chat" } else { &name },
        None,
    )?;
    ctx.db().exec(
        "insert into chats (resource_id, name, kind, pair, created_by) values ($1::uuid, $2, 'group', '', $3)",
        &[json!(id), json!(name), json!(user)],
    )?;
    add_state(ctx, &id)?;
    join(
        ctx,
        &id,
        &user,
        if my_name.is_empty() { "?" } else { &my_name },
        &History::All,
        false,
    )?;
    for (uid, uname) in &people {
        join(ctx, &id, uid, uname, &History::All, true)?;
    }
    Ok(json!({ "id": id }))
}

/// `chats.members { chat }`: the people of the chat, with the ones who left.
pub fn members(ctx: &Ctx, args: Value) -> Result<Value> {
    let chat = arg_id(&args, "chat")?;
    my_member(ctx, &chat)?;
    Ok(Value::Array(
        q(
            ctx,
            "select user_id::text as id, user_name as name, joined_at, history_from, last_read_at, (left_at is not null) as has_left
             from chat_members where resource_id = $1::uuid order by joined_at, user_id",
            &[json!(chat)],
        )?
        .iter()
        .map(|r| {
            json!({ "id": s(r, "id"), "name": s(r, "name"), "joined_at": r.get("joined_at"), "history_from": r.get("history_from"),
                    "last_read_at": r.get("last_read_at"), "left": truthy(r.get("has_left")) })
        })
        .collect(),
    ))
}

fn group_only(ctx: &Ctx, chat: &str) -> Result<Value> {
    let c = chat_row(ctx, chat)?;
    if s(&c, "kind") != "group" {
        return Err(Error::coded(
            "not_a_group",
            "people can only be added to or removed from a group chat",
        ));
    }
    Ok(c)
}

/// `chats.add_members { chat, users, history }`: people join a group; `history` is `all`, `none` or a time from which they see.
pub fn add_members(ctx: &Ctx, args: Value) -> Result<Value> {
    let chat = arg_id(&args, "chat")?;
    group_only(ctx, &chat)?;
    let by = myself(ctx, &chat)?;
    let people = people_arg(&args, "users", &by.id)?;
    let history = history_arg(&args);
    let present: Vec<String> = active_people(ctx, &chat)?
        .into_iter()
        .map(|p| p.id)
        .collect();
    if present.len() + people.len() > MAX_MEMBERS {
        return Err(Error::coded(
            "too_many_people",
            format!("a chat has at most {MAX_MEMBERS} people"),
        ));
    }
    let new: Vec<(String, String)> = people
        .into_iter()
        .filter(|(id, _)| !present.contains(id))
        .collect();
    for (id, name) in &new {
        join(ctx, &chat, id, name, &history, true)?;
    }
    if !new.is_empty() {
        system_message(ctx, &chat, "added", &by, &new, "")?;
    }
    Ok(json!({ "added": new.len() }))
}

fn leave_chat(ctx: &Ctx, chat: &str, user: &str) -> Result<()> {
    ctx.db().exec(
        "update chat_members set left_at = now(), hidden = false, pinned_at = null where resource_id = $1::uuid and user_id = $2::uuid and left_at is null",
        &[json!(chat), json!(user)],
    )?;
    let c = chat_row(ctx, chat)?;
    // the owner keeps the technical access of the platform; the chat is gone from their list all the same
    if s(&c, "created_by") != user {
        ctx.resources().remove_share(chat, "user", Some(user))?;
    }
    Ok(())
}

/// `chats.remove_member { chat, user }`: takes a person out of a group.
pub fn remove_member(ctx: &Ctx, args: Value) -> Result<Value> {
    let chat = arg_id(&args, "chat")?;
    let user = arg_id(&args, "user")?;
    group_only(ctx, &chat)?;
    let by = myself(ctx, &chat)?;
    let target = active_people(ctx, &chat)?
        .into_iter()
        .find(|p| p.id == user)
        .ok_or_else(|| Error::coded("not_a_member", "that person is not in the chat"))?;
    // the system message first: once the share is gone the caller may not write there any more
    system_message(
        ctx,
        &chat,
        if user == by.id { "left" } else { "removed" },
        &by,
        &[(target.id.clone(), target.name.clone())],
        "",
    )?;
    leave_chat(ctx, &chat, &user)?;
    Ok(json!({ "removed": true }))
}

/// `chats.leave { chat }`: leaves a group; a one-to-one chat is only hidden (a new message brings it back).
pub fn leave(ctx: &Ctx, args: Value) -> Result<Value> {
    let chat = arg_id(&args, "chat")?;
    let user = me(ctx)?;
    let c = chat_row(ctx, &chat)?;
    let by = myself(ctx, &chat)?;
    if s(&c, "kind") == "direct" {
        ctx.db().exec("update chat_members set hidden = true, pinned_at = null where resource_id = $1::uuid and user_id = $2::uuid", &[json!(chat), json!(user)])?;
        return Ok(json!({ "left": false, "hidden": true }));
    }
    system_message(
        ctx,
        &chat,
        "left",
        &by,
        &[(by.id.clone(), by.name.clone())],
        "",
    )?;
    leave_chat(ctx, &chat, &user)?;
    Ok(json!({ "left": true }))
}

/// `chats.rename { chat, name }`: names (or renames) a group.
pub fn rename(ctx: &Ctx, args: Value) -> Result<Value> {
    let chat = arg_id(&args, "chat")?;
    group_only(ctx, &chat)?;
    let by = myself(ctx, &chat)?;
    let name = clean_name(&arg(&args, "name"), 80);
    ctx.db().exec(
        "update chats set name = $2 where resource_id = $1::uuid",
        &[json!(chat), json!(name)],
    )?;
    system_message(ctx, &chat, "renamed", &by, &[], &name)?;
    Ok(json!({ "name": name }))
}

/// `chats.settings { chat, pinned?, muted?, hidden?, unread? }`: the caller's own settings of a chat.
pub fn settings(ctx: &Ctx, args: Value) -> Result<Value> {
    let chat = arg_id(&args, "chat")?;
    let user = me(ctx)?;
    my_member(ctx, &chat)?;
    let mut sets: Vec<&str> = Vec::new();
    match arg_bool(&args, "pinned") {
        Some(true) => sets.push("pinned_at = now()"),
        Some(false) => sets.push("pinned_at = null"),
        None => {}
    }
    match arg_bool(&args, "muted") {
        Some(true) => sets.push("muted = true"),
        Some(false) => sets.push("muted = false"),
        None => {}
    }
    match arg_bool(&args, "hidden") {
        Some(true) => sets.push("hidden = true"),
        Some(false) => sets.push("hidden = false"),
        None => {}
    }
    match arg_bool(&args, "unread") {
        Some(true) => sets.push("marked_unread = true"),
        Some(false) => sets.push("marked_unread = false"),
        None => {}
    }
    if sets.is_empty() {
        return Err(Error::coded("nothing_to_change", "no setting given"));
    }
    ctx.db().exec(
        &format!(
            "update chat_members set {} where resource_id = $1::uuid and user_id = $2::uuid",
            sets.join(", ")
        ),
        &[json!(chat), json!(user)],
    )?;
    Ok(json!({ "ok": true }))
}

/// `chats.touch { name }`: the caller's name as they see it now, in every chat they are in (a name can change).
pub fn touch(ctx: &Ctx, args: Value) -> Result<Value> {
    let name = clean_name(&arg(&args, "name"), 80);
    if name.is_empty() {
        return Ok(json!({ "changed": 0 }));
    }
    let n = ctx.db().exec(
        "update chat_members set user_name = $1 where user_id = $2::uuid and user_name <> $1",
        &[json!(name), json!(me(ctx)?)],
    )?;
    Ok(json!({ "changed": n }))
}

/// `chats.mark_read { chat }`: the caller has read the chat up to now.
pub fn mark_read(ctx: &Ctx, args: Value) -> Result<Value> {
    let chat = arg_id(&args, "chat")?;
    let user = me(ctx)?;
    my_member(ctx, &chat)?;
    ctx.db().exec(
        "update chat_members set last_read_at = now(), unread = 0, mentions = 0, marked_unread = false where resource_id = $1::uuid and user_id = $2::uuid",
        &[json!(chat), json!(user)],
    )?;
    let _ = ctx.notify_done(&NoticeRef::resource(&chat));
    Ok(json!({ "ok": true }))
}

// ------------------------------------------------------------------------------------------------------------ messages

const MSG_COLS: &str = "v.id::text as id, v.parent_id::text as chat, v.created_at as at, m.kind, m.text, m.author_id, m.reply_to, m.edited, m.deleted, m.importance, m.mentions, m.attachments, m.meta, m.pinned, m.pinned_by";

enum Which {
    /// the latest messages, or the ones before `before`
    Page {
        before: Option<String>,
        limit: i64,
    },
    Pinned,
    Files,
    One(String),
}

fn shape(rows: &[Value], reactions: &[Value], joins: &[Value]) -> Vec<Value> {
    rows.iter()
        .map(|r| {
            let id = s(r, "id");
            let kind = s(r, "kind");
            let deleted = truthy(r.get("deleted"));
            let mut react = Value::Object(Default::default());
            for x in reactions.iter().filter(|x| s(x, "mid") == id) {
                if let Some(map) = react.as_object_mut() {
                    let list = map.entry(s(x, "emoji")).or_insert_with(|| json!([]));
                    if let Some(a) = list.as_array_mut() {
                        a.push(json!({ "id": s(x, "uid"), "name": s(x, "name") }));
                    }
                }
            }
            let mut m = json!({
                "id": id,
                "chat": s(r, "chat"),
                "at": r.get("at").cloned().unwrap_or(Value::Null),
                "kind": kind,
                "text": if deleted { String::new() } else { s(r, "text") },
                "author": s(r, "author_id"),
                "reply_to": s(r, "reply_to"),
                "edited": truthy(r.get("edited")),
                "deleted": deleted,
                "importance": s(r, "importance"),
                "mentions": parse_json(&s(r, "mentions"), json!([])),
                "attachments": if deleted { json!([]) } else { parse_json(&s(r, "attachments"), json!([])) },
                "meta": parse_json(&s(r, "meta"), json!({})),
                "pinned": truthy(r.get("pinned")),
                "pinned_by": s(r, "pinned_by"),
                "reactions": react,
            });
            if kind == "call" {
                let mine: Vec<&Value> = joins.iter().filter(|j| s(j, "mid") == id).collect();
                let live: Vec<Value> = mine.iter().filter(|j| truthy(j.get("live"))).map(|j| json!({ "id": s(j, "uid"), "name": s(j, "name") })).collect();
                let mut seen: Vec<Value> = Vec::new();
                for j in &mine {
                    if !seen.iter().any(|x| s(x, "id") == s(j, "uid")) {
                        seen.push(json!({ "id": s(j, "uid"), "name": s(j, "name") }));
                    }
                }
                let last = mine.iter().filter_map(|j| j.get("left_at").filter(|v| !v.is_null()).or_else(|| j.get("seen_at"))).max_by_key(|v| v.to_string()).cloned();
                m["call"] = json!({ "live": live, "joined": seen, "last": last });
            }
            m
        })
        .collect()
}

/// Reads messages of a chat the caller is in, with their reactions and, for calls, who joined.
fn load(ctx: &Ctx, chat: &str, which: Which) -> Result<Vec<Value>> {
    let mine = my_member(ctx, chat)?;
    let mut params = vec![json!(chat)];
    let mut sql = format!("select {MSG_COLS} from chat_messages m join core.visible_resources v on v.id = m.resource_id where v.parent_id = $1::uuid");
    if let Some(h) = mine.get("history_from").filter(|h| !h.is_null()) {
        params.push(h.clone());
        sql.push_str(&format!(
            " and v.created_at >= ${}::timestamptz",
            params.len()
        ));
    }
    let mut limit = 100;
    match &which {
        Which::Page { before, limit: l } => {
            if let Some(b) = before {
                params.push(json!(b));
                sql.push_str(&format!(
                    " and v.created_at < ${}::timestamptz",
                    params.len()
                ));
            }
            limit = (*l).clamp(1, 100);
        }
        Which::Pinned => sql.push_str(" and m.pinned and not m.deleted"),
        Which::Files => {
            sql.push_str(" and not m.deleted and m.attachments <> '[]' and m.attachments <> ''")
        }
        Which::One(id) => {
            params.push(json!(id));
            sql.push_str(&format!(" and v.id = ${}::uuid", params.len()));
            limit = 1;
        }
    }
    sql.push_str(&format!(
        " order by v.created_at desc, v.id desc limit {limit}"
    ));
    let mut rows = q(ctx, &sql, &params)?;
    rows.reverse();
    let Some(oldest) = rows.first().and_then(|r| r.get("at")).cloned() else {
        return Ok(Vec::new());
    };
    let reactions = q(
        ctx,
        "select r.resource_id::text as mid, r.emoji, r.user_id::text as uid, r.user_name as name
         from chat_reactions r join core.visible_resources v on v.id = r.resource_id
         where v.parent_id = $1::uuid and v.created_at >= $2::timestamptz order by r.resource_id, r.user_name",
        &[json!(chat), oldest.clone()],
    )?;
    let joins = if rows.iter().any(|r| s(r, "kind") == "call") {
        q(
            ctx,
            "select j.resource_id::text as mid, j.user_id::text as uid, j.user_name as name, j.joined_at, j.seen_at, j.left_at,
                    (j.left_at is null and j.seen_at >= now() - interval '3 minutes') as live
             from chat_call_joins j join core.visible_resources v on v.id = j.resource_id
             where v.parent_id = $1::uuid and v.created_at >= $2::timestamptz order by j.joined_at",
            &[json!(chat), oldest],
        )?
    } else {
        Vec::new()
    };
    Ok(shape(&rows, &reactions, &joins))
}

/// `chats.messages { chat, before?, limit?, only? }`: a page of messages, oldest first, with the people of the chat (for
/// names and the «seen» marks). `only` is `pinned` or `files`.
pub fn messages(ctx: &Ctx, args: Value) -> Result<Value> {
    let chat = arg_id(&args, "chat")?;
    let which = match arg(&args, "only").as_str() {
        "pinned" => Which::Pinned,
        "files" => Which::Files,
        _ => Which::Page {
            before: Some(arg(&args, "before")).filter(|b| !b.is_empty()),
            limit: args.get("limit").and_then(Value::as_i64).unwrap_or(40),
        },
    };
    let paged = matches!(which, Which::Page { .. });
    let wanted = if let Which::Page { limit, .. } = &which {
        (*limit).clamp(1, 100) as usize
    } else {
        100
    };
    let list = load(ctx, &chat, which)?;
    let people = q(
        ctx,
        "select user_id::text as id, user_name as name, last_read_at, (left_at is not null) as has_left from chat_members where resource_id = $1::uuid order by joined_at, user_id",
        &[json!(chat)],
    )?;
    let people: Vec<Value> = people
        .iter()
        .map(|p| json!({ "id": s(p, "id"), "name": s(p, "name"), "last_read_at": p.get("last_read_at"), "left": truthy(p.get("has_left")) }))
        .collect();
    Ok(json!({ "messages": list, "more": paged && list.len() >= wanted, "members": people }))
}

/// `chats.message { id }`: one message as `messages` shows it (what a hint of the live channel asks for).
pub fn message(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args, "id")?;
    let row = ctx
        .db()
        .query_one("select v.parent_id::text as chat from core.visible_resources v where v.id = $1::uuid and v.kind = 'chat_messages'", &[json!(id)])?
        .ok_or_else(|| Error::coded("message_not_found", "no such message"))?;
    let chat = s(&row, "chat");
    load(ctx, &chat, Which::One(id))?
        .into_iter()
        .next()
        .ok_or_else(|| Error::coded("message_not_found", "no such message"))
}

/// `chats.send { chat, text, reply_to?, importance?, attachments? }`: a message, as the caller.
pub fn send(ctx: &Ctx, args: Value) -> Result<Value> {
    let chat = arg_id(&args, "chat")?;
    let user = me(ctx)?;
    let files = clean_attachments(args.get("attachments").unwrap_or(&Value::Null))?;
    let text = clean_text(&arg(&args, "text"), !files.is_empty())?;
    let importance = clean_importance(&arg(&args, "importance"))?;
    let reply_to = {
        let r = arg(&args, "reply_to");
        if r.is_empty() {
            String::new()
        } else {
            arg_id(&args, "reply_to")?
        }
    };
    let c = chat_row(ctx, &chat)?;
    let mine = my_member(ctx, &chat)?;
    let author = Person {
        id: user.clone(),
        name: s(&mine, "name"),
        muted: false,
    };
    if !reply_to.is_empty() {
        let ok = ctx.db().query_one(
            "select 1 as x from core.visible_resources v where v.id = $1::uuid and v.parent_id = $2::uuid",
            &[json!(reply_to), json!(chat)],
        )?;
        if ok.is_none() {
            return Err(Error::coded(
                "reply_invalid",
                "the message you answer is not in this chat",
            ));
        }
    }
    let people = active_people(ctx, &chat)?;
    let named = mentions(&text, &people, &user);
    let id = insert_message(
        ctx,
        &NewMessage {
            chat: &chat,
            kind: "message",
            text: &text,
            author: &user,
            reply_to: &reply_to,
            importance,
            mentions: &named,
            attachments: &files,
            meta: Value::Null,
        },
    )?;
    let pv = preview("message", &text, &files);
    after_new(ctx, &chat, &user, &pv, "message", true)?;
    for p in plan_notices(
        &author,
        &s(&c, "name"),
        s(&c, "kind") == "group",
        &pv,
        importance,
        &people,
        &named,
    ) {
        notify(ctx, &chat, &p);
    }
    for m in &named {
        ctx.db().exec("update chat_members set mentions = mentions + 1 where resource_id = $1::uuid and user_id = $2::uuid", &[json!(chat), json!(m)])?;
    }
    message(ctx, json!({ "id": id }))
}

/// The state after a new message: the preview and the counters of the chat, the unread of the others (and the chat back
/// in their list), the caller has read everything.
fn after_new(
    ctx: &Ctx,
    chat: &str,
    user: &str,
    preview: &str,
    kind: &str,
    counts: bool,
) -> Result<()> {
    ctx.db().exec(
        &format!(
            "update chat_state set last_at = now(), last_author = $2::uuid, last_preview = $3, last_kind = $4{} where resource_id = $1::uuid",
            if counts { ", message_count = message_count + 1" } else { "" }
        ),
        &[json!(chat), json!(user), json!(preview), json!(kind)],
    )?;
    ctx.db().exec(
        "update chat_members set unread = unread + 1, hidden = false where resource_id = $1::uuid and left_at is null and user_id <> $2::uuid",
        &[json!(chat), json!(user)],
    )?;
    ctx.db().exec(
        "update chat_members set last_read_at = now(), unread = 0, mentions = 0, marked_unread = false, hidden = false where resource_id = $1::uuid and user_id = $2::uuid",
        &[json!(chat), json!(user)],
    )?;
    Ok(())
}

/// Hands a notification to the kernel; a refusal (the limit of the minute, an old kernel) never stops the message.
fn notify(ctx: &Ctx, chat: &str, p: &Plan) {
    let n = Notice::new(&cut(&p.title, 160))
        .body(&cut(&p.body, 600))
        .at(&format!("chat/{chat}"))
        .resource(chat)
        .to(&p.to);
    let _ = ctx.notify(&n);
}

/// `chats.delete_message { id }`: the author deletes their message; the place stays («This message was deleted»).
pub fn delete_message(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args, "id")?;
    let user = me(ctx)?;
    let done = ctx.db().query(
        "update chat_messages set deleted = true, text = '', attachments = '[]', pinned = false where resource_id = $1::uuid and author_id = $2 and kind = 'message' returning 1 as x",
        &[json!(id), json!(user)],
    )?;
    if done.is_empty() {
        return Err(Error::coded(
            "forbidden",
            "only the author deletes a message",
        ));
    }
    ctx.db().exec(
        "delete from chat_reactions where resource_id = $1::uuid",
        &[json!(id)],
    )?;
    message(ctx, json!({ "id": id }))
}

/// `chats.react { id, emoji }`: puts the caller's reaction on a message, or takes it back.
pub fn react(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args, "id")?;
    let user = me(ctx)?;
    let emoji = clean_emoji(&arg(&args, "emoji"))?;
    let row = ctx
        .db()
        .query_one("select v.parent_id::text as chat from core.visible_resources v where v.id = $1::uuid and v.kind = 'chat_messages'", &[json!(id)])?
        .ok_or_else(|| Error::coded("message_not_found", "no such message"))?;
    let mine = my_member(ctx, &s(&row, "chat"))?;
    let had = ctx.db().query_one(
        "select 1 as x from chat_reactions where resource_id = $1::uuid and user_id = $2::uuid and emoji = $3",
        &[json!(id), json!(user), json!(emoji)],
    )?;
    if had.is_some() {
        ctx.db().exec("delete from chat_reactions where resource_id = $1::uuid and user_id = $2::uuid and emoji = $3", &[json!(id), json!(user), json!(emoji)])?;
    } else {
        let kinds = ctx.db().query_one("select count(distinct emoji) as k from chat_reactions where resource_id = $1::uuid", &[json!(id)])?.map(|r| n(&r, "k")).unwrap_or(0);
        if kinds >= 24 {
            return Err(Error::coded(
                "too_many_reactions",
                "a message has at most 24 different reactions",
            ));
        }
        ctx.db().exec(
            "insert into chat_reactions (resource_id, tenant_id, user_id, user_name, emoji) values ($1::uuid, $2::uuid, $3::uuid, $4, $5)",
            &[json!(id), json!(tenant(ctx)?), json!(user), json!(s(&mine, "name")), json!(emoji)],
        )?;
    }
    message(ctx, json!({ "id": id }))
}

/// `chats.pin_message { id, pinned }`: any person of the chat pins or unpins a message.
pub fn pin_message(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args, "id")?;
    let pinned = arg_bool(&args, "pinned").unwrap_or(true);
    let row = ctx
        .db()
        .query_one("select v.parent_id::text as chat from core.visible_resources v where v.id = $1::uuid and v.kind = 'chat_messages'", &[json!(id)])?
        .ok_or_else(|| Error::coded("message_not_found", "no such message"))?;
    let me_ = myself(ctx, &s(&row, "chat"))?;
    ctx.db().exec(
        "update chat_messages set pinned = $2, pinned_by = $3 where resource_id = $1::uuid and kind = 'message' and not deleted",
        &[json!(id), json!(pinned), json!(if pinned { me_.id.clone() } else { String::new() })],
    )?;
    message(ctx, json!({ "id": id }))
}

/// `chats.search { q, chat? }`: messages whose text contains `q`, in the chats of the caller (or in one), newest first.
pub fn search(ctx: &Ctx, args: Value) -> Result<Value> {
    let user = me(ctx)?;
    let text: String = arg(&args, "q")
        .chars()
        .filter(|c| !matches!(c, '%' | '_' | '\\') && !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(80)
        .collect();
    if text.chars().count() < 2 {
        return Ok(json!([]));
    }
    let mut params = vec![json!(user), json!(text)];
    let mut sql = "select v.id::text as id, v.parent_id::text as chat, v.created_at as at, m.text, m.author_id, me.user_name as me_name
         from chat_messages m
         join core.visible_resources v on v.id = m.resource_id
         join chat_members me on me.resource_id = v.parent_id and me.user_id = $1::uuid and me.left_at is null
         where m.kind = 'message' and not m.deleted and lower(m.text) like '%' || lower($2) || '%'
           and (me.history_from is null or v.created_at >= me.history_from)"
        .to_string();
    if !arg(&args, "chat").is_empty() {
        params.push(json!(arg_id(&args, "chat")?));
        sql.push_str(" and v.parent_id = $3::uuid");
    }
    sql.push_str(" order by v.created_at desc limit 30");
    let rows = q(ctx, &sql, &params)?;
    let names = q(
        ctx,
        "select m.resource_id::text as chat, m.user_id::text as id, m.user_name as name from chat_members m join chat_members me on me.resource_id = m.resource_id where me.user_id = $1::uuid and me.left_at is null",
        &[json!(user)],
    )?;
    Ok(Value::Array(
        rows.iter()
            .map(|r| {
                let who = names.iter().find(|x| s(x, "chat") == s(r, "chat") && s(x, "id") == s(r, "author_id")).map(|x| s(x, "name")).unwrap_or_default();
                json!({ "id": s(r, "id"), "chat": s(r, "chat"), "at": r.get("at"), "text": cut(&plain(&s(r, "text")), 160), "author": s(r, "author_id"), "author_name": who })
            })
            .collect(),
    ))
}

// ------------------------------------------------------------------------------------------------------------- calls

/// The room of a call on the meeting service: the chat and the message of the call, which only the people of the chat see.
pub fn room_name(chat: &str, message: &str) -> String {
    format!(
        "mosaikit-{}-{}",
        chat.replace('-', "").to_lowercase(),
        message.replace('-', "").to_lowercase()
    )
}

fn call_of(ctx: &Ctx, id: &str) -> Result<(Value, String)> {
    let row = ctx
        .db()
        .query_one(
            "select v.parent_id::text as chat, m.kind, m.meta from chat_messages m join core.visible_resources v on v.id = m.resource_id where v.id = $1::uuid",
            &[json!(id)],
        )?
        .ok_or_else(|| Error::coded("message_not_found", "no such call"))?;
    if s(&row, "kind") != "call" {
        return Err(Error::coded("not_a_call", "that message is not a call"));
    }
    let chat = s(&row, "chat");
    Ok((parse_json(&s(&row, "meta"), json!({})), chat))
}

fn join_row(ctx: &Ctx, id: &str, user: &str, name: &str) -> Result<()> {
    let open = ctx.db().query_one(
        "select 1 as x from chat_call_joins where resource_id = $1::uuid and user_id = $2::uuid and left_at is null",
        &[json!(id), json!(user)],
    )?;
    if open.is_some() {
        ctx.db().exec("update chat_call_joins set seen_at = now() where resource_id = $1::uuid and user_id = $2::uuid and left_at is null", &[json!(id), json!(user)])?;
    } else {
        ctx.db().exec(
            "insert into chat_call_joins (resource_id, tenant_id, user_id, user_name) values ($1::uuid, $2::uuid, $3::uuid, $4)",
            &[json!(id), json!(tenant(ctx)?), json!(user), json!(name)],
        )?;
    }
    Ok(())
}

/// The call of the chat that people are in right now, if any.
fn live_call(ctx: &Ctx, chat: &str) -> Result<Option<String>> {
    Ok(ctx
        .db()
        .query_one(
            "select v.id::text as id from chat_messages m join core.visible_resources v on v.id = m.resource_id
             where v.parent_id = $1::uuid and m.kind = 'call' and m.meta not like '%ended_at%'
               and exists (select 1 from chat_call_joins j where j.resource_id = m.resource_id and j.left_at is null and j.seen_at >= now() - interval '3 minutes')
             order by v.created_at desc limit 1",
            &[json!(chat)],
        )?
        .map(|r| s(&r, "id")))
}

/// `chats.call_start { chat, audio_only? }`: starts a group call in the chat, or joins the one that is going on.
pub fn call_start(ctx: &Ctx, args: Value) -> Result<Value> {
    let chat = arg_id(&args, "chat")?;
    let me_ = myself(ctx, &chat)?;
    if let Some(id) = live_call(ctx, &chat)? {
        join_row(ctx, &id, &me_.id, &me_.name)?;
        return message(ctx, json!({ "id": id }));
    }
    let audio = arg_bool(&args, "audio_only").unwrap_or(false);
    let at = now(ctx)?;
    // the room needs the id of the message, which is made first: the meta is completed right after
    let id = insert_message(
        ctx,
        &NewMessage {
            chat: &chat,
            kind: "call",
            text: "",
            author: &me_.id,
            reply_to: "",
            importance: "normal",
            mentions: &[],
            attachments: &[],
            meta: Value::Null,
        },
    )?;
    let meta = json!({ "engine": "jitsi", "room": room_name(&chat, &id), "audio_only": audio, "started_at": at });
    ctx.db().exec(
        "update chat_messages set meta = $2 where resource_id = $1::uuid",
        &[json!(id), json!(meta.to_string())],
    )?;
    join_row(ctx, &id, &me_.id, &me_.name)?;
    after_new(ctx, &chat, &me_.id, "📞", "call", false)?;
    let people = active_people(ctx, &chat)?;
    let c = chat_row(ctx, &chat)?;
    let others: Vec<String> = people
        .iter()
        .filter(|p| p.id != me_.id)
        .map(|p| p.id.clone())
        .collect();
    if !others.is_empty() {
        let title = format!(
            "{} started a {}call{}",
            me_.name,
            if audio { "voice " } else { "" },
            if s(&c, "kind") == "group" && !s(&c, "name").is_empty() {
                format!(" · {}", s(&c, "name"))
            } else {
                String::new()
            }
        );
        notify(
            ctx,
            &chat,
            &Plan {
                title,
                body: String::new(),
                to: others,
                mention: false,
            },
        );
    }
    message(ctx, json!({ "id": id }))
}

/// `chats.call_join { id }`: the caller is in the call (called again every minute while they stay, so that a closed tab does not keep the call open).
pub fn call_join(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args, "id")?;
    let (meta, chat) = call_of(ctx, &id)?;
    if meta.get("ended_at").is_some_and(|v| !v.is_null()) {
        return Err(Error::coded("call_ended", "this call has ended"));
    }
    let me_ = myself(ctx, &chat)?;
    join_row(ctx, &id, &me_.id, &me_.name)?;
    message(ctx, json!({ "id": id }))
}

/// `chats.call_leave { id }`: the caller leaves; when nobody is left the call ends and keeps its end time.
pub fn call_leave(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args, "id")?;
    let user = me(ctx)?;
    let (mut meta, _chat) = call_of(ctx, &id)?;
    ctx.db().exec("update chat_call_joins set left_at = now() where resource_id = $1::uuid and user_id = $2::uuid and left_at is null", &[json!(id), json!(user)])?;
    let open = ctx
        .db()
        .query_one(
            "select count(*) as k from chat_call_joins where resource_id = $1::uuid and left_at is null and seen_at >= now() - interval '3 minutes'",
            &[json!(id)],
        )?
        .map(|r| n(&r, "k"))
        .unwrap_or(0);
    if open == 0 && meta.get("ended_at").is_none_or(Value::is_null) {
        meta["ended_at"] = now(ctx)?;
        ctx.db().exec(
            "update chat_messages set meta = $2 where resource_id = $1::uuid",
            &[json!(id), json!(meta.to_string())],
        )?;
    }
    message(ctx, json!({ "id": id }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;
    use std::cell::RefCell;
    use std::rc::Rc;

    const ME: &str = "00000000-0000-0000-0000-000000000001";
    const ANN: &str = "00000000-0000-0000-0000-0000000000a1";
    const BOB: &str = "00000000-0000-0000-0000-0000000000b2";
    const CHAT: &str = "0b8e6f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
    const MSG: &str = "1b8e6f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b";

    /// A host whose database answers by a piece of the SQL; every statement is kept in the log.
    fn db(routes: Vec<(&'static str, Value)>) -> (MockHost, Rc<RefCell<Vec<String>>>) {
        let log: Rc<RefCell<Vec<String>>> = Rc::default();
        let (l1, l2) = (log.clone(), log.clone());
        let routes = Rc::new(routes);
        let host = MockHost::new()
            .on("db.query", move |req| {
                let sql = req["sql"].as_str().unwrap_or_default().to_string();
                l1.borrow_mut().push(sql.clone());
                Ok(routes
                    .iter()
                    .find(|(k, _)| sql.contains(k))
                    .map(|(_, v)| v.clone())
                    .unwrap_or(json!([])))
            })
            .on("db.exec", move |req| {
                l2.borrow_mut()
                    .push(req["sql"].as_str().unwrap_or_default().to_string());
                Ok(json!({ "rows": 1 }))
            })
            .on("resource.create", |req| {
                Ok(json!(if req["kind"] == "chats" { CHAT } else { MSG }))
            })
            .on("resource.share_set", |_| Ok(Value::Null))
            .on("resource.share_remove", |_| Ok(Value::Null));
        (host, log)
    }

    fn registry() -> mosaikit_plugin_sdk::Registry {
        crate::__msk_registry()
    }

    #[test]
    fn a_one_to_one_chat_is_made_once_for_the_pair() {
        let (host, log) = db(vec![]);
        let out = host
            .command(
                &registry(),
                "chats.open_direct",
                json!({ "user": ANN, "name": "Ann", "my_name": "Me" }),
            )
            .unwrap();
        assert_eq!(out, json!({ "id": CHAT, "created": true }));
        let sql = log.borrow().join("\n");
        assert!(sql.contains("insert into chats") && sql.contains("insert into chat_state"));
        assert_eq!(sql.matches("insert into chat_members").count(), 2);
        // only the other person is shared with
        let shares: Vec<_> = host
            .calls()
            .into_iter()
            .filter(|(op, _)| op == "resource.share_set")
            .collect();
        assert_eq!(shares.len(), 1);
        assert_eq!(shares[0].1["principal_id"], ANN);
        assert_eq!(shares[0].1["level"], "manage");
        // the key of the pair is the same whoever asks
        let key = crate::text::pair_key(ME, ANN);
        assert!(host
            .calls()
            .iter()
            .any(|(op, r)| op == "db.query" && r["params"][0] == key.as_str()));

        // when the chat exists it is found, shown again, and nothing is created
        let (host, log) = db(vec![
            ("from chats where pair", json!([{ "id": CHAT }])),
            ("from chat_members where resource_id", json!([{ "x": 1 }])),
        ]);
        let out = host
            .command(
                &registry(),
                "chats.open_direct",
                json!({ "user": ANN, "name": "Ann" }),
            )
            .unwrap();
        assert_eq!(out, json!({ "id": CHAT, "created": false }));
        assert!(log.borrow().iter().any(|q| q.contains("hidden = false")));
        assert!(!log.borrow().iter().any(|q| q.contains("insert into")));
    }

    #[test]
    fn a_group_needs_other_people_and_shares_with_each() {
        let (host, _) = db(vec![]);
        assert_eq!(
            host.command_err(
                &registry(),
                "chats.create_group",
                json!({ "name": "x", "users": [] })
            )
            .unwrap_err()
            .code
            .as_deref(),
            Some("people_missing")
        );
        // the caller and duplicates do not count
        assert!(host
            .command(
                &registry(),
                "chats.create_group",
                json!({ "users": [{ "id": ME, "name": "Me" }, { "id": ME, "name": "Me" }] })
            )
            .is_err());
        host.command(&registry(), "chats.create_group", json!({ "name": "  Team  ", "my_name": "Me", "users": [{ "id": ANN, "name": "Ann" }, { "id": BOB, "name": "Bob" }, { "id": ANN, "name": "Ann" }] })).unwrap();
        let shares = host
            .calls()
            .into_iter()
            .filter(|(op, _)| op == "resource.share_set")
            .count();
        assert_eq!(shares, 2);
        let created = host
            .calls()
            .into_iter()
            .find(|(op, r)| op == "resource.create" && r["kind"] == "chats")
            .unwrap();
        assert_eq!(created.1["title"], "Team");
        assert_eq!(
            host.command_err(
                &registry(),
                "chats.create_group",
                json!({ "users": [{ "id": "nope", "name": "x" }] })
            )
            .unwrap_err()
            .code
            .as_deref(),
            Some("id_invalid")
        );
    }

    fn send_host(text_row: Value) -> (MockHost, Rc<RefCell<Vec<String>>>) {
        db(vec![
            ("from chats where resource_id", json!([{ "name": "Team", "kind": "group", "created_by": ME }])),
            ("select user_id::text as id", json!([{ "id": ME, "name": "Me", "muted": false }, { "id": ANN, "name": "Ann", "muted": false }, { "id": BOB, "name": "Bob", "muted": true }])),
            ("and left_at is null", json!([{ "name": "Me", "history_from": null, "muted": false }])),
            ("v.parent_id::text as chat from core.visible_resources", json!([{ "chat": CHAT }])),
            ("from chat_messages m join core.visible_resources v on v.id = m.resource_id where v.parent_id", text_row),
        ])
    }

    #[test]
    fn a_message_updates_the_chat_and_tells_the_right_people() {
        let row = json!([{ "id": MSG, "chat": CHAT, "at": "2026-11-20T10:00:00Z", "kind": "message", "text": "hi", "author_id": ME, "reply_to": "", "edited": false, "deleted": false, "importance": "normal", "mentions": "[]", "attachments": "[]", "meta": "", "pinned": false, "pinned_by": "" }]);
        let (host, log) = send_host(row);
        let out = host
            .command(
                &registry(),
                "chats.send",
                json!({ "chat": CHAT, "text": "  Hello @Ann **all**  " }),
            )
            .unwrap();
        assert_eq!(out["id"], MSG);
        let sql = log.borrow().join("\n");
        assert!(sql.contains("insert into chat_messages"));
        assert!(
            sql.contains("update chat_state set last_at = now()")
                && sql.contains("message_count = message_count + 1")
        );
        assert!(sql.contains("unread = unread + 1"), "{sql}");
        assert!(sql.contains("mentions = mentions + 1"));
        // the stored text is trimmed, and Ann is the one mentioned
        let insert = host
            .calls()
            .into_iter()
            .find(|(op, r)| {
                op == "db.exec"
                    && r["sql"]
                        .as_str()
                        .is_some_and(|q| q.contains("insert into chat_messages"))
            })
            .unwrap();
        assert_eq!(insert.1["params"][2], "Hello @Ann **all**");
        assert_eq!(
            insert.1["params"][6],
            "[\"00000000-0000-0000-0000-0000000000a1\"]"
        );
        // Ann is told she was mentioned; Bob muted the chat and is not told
        let notes = host.notifications();
        assert_eq!(notes.len(), 1, "{notes:?}");
        assert_eq!(notes[0]["to"], json!([ANN]));
        assert_eq!(notes[0]["resource"], CHAT);
        assert_eq!(notes[0]["at"], format!("chat/{CHAT}"));
        assert!(notes[0]["title"]
            .as_str()
            .unwrap()
            .contains("mentioned you"));
    }

    #[test]
    fn a_message_is_checked_before_anything_is_written() {
        let (host, log) = send_host(json!([]));
        for (args, code) in [
            (json!({ "chat": CHAT, "text": "   " }), "message_empty"),
            (
                json!({ "chat": CHAT, "text": "x".repeat(4001) }),
                "message_too_long",
            ),
            (
                json!({ "chat": CHAT, "text": "x", "importance": "loud" }),
                "importance_invalid",
            ),
            (json!({ "chat": "nope", "text": "x" }), "id_invalid"),
            (
                json!({ "chat": CHAT, "text": "x", "reply_to": "nope" }),
                "id_invalid",
            ),
            (
                json!({ "chat": CHAT, "text": "x", "reply_to": MSG }),
                "reply_invalid",
            ),
        ] {
            assert_eq!(
                host.command_err(&registry(), "chats.send", args)
                    .unwrap_err()
                    .code
                    .as_deref(),
                Some(code)
            );
        }
        assert!(!log
            .borrow()
            .iter()
            .any(|q| q.contains("insert into chat_messages")));
        // not in the chat: no row of the caller
        let (host, _) = db(vec![(
            "from chats where resource_id",
            json!([{ "name": "", "kind": "group", "created_by": ME }]),
        )]);
        assert_eq!(
            host.command_err(
                &registry(),
                "chats.send",
                json!({ "chat": CHAT, "text": "x" })
            )
            .unwrap_err()
            .code
            .as_deref(),
            Some("not_a_member")
        );
    }

    #[test]
    fn the_settings_of_a_person_are_their_own_columns() {
        let (host, log) = db(vec![(
            "from chat_members where resource_id",
            json!([{ "name": "Me", "muted": false }]),
        )]);
        host.command(
            &registry(),
            "chats.settings",
            json!({ "chat": CHAT, "pinned": true, "muted": false, "unread": true }),
        )
        .unwrap();
        let sql = log.borrow().last().cloned().unwrap();
        assert!(
            sql.contains("pinned_at = now()")
                && sql.contains("muted = false")
                && sql.contains("marked_unread = true"),
            "{sql}"
        );
        assert!(sql.contains("user_id = $2::uuid"));
        assert_eq!(
            host.command_err(&registry(), "chats.settings", json!({ "chat": CHAT }))
                .unwrap_err()
                .code
                .as_deref(),
            Some("nothing_to_change")
        );
    }

    #[test]
    fn a_one_to_one_chat_is_hidden_not_left_and_a_group_is_left() {
        let direct = db(vec![
            (
                "from chats where resource_id",
                json!([{ "name": "", "kind": "direct", "created_by": ANN }]),
            ),
            (
                "from chat_members where resource_id",
                json!([{ "name": "Me", "muted": false }]),
            ),
        ]);
        let out = direct
            .0
            .command(&registry(), "chats.leave", json!({ "chat": CHAT }))
            .unwrap();
        assert_eq!(out["hidden"], true);
        assert!(!direct
            .0
            .calls()
            .iter()
            .any(|(op, _)| op == "resource.share_remove"));
        let group = db(vec![
            (
                "from chats where resource_id",
                json!([{ "name": "T", "kind": "group", "created_by": ANN }]),
            ),
            (
                "from chat_members where resource_id",
                json!([{ "name": "Me", "muted": false }]),
            ),
        ]);
        let out = group
            .0
            .command(&registry(), "chats.leave", json!({ "chat": CHAT }))
            .unwrap();
        assert_eq!(out["left"], true);
        let removed: Vec<_> = group
            .0
            .calls()
            .into_iter()
            .filter(|(op, _)| op == "resource.share_remove")
            .collect();
        assert_eq!(removed.len(), 1);
        assert_eq!(removed[0].1["principal_id"], ME);
        // the system message is written before the share goes
        let log = group.1.borrow();
        let sys = log
            .iter()
            .position(|q| q.contains("insert into chat_messages"))
            .unwrap();
        let left = log
            .iter()
            .position(|q| q.contains("left_at = now()"))
            .unwrap();
        assert!(sys < left);
        // the owner of the chat keeps the technical access: no share to remove
        let owner = db(vec![
            (
                "from chats where resource_id",
                json!([{ "name": "T", "kind": "group", "created_by": ME }]),
            ),
            (
                "from chat_members where resource_id",
                json!([{ "name": "Me", "muted": false }]),
            ),
        ]);
        owner
            .0
            .command(&registry(), "chats.leave", json!({ "chat": CHAT }))
            .unwrap();
        assert!(!owner
            .0
            .calls()
            .iter()
            .any(|(op, _)| op == "resource.share_remove"));
    }

    #[test]
    fn only_a_group_takes_new_people() {
        let direct = db(vec![(
            "from chats where resource_id",
            json!([{ "name": "", "kind": "direct", "created_by": ME }]),
        )]);
        let e = direct
            .0
            .command_err(
                &registry(),
                "chats.add_members",
                json!({ "chat": CHAT, "users": [{ "id": ANN, "name": "Ann" }] }),
            )
            .unwrap_err();
        assert_eq!(e.code.as_deref(), Some("not_a_group"));
        // the newcomer sees the history from the time given
        let (host, log) = db(vec![
            (
                "from chats where resource_id",
                json!([{ "name": "T", "kind": "group", "created_by": ME }]),
            ),
            (
                "select user_id::text as id",
                json!([{ "id": ME, "name": "Me", "muted": false }]),
            ),
            (
                "and left_at is null",
                json!([{ "name": "Me", "muted": false }]),
            ),
        ]);
        let out = host.command(&registry(), "chats.add_members", json!({ "chat": CHAT, "users": [{ "id": ANN, "name": "Ann" }, { "id": ME, "name": "Me" }], "history": "2026-11-01T00:00:00Z" })).unwrap();
        assert_eq!(out["added"], 1);
        let insert = host
            .calls()
            .into_iter()
            .find(|(op, r)| {
                op == "db.exec"
                    && r["sql"]
                        .as_str()
                        .is_some_and(|q| q.contains("insert into chat_members"))
            })
            .unwrap();
        assert!(insert.1["sql"]
            .as_str()
            .unwrap()
            .contains("$5::timestamptz"));
        assert_eq!(insert.1["params"][4], "2026-11-01T00:00:00Z");
        assert!(log
            .borrow()
            .iter()
            .any(|q| q.contains("insert into chat_messages")));
    }

    #[test]
    fn a_reaction_is_toggled_and_limited_to_an_emoji() {
        let routes = |had: Value| {
            db(vec![
                ("v.kind = 'chat_messages'", json!([{ "chat": CHAT }])),
                (
                    "from chat_reactions where resource_id = $1::uuid and user_id",
                    had,
                ),
                ("count(distinct emoji)", json!([{ "k": 3 }])),
                (
                    "and left_at is null",
                    json!([{ "name": "Me", "history_from": null, "muted": false }]),
                ),
            ])
        };
        let (host, log) = routes(json!([]));
        host.command(
            &registry(),
            "chats.react",
            json!({ "id": MSG, "emoji": "👍" }),
        )
        .ok();
        assert!(log
            .borrow()
            .iter()
            .any(|q| q.contains("insert into chat_reactions")));
        let (host, log) = routes(json!([{ "x": 1 }]));
        host.command(
            &registry(),
            "chats.react",
            json!({ "id": MSG, "emoji": "👍" }),
        )
        .ok();
        assert!(log
            .borrow()
            .iter()
            .any(|q| q.contains("delete from chat_reactions")));
        assert_eq!(
            host.command_err(
                &registry(),
                "chats.react",
                json!({ "id": MSG, "emoji": "abc" })
            )
            .unwrap_err()
            .code
            .as_deref(),
            Some("emoji_invalid")
        );
        let (host, _) = db(vec![
            ("v.kind = 'chat_messages'", json!([{ "chat": CHAT }])),
            ("count(distinct emoji)", json!([{ "k": 24 }])),
            (
                "and left_at is null",
                json!([{ "name": "Me", "muted": false }]),
            ),
        ]);
        assert_eq!(
            host.command_err(
                &registry(),
                "chats.react",
                json!({ "id": MSG, "emoji": "🎉" })
            )
            .unwrap_err()
            .code
            .as_deref(),
            Some("too_many_reactions")
        );
    }

    #[test]
    fn only_the_author_deletes_a_message() {
        let (host, _) = db(vec![("update chat_messages set deleted", json!([]))]);
        assert_eq!(
            host.command_err(&registry(), "chats.delete_message", json!({ "id": MSG }))
                .unwrap_err()
                .code
                .as_deref(),
            Some("forbidden")
        );
    }

    #[test]
    fn the_room_of_a_call_comes_from_the_chat_and_the_message() {
        assert_eq!(
            room_name(CHAT, MSG),
            "mosaikit-0b8e6f5a1c2d4e3f8a9b0c1d2e3f4a5b-1b8e6f5a1c2d4e3f8a9b0c1d2e3f4a5b"
        );
        // a call that is going on is joined, not started again
        let (host, log) = db(vec![
            ("from chat_call_joins where", json!([])),
            (
                "m.kind = 'call' and m.meta not like",
                json!([{ "id": MSG }]),
            ),
            (
                "v.parent_id::text as chat from core.visible_resources",
                json!([{ "chat": CHAT }]),
            ),
            (
                "and left_at is null",
                json!([{ "name": "Me", "history_from": null, "muted": false }]),
            ),
        ]);
        host.command(&registry(), "chats.call_start", json!({ "chat": CHAT }))
            .ok();
        assert!(!log
            .borrow()
            .iter()
            .any(|q| q.contains("insert into chat_messages")));
        assert!(log
            .borrow()
            .iter()
            .any(|q| q.contains("insert into chat_call_joins")));
    }

    #[test]
    fn a_call_that_nobody_is_in_ends_and_keeps_its_end() {
        let (host, log) = db(vec![
            (
                "m.kind, m.meta",
                json!([{ "chat": CHAT, "kind": "call", "meta": "{\"engine\":\"jitsi\"}" }]),
            ),
            ("select count(*) as k", json!([{ "k": 0 }])),
            (
                "select now() as n",
                json!([{ "n": "2026-11-20T10:30:00Z" }]),
            ),
            (
                "v.parent_id::text as chat from core.visible_resources",
                json!([{ "chat": CHAT }]),
            ),
        ]);
        host.command(&registry(), "chats.call_leave", json!({ "id": MSG }))
            .ok();
        let upd = host
            .calls()
            .into_iter()
            .find(|(op, r)| {
                op == "db.exec"
                    && r["sql"]
                        .as_str()
                        .is_some_and(|q| q.contains("update chat_messages set meta"))
            })
            .unwrap();
        assert!(upd.1["params"][1]
            .as_str()
            .unwrap()
            .contains("\"ended_at\":\"2026-11-20T10:30:00Z\""));
        assert!(log.borrow().iter().any(|q| q.contains("left_at = now()")));
    }

    #[test]
    fn the_unread_widget_lists_the_chats_with_unread_messages_but_not_the_muted_ones() {
        let (host, _) = db(vec![
            (
                "from chats c",
                json!([
                    { "id": "a", "name": "", "kind": "direct", "unread": 3, "muted": false },
                    { "id": "b", "name": "Team", "kind": "group", "unread": 5, "muted": true },
                    { "id": "c", "name": "Ops", "kind": "group", "unread": 0, "muted": false },
                    { "id": "d", "name": "Docs", "kind": "group", "unread": 1, "muted": false }
                ]),
            ),
            (
                "from chat_members m",
                json!([{ "chat": "a", "id": ME, "name": "Me" }, { "chat": "a", "id": ANN, "name": "Ann" }]),
            ),
        ]);
        let out = host
            .command(&registry(), "chats.widget_unread", json!({}))
            .unwrap();
        assert_eq!(
            out["items"],
            json!([{ "id": "a", "title": "Ann", "meta": "3", "tone": "" }, { "id": "d", "title": "Docs", "meta": "1", "tone": "" }])
        );
        assert_eq!(out["more"], 0);
    }

    #[test]
    fn a_message_is_edited_by_its_author_only_and_nothing_else_changes() {
        let reg = registry();
        let prev = json!({ "text": "one", "author_id": ME, "kind": "message", "edited": false, "deleted": false, "attachments": "[]", "mentions": "[]", "pinned": true });
        let host = MockHost::new();
        let v = host
            .hook_with_previous(
                &reg,
                "before_update",
                "chat_messages",
                json!({ "text": " two ", "author_id": "x", "pinned": false, "kind": "call" }),
                prev.clone(),
            )
            .unwrap()
            .unwrap();
        assert_eq!(v.str("text"), "two");
        assert!(v.bool("edited"));
        // the author, the kind and the pin are the ones of before
        assert_eq!(
            (v.str("author_id").as_str(), v.str("kind").as_str()),
            (ME, "message")
        );
        assert!(v.bool("pinned"));
        // another person, a deleted message, a call, an empty text
        let mut other = MockHost::new();
        other.ctx.user = Some(ANN.into());
        assert!(other
            .hook_with_previous(
                &reg,
                "before_update",
                "chat_messages",
                json!({ "text": "x" }),
                prev.clone()
            )
            .unwrap_err()
            .contains("only the author"));
        let gone = json!({ "text": "", "author_id": ME, "kind": "message", "deleted": true });
        assert!(host
            .hook_with_previous(
                &reg,
                "before_update",
                "chat_messages",
                json!({ "text": "x" }),
                gone
            )
            .is_err());
        let call = json!({ "text": "", "author_id": ME, "kind": "call" });
        assert!(host
            .hook_with_previous(
                &reg,
                "before_update",
                "chat_messages",
                json!({ "text": "x" }),
                call
            )
            .is_err());
        assert!(host
            .hook_with_previous(
                &reg,
                "before_update",
                "chat_messages",
                json!({ "text": "  " }),
                prev
            )
            .is_err());
    }

    #[test]
    fn chats_and_messages_are_made_only_by_the_commands() {
        let reg = registry();
        let host = MockHost::new();
        for (hook, resource) in [
            ("before_create", "chats"),
            ("before_update", "chats"),
            ("before_create", "chat_messages"),
        ] {
            let e = host
                .hook(&reg, hook, resource, json!({ "text": "x" }))
                .unwrap_err();
            assert!(e.contains("commands"), "{resource}.{hook}: {e}");
        }
        // an owner deletes the chat, a member does not; the same for a message and its author
        let mine = json!({ "created_by": ME, "author_id": ME });
        assert!(host
            .hook(&reg, "after_delete", "chats", mine.clone())
            .is_ok());
        assert!(host
            .hook(&reg, "after_delete", "chat_messages", mine.clone())
            .is_ok());
        let mut other = MockHost::new();
        other.ctx.user = Some(ANN.into());
        assert!(other
            .hook(&reg, "after_delete", "chats", mine.clone())
            .is_err());
        assert!(other
            .hook(&reg, "after_delete", "chat_messages", mine)
            .is_err());
    }
}
