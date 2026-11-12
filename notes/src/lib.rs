//! Notes plugin: default tag and colour at creation, count by tag, and the translation of a note with an outside
//! translation service (its key and its address are set in System > Keys of outside services).

use mosaikit_plugin_sdk::prelude::*;

const DEFAULT_TAG: &str = "personal";
const DEFAULT_COLOR: &str = "yellow";

/// A note saved without the field `tags` gets its tags from the field `tag` (the first tag: an API client of
/// before the post-its), or the tag `personal`; `[]` is a note without tags on purpose. A note without colour gets
/// the first colour of the palette.
fn before_create(ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let mut changed = false;
    if hook.values.str("tags").is_empty() {
        let first = match hook.values.str("tag") {
            t if t.is_empty() => {
                ctx.log("notes: default tag applied");
                DEFAULT_TAG.to_string()
            }
            t => t,
        };
        v.set("tags", json!([first]).to_string());
        v.set("tag", first);
        changed = true;
    }
    if hook.values.str("color").is_empty() {
        v.set("color", DEFAULT_COLOR);
        changed = true;
    }
    Ok(changed.then_some(v))
}

/// Notes visible to the user, grouped by tag (RLS filters the rows).
fn count_by_tag(ctx: &Ctx, _args: Value) -> Result<Value> {
    let rows = ctx.db().query(
        "select coalesce(tag, '(none)') as tag, count(*)::int as n from notes group by 1 order by 2 desc",
        &[],
    )?;
    Ok(Value::Array(rows))
}

/// The service of the key (`[[service_keys]]` of the manifest) and the one of its address.
const KEY: &str = "translate";
const ENDPOINT: &str = "translate-endpoint";

/// Whether the translation can be used for the caller: a key and an address are in use for them (their own,
/// the tenant's or the platform's). The key itself never leaves the host.
fn translation_ready(ctx: &Ctx, _args: Value) -> Result<Value> {
    let key = ctx.service_key(KEY)?.is_some();
    let endpoint = ctx.service_key(ENDPOINT)?.is_some();
    Ok(json!({ "ready": key && endpoint, "key": key, "endpoint": endpoint }))
}

fn refused(reason: &str, detail: impl Into<String>) -> Result<Value> {
    Ok(json!({ "ok": false, "reason": reason, "detail": detail.into() }))
}

/// The text of the answer of the service: a string, or the first of a list.
fn translated(v: &Value) -> Option<Vec<String>> {
    match v.get("translatedText")? {
        Value::String(s) => Some(vec![s.clone()]),
        Value::Array(a) => a.iter().map(|x| x.as_str().map(str::to_string)).collect(),
        _ => None,
    }
}

/// Translates a note (`{ id, target }`) or a text (`{ text, target }`) with the translation service: a POST of
/// `{ q: [..], source: "auto", target, format: "text" }` to `<address>/translate`, with the key as
/// `Authorization: Bearer` (the API of LibreTranslate and compatible services). Nothing is saved. Answers
/// `{ ok: true, title, body, target }`, or `{ ok: false, reason }` with `no_key`, `no_endpoint`,
/// `key_rejected`, `service_error` or `unreachable`.
fn translate(ctx: &Ctx, args: Value) -> Result<Value> {
    let target = args
        .get("target")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    if target.len() < 2
        || target.len() > 8
        || !target.chars().all(|c| c.is_ascii_lowercase() || c == '-')
    {
        return Err(Error::msg("invalid target language"));
    }
    let (title, body) = match args.get("id").and_then(Value::as_str) {
        Some(id) => {
            let row = ctx
                .db()
                .query_one(
                    "select title, body from notes where resource_id::text = $1",
                    &[json!(id)],
                )?
                .ok_or_else(|| Error::msg("note not found"))?;
            (
                row.get("title")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                row.get("body")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            )
        }
        None => (
            String::new(),
            args.get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        ),
    };
    if ctx.service_key(KEY)?.is_none() {
        return refused("no_key", "no key of the translation service is set");
    }
    let Some(address) = ctx.service_key(ENDPOINT)? else {
        return refused(
            "no_endpoint",
            "the address of the translation service is not set",
        );
    };
    // only the parts that have a text are sent
    let parts: Vec<&String> = [&title, &body]
        .into_iter()
        .filter(|p| !p.trim().is_empty())
        .collect();
    if parts.is_empty() {
        return Ok(json!({ "ok": true, "title": "", "body": "", "target": target }));
    }
    let payload = json!({ "q": parts, "source": "auto", "target": target, "format": "text" });
    let url = format!("{}/translate", address.trim_end_matches('/'));
    let reply = match ctx
        .http()
        .fetch_with_key("POST", &url, Some(&payload.to_string()), KEY)
    {
        Ok(r) => r,
        Err(e) => return refused("unreachable", e.to_string()),
    };
    match reply.status {
        200..=299 => {}
        401 | 403 => {
            return refused(
                "key_rejected",
                format!("the service answered {}", reply.status),
            )
        }
        other => return refused("service_error", format!("the service answered {other}")),
    }
    let Some(out) = reply
        .json()
        .ok()
        .as_ref()
        .and_then(translated)
        .filter(|o| o.len() == parts.len())
    else {
        return refused(
            "service_error",
            "the answer of the service is not understood",
        );
    };
    let mut it = out.into_iter();
    let t_title = if title.trim().is_empty() {
        String::new()
    } else {
        it.next().unwrap_or_default()
    };
    let t_body = if body.trim().is_empty() {
        String::new()
    } else {
        it.next().unwrap_or_default()
    };
    Ok(json!({ "ok": true, "title": t_title, "body": t_body, "target": target }))
}

/// Most items a list widget shows; the rest is reported as `more`.
const WIDGET_ITEMS: usize = 6;

/// One item of the recent-notes list: the day of the last change as meta (the first ten characters of the timestamp).
fn recent_item(row: &Value) -> Value {
    let title = row.get("title").and_then(Value::as_str).unwrap_or_default();
    let updated = row
        .get("updated")
        .and_then(Value::as_str)
        .unwrap_or_default();
    json!({
        "id": row.get("id").cloned().unwrap_or(Value::Null),
        "title": if title.trim().is_empty() { "Untitled" } else { title },
        "meta": updated.chars().take(10).collect::<String>(),
        "tone": "",
    })
}

/// The body of the list widget: the items shown and how many of the `total` were left out.
fn recent_body(rows: &[Value], total: i64) -> Value {
    let items: Vec<Value> = rows.iter().take(WIDGET_ITEMS).map(recent_item).collect();
    let more = (total.max(0) as usize).saturating_sub(items.len());
    json!({ "items": items, "more": more })
}

/// Widget `recent-notes`: the notes of the caller (RLS) changed last, archived ones left out.
fn widget_recent(ctx: &Ctx, _args: Value) -> Result<Value> {
    let rows = ctx.db().query(
        "select n.resource_id::text as id, n.title, v.updated_at::text as updated          from notes n join core.visible_resources v on v.id = n.resource_id          where not coalesce(n.archived, false) and v.kind = 'notes'          order by v.updated_at desc limit 6",
        &[],
    )?;
    let total = ctx
        .db()
        .query_one(
            "select count(*)::int as n from notes where not coalesce(archived, false)",
            &[],
        )?
        .and_then(|r| r.get("n").and_then(Value::as_i64))
        .unwrap_or(0);
    Ok(recent_body(&rows, total))
}

mosaikit_plugin_sdk::plugin! {
    hooks: { "notes.before_create" => before_create },
    commands: {
        "notes.widget_recent" => widget_recent,
        "notes.count_by_tag" => count_by_tag,
        "notes.translation_ready" => translation_ready,
        "notes.translate" => translate,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    #[test]
    fn default_tag() {
        let host = MockHost::new();
        let v = host
            .hook(
                &__msk_registry(),
                "before_create",
                "notes",
                json!({ "title": "x" }),
            )
            .unwrap();
        let v = v.unwrap();
        assert_eq!(v.str("tag"), DEFAULT_TAG);
        assert_eq!(v.str("tags"), r#"["personal"]"#);
        assert_eq!(v.str("color"), DEFAULT_COLOR);
        let keep = host
            .hook(
                &__msk_registry(),
                "before_create",
                "notes",
                json!({ "tag": "work", "tags": "[]", "color": "blue" }),
            )
            .unwrap();
        assert_eq!(keep, None, "no tags on purpose");
        let legacy = host
            .hook(
                &__msk_registry(),
                "before_create",
                "notes",
                json!({ "tag": "work", "color": "blue" }),
            )
            .unwrap()
            .unwrap();
        assert_eq!(
            legacy.str("tags"),
            r#"["work"]"#,
            "the tag of an older client becomes the list"
        );
        let own = host
            .hook(
                &__msk_registry(),
                "before_create",
                "notes",
                json!({ "tags": r#"["ideas"]"#, "color": "pink" }),
            )
            .unwrap();
        assert_eq!(own, None, "a note with tags of its own keeps them");
    }

    fn keys(key: Option<&'static str>, endpoint: Option<&'static str>) -> MockHost {
        MockHost::new().on("key.get", move |req| {
            let v = if req["service"] == "translate" {
                key
            } else {
                endpoint
            };
            Ok(v.map_or(Value::Null, |s| json!(s)))
        })
    }

    #[test]
    fn translation_ready() {
        let none = keys(None, None);
        let out = none
            .command(&__msk_registry(), "notes.translation_ready", json!({}))
            .unwrap();
        assert_eq!(
            out,
            json!({ "ready": false, "key": false, "endpoint": false })
        );
        let set = keys(Some("secret-key"), Some("https://t.example"));
        let out = set
            .command(&__msk_registry(), "notes.translation_ready", json!({}))
            .unwrap();
        assert_eq!(
            out,
            json!({ "ready": true, "key": true, "endpoint": true }),
            "the key never goes back"
        );
    }

    #[test]
    fn translate_needs_the_key_and_the_address() {
        let args = json!({ "text": "Hello", "target": "it" });
        let out = keys(None, Some("https://t.example"))
            .command(&__msk_registry(), "notes.translate", args.clone())
            .unwrap();
        assert_eq!(out["reason"], "no_key");
        let out = keys(Some("k"), None)
            .command(&__msk_registry(), "notes.translate", args)
            .unwrap();
        assert_eq!(out["reason"], "no_endpoint");
        let bad = keys(Some("k"), Some("https://t.example")).command(
            &__msk_registry(),
            "notes.translate",
            json!({ "text": "x", "target": "../x" }),
        );
        assert!(bad.is_err());
    }

    #[test]
    fn translate_a_note_through_the_host() {
        let host = keys(Some("k"), Some("https://t.example/"))
            .on("db.query", |_| Ok(json!([{ "title": "Hello", "body": "Good morning" }])))
            .on("http.fetch", |req| {
                assert_eq!(req["url"], "https://t.example/translate");
                assert_eq!(req["key"], "translate", "the host adds the key");
                let sent = req["body"].as_str().unwrap();
                assert!(sent.contains(r#""q":["Hello","Good morning"]"#), "{sent}");
                assert!(sent.contains(r#""target":"it""#), "{sent}");
                Ok(json!({ "status": 200, "body": "{\"translatedText\":[\"Ciao\",\"Buongiorno\"]}" }))
            });
        let out = host
            .command(
                &__msk_registry(),
                "notes.translate",
                json!({ "id": "n1", "target": "IT" }),
            )
            .unwrap();
        assert_eq!(
            out,
            json!({ "ok": true, "title": "Ciao", "body": "Buongiorno", "target": "it" })
        );
        let denied = keys(Some("k"), Some("https://t.example"))
            .on("http.fetch", |_| Ok(json!({ "status": 401, "body": "" })))
            .command(
                &__msk_registry(),
                "notes.translate",
                json!({ "text": "Hi", "target": "it" }),
            )
            .unwrap();
        assert_eq!(denied["reason"], "key_rejected");
        let down = keys(Some("k"), Some("https://t.example"))
            .on("http.fetch", |_| Err("this address is not allowed".into()))
            .command(
                &__msk_registry(),
                "notes.translate",
                json!({ "text": "Hi", "target": "it" }),
            )
            .unwrap();
        assert_eq!(down["reason"], "unreachable");
    }

    #[test]
    fn count() {
        let host = MockHost::new().on("db.query", |_| Ok(json!([{ "tag": "work", "n": 2 }])));
        let out = host
            .command(&__msk_registry(), "notes.count_by_tag", json!({}))
            .unwrap();
        assert_eq!(out, json!([{ "tag": "work", "n": 2 }]));
    }

    #[test]
    fn a_recent_note_shows_its_day() {
        let i = recent_item(
            &json!({ "id": "a", "title": "Ideas", "updated": "2026-10-20 09:30:00+00" }),
        );
        assert_eq!(
            i,
            json!({ "id": "a", "title": "Ideas", "meta": "2026-10-20", "tone": "" })
        );
        assert_eq!(
            recent_item(&json!({ "id": "b", "title": "  " }))["title"],
            "Untitled"
        );
    }

    #[test]
    fn the_list_counts_what_it_leaves_out() {
        let rows: Vec<Value> = (0..6)
            .map(|i| json!({ "id": i.to_string(), "title": "n" }))
            .collect();
        let b = recent_body(&rows, 10);
        assert_eq!(b["items"].as_array().unwrap().len(), 6);
        assert_eq!(b["more"], 4);
        assert_eq!(recent_body(&rows, 6)["more"], 0);
        assert_eq!(recent_body(&[], 0), json!({ "items": [], "more": 0 }));
    }

    #[test]
    fn the_widget_command_is_registered_and_answers() {
        assert!(__msk_registry()
            .command_names()
            .contains(&"notes.widget_recent"));
        let host = MockHost::new().on("db.query", |_| {
            Ok(json!([{ "id": "a", "title": "T", "updated": "2026-10-20", "n": 1 }]))
        });
        let out = host
            .command(&__msk_registry(), "notes.widget_recent", json!({}))
            .unwrap();
        assert_eq!(out["items"][0]["title"], "T");
        assert_eq!(out["more"], 0);
    }
}
