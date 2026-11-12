//! Announcements plugin: the rules of a notice and the confirmations of reading. A notice has a title, a level
//! (information by default) and a period that cannot end before it starts. A reader confirms a notice with the command
//! `notices.confirm` (the table `acks` is one a reader writes, see `[[tables]]` in the manifest); `notices.overview`
//! answers what the list needs in one call, `notices.acks` who confirmed one notice.

use mosaikit_plugin_sdk::prelude::*;

const LEVELS: [&str; 3] = ["info", "important", "urgent"];
/// Longest title and text, in characters.
const MAX_TITLE: usize = 160;
const MAX_BODY: usize = 8000;

fn notice(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let title: String = v.str("title").trim().chars().take(MAX_TITLE).collect();
    if title.is_empty() {
        return Err(Error::coded("notice_title_empty", "a notice needs a title"));
    }
    v.set("title", title);
    let body = v.str("body");
    if body.chars().count() > MAX_BODY {
        return Err(Error::coded(
            "notice_too_long",
            format!("the text of a notice has at most {MAX_BODY} characters"),
        ));
    }
    let level = v.str("level");
    if level.is_empty() {
        v.set("level", "info");
    } else if !LEVELS.contains(&level.as_str()) {
        return Err(Error::coded(
            "notice_level",
            "the level is information, important or urgent",
        ));
    }
    // dates are written YYYY-MM-DD, so they compare as text
    let (from, until) = (v.str("starts_on"), v.str("ends_on"));
    if !from.is_empty() && !until.is_empty() && until < from {
        return Err(Error::coded(
            "notice_period",
            "a notice cannot end before it starts",
        ));
    }
    Ok(Some(v))
}

/// What the list needs: the notices the person confirmed (ids) and how many people confirmed each one the person sees.
fn overview(ctx: &Ctx, _args: Value) -> Result<Value> {
    let user = ctx.user.clone().unwrap_or_default();
    let mine = ctx.db().query(
        "select resource_id::text as id from acks where user_id = $1::uuid",
        &[json!(user)],
    )?;
    let counts = ctx.db().query(
        "select resource_id::text as id, count(*)::int as n from acks group by resource_id",
        &[],
    )?;
    let mut by_notice = json!({});
    for r in &counts {
        if let (Some(id), Some(n)) = (r.get("id").and_then(Value::as_str), r.get("n")) {
            by_notice[id] = n.clone();
        }
    }
    Ok(json!({
        "mine": mine.iter().filter_map(|r| r.get("id").cloned()).collect::<Vec<_>>(),
        "counts": by_notice,
    }))
}

/// The caller confirms the notice `id` (once: a second confirmation changes nothing).
fn confirm(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
    if id.is_empty() {
        return Err(Error::coded("notice_missing", "which notice?"));
    }
    let user = ctx
        .user
        .clone()
        .ok_or_else(|| Error::coded("not_signed_in", "sign in to confirm a notice"))?;
    let tenant = ctx.tenant.clone().unwrap_or_default();
    let name = ctx.username.clone().unwrap_or_else(|| user.clone());
    // the row is accepted only for a notice the caller sees, and only as theirs (policies of the table)
    let n = ctx.db().exec(
        "insert into acks (resource_id, tenant_id, user_id, user_name) values ($1::uuid, $2::uuid, $3::uuid, $4) on conflict (resource_id, user_id) do nothing",
        &[json!(id), json!(tenant), json!(user), json!(name)],
    )?;
    Ok(json!({ "confirmed": true, "new": n > 0 }))
}

/// Who confirmed the notice `id`, first to last.
fn acks(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
    if id.is_empty() {
        return Err(Error::coded("notice_missing", "which notice?"));
    }
    let rows = ctx.db().query(
        "select user_id::text as id, user_name as name, confirmed_at::text as at from acks where resource_id = $1::uuid order by confirmed_at",
        &[json!(id)],
    )?;
    Ok(Value::Array(rows))
}

/// Most items a list widget shows; the rest is reported as `more`.
const WIDGET_ITEMS: usize = 6;
/// The notices in force on `$1` (a date): the period contains it, an empty end or start is open.
const IN_FORCE: &str =
    "(n.starts_on is null or n.starts_on <= $1::date) and (n.ends_on is null or n.ends_on >= $1::date)";

fn today(ctx: &Ctx) -> Result<String> {
    let row = ctx.db().query_one("select current_date::text as d", &[])?;
    Ok(row
        .and_then(|r| {
            r.get("d")
                .and_then(Value::as_str)
                .map(|d| d.chars().take(10).collect())
        })
        .unwrap_or_default())
}

/// The tone of a notice in a list: urgent is red, important amber.
fn level_tone(level: &str) -> &'static str {
    match level {
        "urgent" => "err",
        "important" => "warn",
        _ => "",
    }
}

fn notice_item(row: &Value) -> Value {
    let level = match row.get("level").and_then(Value::as_str) {
        Some(l) if !l.is_empty() => l,
        _ => "info",
    };
    json!({
        "id": row.get("id").cloned().unwrap_or(Value::Null),
        "title": row.get("title").and_then(Value::as_str).unwrap_or_default(),
        "meta": level,
        "tone": level_tone(level),
    })
}

/// The body of the list widget: at most six items and how many were left out.
fn list_body(rows: &[Value]) -> Value {
    let items: Vec<Value> = rows.iter().take(WIDGET_ITEMS).map(notice_item).collect();
    json!({ "items": items, "more": rows.len().saturating_sub(WIDGET_ITEMS) })
}

/// The tone of the to-confirm widget: amber while something waits for the caller.
fn confirm_tone(n: i64) -> &'static str {
    if n > 0 {
        "warn"
    } else {
        ""
    }
}

/// Widget `current-notices`: the notices in force the caller sees, urgent first, then the newest.
fn widget_current(ctx: &Ctx, _args: Value) -> Result<Value> {
    let t = today(ctx)?;
    let rows = ctx.db().query(
        &format!(
            "select n.resource_id::text as id, n.title, n.level              from notices n join core.visible_resources v on v.id = n.resource_id              where {IN_FORCE} and v.kind = 'notices'              order by case n.level when 'urgent' then 0 when 'important' then 1 else 2 end, v.created_at desc limit 500"
        ),
        &[json!(t)],
    )?;
    Ok(list_body(&rows))
}

/// Widget `to-confirm`: notices in force that ask for a confirmation the caller has not given.
fn widget_to_confirm(ctx: &Ctx, _args: Value) -> Result<Value> {
    let t = today(ctx)?;
    let user = ctx.user.clone().unwrap_or_default();
    let n = ctx
        .db()
        .query_one(
            &format!(
                "select count(*)::int as n from notices n                  where coalesce(n.needs_ack, false) and {IN_FORCE}                  and not exists (select 1 from acks a where a.resource_id = n.resource_id and a.user_id = $2::uuid)"
            ),
            &[json!(t), json!(user)],
        )?
        .and_then(|r| r.get("n").and_then(Value::as_i64))
        .unwrap_or(0);
    Ok(json!({ "value": n, "secondary": Value::Null, "tone": confirm_tone(n) }))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "notices.before_create" => notice,
        "notices.before_update" => notice,
    },
    commands: {
        "notices.overview" => overview,
        "notices.confirm" => confirm,
        "notices.acks" => acks,
        "notices.widget_current" => widget_current,
        "notices.widget_to_confirm" => widget_to_confirm,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn run(values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), "before_create", "notices", values)
    }

    #[test]
    fn a_notice_is_trimmed_and_is_information_by_default() {
        let v = run(json!({ "title": "  Office closed  " }))
            .unwrap()
            .unwrap();
        assert_eq!(v.str("title"), "Office closed");
        assert_eq!(v.str("level"), "info");
        assert!(run(json!({ "title": "   " }))
            .unwrap_err()
            .contains("title"));
    }

    #[test]
    fn the_level_is_one_of_three() {
        assert!(run(json!({ "title": "x", "level": "urgent" })).is_ok());
        assert!(run(json!({ "title": "x", "level": "loud" }))
            .unwrap_err()
            .contains("urgent"));
    }

    #[test]
    fn a_notice_cannot_end_before_it_starts() {
        assert!(
            run(json!({ "title": "x", "starts_on": "2026-05-02", "ends_on": "2026-05-01" }))
                .unwrap_err()
                .contains("end before")
        );
        assert!(
            run(json!({ "title": "x", "starts_on": "2026-05-01", "ends_on": "2026-05-01" }))
                .is_ok()
        );
        assert!(run(json!({ "title": "x", "ends_on": "2026-05-01" })).is_ok());
    }

    #[test]
    fn the_text_has_a_limit() {
        assert!(run(json!({ "title": "x", "body": "é".repeat(MAX_BODY) })).is_ok());
        assert!(
            run(json!({ "title": "x", "body": "é".repeat(MAX_BODY + 1) }))
                .unwrap_err()
                .contains("at most")
        );
    }

    #[test]
    fn the_commands_are_registered() {
        let names = __msk_registry().command_names();
        for c in [
            "notices.overview",
            "notices.confirm",
            "notices.acks",
            "notices.widget_current",
            "notices.widget_to_confirm",
        ] {
            assert!(names.contains(&c), "{c}");
        }
    }

    #[test]
    fn the_level_gives_the_tone() {
        assert_eq!(level_tone("urgent"), "err");
        assert_eq!(level_tone("important"), "warn");
        assert_eq!(level_tone("info"), "");
        let i = notice_item(&json!({ "id": "a", "title": "Fire drill", "level": "urgent" }));
        assert_eq!(
            i,
            json!({ "id": "a", "title": "Fire drill", "meta": "urgent", "tone": "err" })
        );
        assert_eq!(notice_item(&json!({ "title": "x" }))["meta"], "info");
    }

    #[test]
    fn the_list_keeps_six_and_counts_the_rest() {
        let rows: Vec<Value> = (0..8)
            .map(|i| json!({ "id": i.to_string(), "title": "n" }))
            .collect();
        let b = list_body(&rows);
        assert_eq!(b["items"].as_array().unwrap().len(), 6);
        assert_eq!(b["more"], 2);
        assert_eq!(list_body(&[]), json!({ "items": [], "more": 0 }));
    }

    #[test]
    fn the_confirm_widget_is_amber_while_something_waits() {
        assert_eq!(confirm_tone(2), "warn");
        assert_eq!(confirm_tone(0), "");
        let host = MockHost::new().on("db.query", |_| Ok(json!([{ "d": "2026-10-20", "n": 3 }])));
        let out = host
            .command(&__msk_registry(), "notices.widget_to_confirm", json!({}))
            .unwrap();
        assert_eq!(
            out,
            json!({ "value": 3, "secondary": null, "tone": "warn" })
        );
    }
}
