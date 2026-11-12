//! Tasks plugin: automatic completion date, default priority and repeating tasks.

use mosaikit_plugin_sdk::prelude::*;

/// Does the date come from the kernel in the context? No: the guest has no clock. The
/// completion date is computed in SQL (`current_date`) through `db.query`.
fn today(ctx: &Ctx) -> Result<String> {
    let row = ctx.db().query_one("select current_date::text as d", &[])?;
    Ok(row
        .and_then(|r| r.get("d").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_default())
}

/// A civil date `YYYY-MM-DD` as (year, month, day); None if it is not one.
fn parse_date(s: &str) -> Option<(i32, u32, u32)> {
    let mut it = s.split('-');
    let y: i32 = it.next()?.parse().ok()?;
    let m: u32 = it.next()?.parse().ok()?;
    let d: u32 = it.next()?.parse().ok()?;
    if it.next().is_some() || !(1..=12).contains(&m) || d == 0 || d > days_in_month(y, m) {
        return None;
    }
    Some((y, m, d))
}

fn days_in_month(y: i32, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        _ => 28,
    }
}

fn fmt_date((y, m, d): (i32, u32, u32)) -> String {
    format!("{y:04}-{m:02}-{d:02}")
}

fn add_days((mut y, mut m, mut d): (i32, u32, u32), n: u32) -> (i32, u32, u32) {
    for _ in 0..n {
        d += 1;
        if d > days_in_month(y, m) {
            d = 1;
            m += 1;
            if m > 12 {
                m = 1;
                y += 1;
            }
        }
    }
    (y, m, d)
}

/// One month later; a day that does not exist there (31st) becomes the last one of that month.
fn add_month((mut y, mut m, d): (i32, u32, u32)) -> (i32, u32, u32) {
    m += 1;
    if m > 12 {
        m = 1;
        y += 1;
    }
    (y, m, d.min(days_in_month(y, m)))
}

/// The next date of a repeating task: one step after `due`, repeated until it is not before `today`
/// (a daily task left overdue for a week does not come back as seven overdue tasks).
fn next_due(due: &str, repeat: &str, today: &str) -> Option<String> {
    let step = |d| match repeat {
        "daily" => Some(add_days(d, 1)),
        "weekly" => Some(add_days(d, 7)),
        "monthly" => Some(add_month(d)),
        _ => None,
    };
    let t = parse_date(today)?;
    let mut d = step(parse_date(due).unwrap_or(t))?;
    // dates compare as tuples (year, month, day)
    for _ in 0..400 {
        if d >= t {
            break;
        }
        d = step(d)?;
    }
    Some(fmt_date(d))
}

fn normalize(ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    if v.str("priority").is_empty() {
        v.set("priority", "medium");
    }
    let was_done = hook.previous.as_ref().is_some_and(|p| p.bool("done"));
    // a repeating task that is completed is not closed: it moves to its next date and stays open
    let repeat = v.str("repeat");
    if v.bool("done") && !was_done && matches!(repeat.as_str(), "daily" | "weekly" | "monthly") {
        let t = today(ctx)?;
        if let Some(next) = next_due(&v.str("due"), &repeat, &t) {
            v.set("due", next);
            v.set("done", false);
            v.set("completed_on", t);
            return Ok(Some(v));
        }
    }
    match (v.bool("done"), was_done) {
        (true, false) => {
            v.set("completed_on", today(ctx)?);
            if v.str("priority") == "high" {
                ctx.log("tasks: a high priority task was completed");
            }
        }
        (false, _) => v.set("completed_on", Value::Null),
        (true, true) => {
            if let Some(prev) = &hook.previous {
                v.set(
                    "completed_on",
                    prev.get("completed_on").cloned().unwrap_or(Value::Null),
                );
            }
        }
    }
    Ok(Some(v))
}

/// Open tasks past their due date, visible to the user.
fn overdue(ctx: &Ctx, _args: Value) -> Result<Value> {
    let rows = ctx.db().query(
        "select resource_id::text as id, title, due::text as due, priority from tasks
         where not coalesce(done, false) and due < current_date order by due",
        &[],
    )?;
    Ok(Value::Array(rows))
}

/// Most items a list widget shows; the rest is reported as `more`.
const WIDGET_ITEMS: usize = 6;
/// Days ahead that count as "due soon".
const SOON_DAYS: u32 = 7;

/// The tone of the open-tasks widget: red when something is overdue, amber when something is due today.
fn open_tone(overdue: i64, due_today: i64) -> &'static str {
    if overdue > 0 {
        "err"
    } else if due_today > 0 {
        "warn"
    } else {
        ""
    }
}

/// The body of a list widget: at most [`WIDGET_ITEMS`] items and how many were left out.
fn list_body(mut items: Vec<Value>) -> Value {
    let more = items.len().saturating_sub(WIDGET_ITEMS);
    items.truncate(WIDGET_ITEMS);
    json!({ "items": items, "more": more })
}

fn count_of(row: &Value, key: &str) -> i64 {
    row.get(key).and_then(Value::as_i64).unwrap_or(0)
}

/// Widget `open-tasks`: my open tasks, with the overdue ones as secondary number.
fn widget_open(ctx: &Ctx, _args: Value) -> Result<Value> {
    let t = today(ctx)?;
    let row = ctx
        .db()
        .query_one(
            "select count(*)::int as open,              count(*) filter (where due < $1::date)::int as overdue,              count(*) filter (where due = $1::date)::int as due_today              from tasks where not coalesce(done, false)",
            &[json!(t)],
        )?
        .unwrap_or_default();
    let (overdue, due_today) = (count_of(&row, "overdue"), count_of(&row, "due_today"));
    Ok(json!({
        "value": count_of(&row, "open"),
        "secondary": overdue,
        "tone": open_tone(overdue, due_today),
    }))
}

/// The date `days` days after `today` (YYYY-MM-DD); None when `today` is not a date.
fn soon_limit(today: &str, days: u32) -> Option<String> {
    parse_date(today).map(|d| fmt_date(add_days(d, days)))
}

/// One item of the due-soon list: a task due today is amber.
fn soon_item(row: &Value, today: &str) -> Value {
    let due = row.get("due").and_then(Value::as_str).unwrap_or_default();
    json!({
        "id": row.get("id").cloned().unwrap_or(Value::Null),
        "title": row.get("title").and_then(Value::as_str).unwrap_or_default(),
        "meta": due,
        "tone": if due == today { "warn" } else { "" },
    })
}

/// Widget `due-soon`: my open tasks due from today to the next seven days, the earliest first.
fn widget_soon(ctx: &Ctx, _args: Value) -> Result<Value> {
    let t = today(ctx)?;
    let Some(limit) = soon_limit(&t, SOON_DAYS) else {
        return Ok(list_body(Vec::new()));
    };
    let rows = ctx.db().query(
        "select resource_id::text as id, title, due::text as due from tasks          where not coalesce(done, false) and due >= $1::date and due <= $2::date          order by due, title limit 500",
        &[json!(t), json!(limit)],
    )?;
    Ok(list_body(rows.iter().map(|r| soon_item(r, &t)).collect()))
}

/// Most ids `tasks.set_project` changes in one call.
const SET_PROJECT_IDS: usize = 200;
/// Longest project name, in characters (the same limit Projects uses).
const MAX_PROJECT: usize = 80;

/// The project name as the commands compare it: trimmed, cut, never null.
fn clean_project(args: &Value) -> String {
    args.get("project")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .chars()
        .take(MAX_PROJECT)
        .collect()
}

/// A canonical hyphenated UUID (8-4-4-4-12 hexadecimal digits); nothing else reaches the SQL.
fn is_uuid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 5
        && parts
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(p, n)| p.len() == n && p.chars().all(|c| c.is_ascii_hexdigit()))
}

/// A date `YYYY-MM-DD` or nothing: an empty value is `None`, a bad one is an error.
fn opt_date(args: &Value, key: &str) -> Result<Option<String>> {
    let s = args
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if s.is_empty() {
        return Ok(None);
    }
    if s.len() != 10 || parse_date(s).is_none() {
        return Err(Error::coded("task_date", "dates are written YYYY-MM-DD"));
    }
    Ok(Some(s.to_string()))
}

/// The tasks of the caller that belong to the project `project` (name compared without case and
/// outer spaces): what the Projects plugin arranges on its board. At most 500.
fn for_project(ctx: &Ctx, args: Value) -> Result<Value> {
    let project = clean_project(&args);
    if project.is_empty() {
        return Err(Error::coded("project_missing", "which project?"));
    }
    let rows = ctx.db().query(
        "select t.resource_id::text as id, t.title, t.due::text as due, coalesce(t.done, false) as done,
                t.priority, t.labels, v.owner_name as owner
         from tasks t join core.visible_resources v on v.id = t.resource_id
         where v.kind = 'tasks' and lower(trim(t.project)) = lower($1)
         order by t.due is null, t.due, t.title limit 500",
        &[json!(project)],
    )?;
    Ok(Value::Array(rows))
}

/// Sets (or, with an empty name, clears) the project of the tasks `ids` the caller may write; the
/// answer is how many changed. The hook is not run: only the project column changes.
fn set_project(ctx: &Ctx, args: Value) -> Result<Value> {
    let project = clean_project(&args);
    let ids: Vec<String> = args
        .get("ids")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if ids.is_empty() {
        return Ok(json!({ "changed": 0 }));
    }
    if ids.len() > SET_PROJECT_IDS {
        return Err(Error::coded(
            "too_many_tasks",
            format!("at most {SET_PROJECT_IDS} tasks at a time"),
        ));
    }
    if ids.iter().any(|i| !is_uuid(i)) {
        return Err(Error::coded("task_id", "a task id is not valid"));
    }
    let marks: Vec<String> = (0..ids.len())
        .map(|i| format!("${}::uuid", i + 2))
        .collect();
    let sql = format!(
        "update tasks set project = nullif($1::text, '') where resource_id in ({})",
        marks.join(", ")
    );
    let mut params = vec![json!(project)];
    params.extend(ids.iter().map(|i| json!(i)));
    let changed = ctx.db().exec(&sql, &params)?;
    Ok(json!({ "changed": changed }))
}

/// Creates a task of the project as the caller: the resource, then its row (medium priority, open,
/// no repetition, as the hook would set them).
fn add_for_project(ctx: &Ctx, args: Value) -> Result<Value> {
    let project = clean_project(&args);
    if project.is_empty() {
        return Err(Error::coded("project_missing", "which project?"));
    }
    let title: String = args
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .chars()
        .take(500)
        .collect();
    if title.is_empty() {
        return Err(Error::coded("task_title_empty", "a task needs a title"));
    }
    let due = opt_date(&args, "due")?;
    let id = ctx.resources().create("tasks", &title, None)?;
    ctx.db().exec(
        "insert into tasks (resource_id, title, due, priority, done, project, \"repeat\")
         values ($1::uuid, $2, $3::date, 'medium', false, $4, 'none')",
        &[json!(id), json!(title), json!(due), json!(project)],
    )?;
    Ok(json!({ "id": id }))
}

/// The open tasks of the caller with a due date from `from` to `to` (both `YYYY-MM-DD`, inclusive),
/// the earliest first, at most 500. The Calendar plugin shows them.
fn due_between(ctx: &Ctx, args: Value) -> Result<Value> {
    let (from, to) = (opt_date(&args, "from")?, opt_date(&args, "to")?);
    let (Some(from), Some(to)) = (from, to) else {
        return Err(Error::coded("task_dates", "from and to are both required"));
    };
    if to < from {
        return Err(Error::coded("task_dates", "to cannot be before from"));
    }
    let rows = ctx.db().query(
        "select t.resource_id::text as id, t.title, t.due::text as due, t.priority, t.project
         from tasks t
         where not coalesce(t.done, false) and t.due >= $1::date and t.due <= $2::date
         order by t.due, t.title limit 500",
        &[json!(from), json!(to)],
    )?;
    Ok(Value::Array(rows))
}

/// The open tasks of the caller that belong to no project, to attach to one (at most 50); `q` keeps the titles that contain it.
fn without_project(ctx: &Ctx, args: Value) -> Result<Value> {
    let q: String = args
        .get("q")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .chars()
        .take(80)
        .collect();
    let rows = ctx.db().query(
        "select t.resource_id::text as id, t.title, t.due::text as due, t.priority
         from tasks t
         where not coalesce(t.done, false) and coalesce(trim(t.project), '') = ''
           and ($1::text = '' or lower(t.title) like '%' || lower($1::text) || '%')
         order by t.due is null, t.due, t.title limit 50",
        &[json!(q)],
    )?;
    Ok(Value::Array(rows))
}

mosaikit_plugin_sdk::plugin! {
    hooks: { "tasks.before_create" => normalize, "tasks.before_update" => normalize },
    commands: {
        "tasks.overdue" => overdue,
        "tasks.widget_open" => widget_open,
        "tasks.widget_soon" => widget_soon,
        "tasks.for_project" => for_project,
        "tasks.set_project" => set_project,
        "tasks.add_for_project" => add_for_project,
        "tasks.due_between" => due_between,
        "tasks.without_project" => without_project,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn host() -> MockHost {
        MockHost::new().on("db.query", |_| Ok(json!([{ "d": "2026-10-20" }])))
    }

    #[test]
    fn completion_sets_the_date() {
        let v = host()
            .hook(
                &__msk_registry(),
                "before_create",
                "tasks",
                json!({ "title": "x", "done": true }),
            )
            .unwrap()
            .unwrap();
        assert_eq!(v.str("completed_on"), "2026-10-20");
        assert_eq!(v.str("priority"), "medium");
    }

    #[test]
    fn next_dates() {
        assert_eq!(
            next_due("2026-10-20", "daily", "2026-10-20").unwrap(),
            "2026-10-21"
        );
        assert_eq!(
            next_due("2026-10-20", "weekly", "2026-10-20").unwrap(),
            "2026-10-27"
        );
        assert_eq!(
            next_due("2026-01-31", "monthly", "2026-01-31").unwrap(),
            "2026-02-28"
        );
        assert_eq!(
            next_due("2028-01-31", "monthly", "2028-01-31").unwrap(),
            "2028-02-29"
        );
        assert_eq!(
            next_due("2026-12-31", "daily", "2026-12-31").unwrap(),
            "2027-01-01"
        );
        // overdue for a long time: the next date is today or later, once
        assert_eq!(
            next_due("2026-10-01", "daily", "2026-10-20").unwrap(),
            "2026-10-20"
        );
        assert_eq!(
            next_due("2026-10-01", "weekly", "2026-10-20").unwrap(),
            "2026-10-22"
        );
        // no due date: from today
        assert_eq!(next_due("", "daily", "2026-10-20").unwrap(), "2026-10-21");
        assert!(next_due("2026-10-20", "never", "2026-10-20").is_none());
        assert!(parse_date("2026-02-30").is_none());
    }

    #[test]
    fn completing_a_repeating_task_moves_it() {
        let prev = json!({ "title": "x", "done": false, "due": "2026-10-20", "repeat": "weekly" });
        let h = host();
        let v = h
            .hook_with_previous(
                &__msk_registry(),
                "before_update",
                "tasks",
                json!({ "title": "x", "done": true, "due": "2026-10-20", "repeat": "weekly" }),
                prev,
            )
            .unwrap()
            .unwrap();
        assert!(!v.bool("done"));
        assert_eq!(v.str("due"), "2026-10-27");
        assert_eq!(v.str("completed_on"), "2026-10-20");
    }

    #[test]
    fn reopening_clears_the_date() {
        let v = host()
            .hook(
                &__msk_registry(),
                "before_create",
                "tasks",
                json!({ "title": "x", "done": false, "completed_on": "2026-01-01" }),
            )
            .unwrap()
            .unwrap();
        assert!(v.get("completed_on").is_none());
    }

    #[test]
    fn the_tone_of_the_open_widget() {
        assert_eq!(open_tone(2, 1), "err");
        assert_eq!(open_tone(0, 3), "warn");
        assert_eq!(open_tone(0, 0), "");
    }

    #[test]
    fn a_list_shows_six_items_and_counts_the_rest() {
        let items: Vec<Value> = (0..9).map(|i| json!({ "title": i })).collect();
        let b = list_body(items);
        assert_eq!(b["items"].as_array().unwrap().len(), 6);
        assert_eq!(b["more"], 3);
        assert_eq!(list_body(Vec::new()), json!({ "items": [], "more": 0 }));
    }

    #[test]
    fn the_soon_window_and_items() {
        assert_eq!(soon_limit("2026-10-28", 7).unwrap(), "2026-11-04");
        assert_eq!(soon_limit("2026-12-29", 7).unwrap(), "2027-01-05");
        assert!(soon_limit("", 7).is_none());
        let row = json!({ "id": "a", "title": "Pay", "due": "2026-10-20" });
        let i = soon_item(&row, "2026-10-20");
        assert_eq!(
            (i["meta"].as_str(), i["tone"].as_str()),
            (Some("2026-10-20"), Some("warn"))
        );
        assert_eq!(soon_item(&row, "2026-10-19")["tone"], "");
    }

    #[test]
    fn the_widgets_use_the_clock_and_the_counts() {
        let h = MockHost::new().on("db.query", |_| {
            Ok(json!([{ "d": "2026-10-20", "open": 5, "overdue": 2, "due_today": 1 }]))
        });
        let v = h
            .command(&__msk_registry(), "tasks.widget_open", json!({}))
            .unwrap();
        assert_eq!(v, json!({ "value": 5, "secondary": 2, "tone": "err" }));
    }

    #[test]
    fn the_commands_are_registered() {
        let names = __msk_registry().command_names();
        for c in [
            "tasks.overdue",
            "tasks.widget_open",
            "tasks.widget_soon",
            "tasks.for_project",
            "tasks.set_project",
            "tasks.add_for_project",
            "tasks.due_between",
            "tasks.without_project",
        ] {
            assert!(names.contains(&c), "{c}");
        }
    }

    #[test]
    fn uuids_and_dates_are_checked() {
        assert!(is_uuid("0a1b2c3d-0000-4000-8000-0123456789ab"));
        assert!(!is_uuid("0a1b2c3d-0000-4000-8000-0123456789a"));
        assert!(!is_uuid("x'; drop table tasks;--"));
        assert_eq!(
            opt_date(&json!({ "d": " 2026-10-05 " }), "d")
                .unwrap()
                .as_deref(),
            Some("2026-10-05")
        );
        assert_eq!(opt_date(&json!({}), "d").unwrap(), None);
        assert!(opt_date(&json!({ "d": "2026-02-30" }), "d").is_err());
        assert!(opt_date(&json!({ "d": "5/10/2026" }), "d").is_err());
    }

    #[test]
    fn for_project_compares_the_trimmed_name() {
        let h = MockHost::new().on("db.query", |req| {
            assert_eq!(req["params"][0], "Alpha");
            Ok(json!([{ "id": "a", "title": "x", "done": false }]))
        });
        let out = h
            .command(
                &__msk_registry(),
                "tasks.for_project",
                json!({ "project": "  Alpha " }),
            )
            .unwrap();
        assert_eq!(out.as_array().unwrap().len(), 1);
        let err = MockHost::new()
            .command(
                &__msk_registry(),
                "tasks.for_project",
                json!({ "project": " " }),
            )
            .unwrap_err();
        assert!(err.contains("which project"));
    }

    #[test]
    fn set_project_builds_one_update() {
        let h = MockHost::new().on("db.exec", |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            assert!(sql.contains("in ($2::uuid, $3::uuid)"), "{sql}");
            assert_eq!(req["params"][0], "Alpha");
            Ok(json!({ "rows": 2 }))
        });
        let ids = json!([
            "0a1b2c3d-0000-4000-8000-0123456789ab",
            "0a1b2c3d-0000-4000-8000-0123456789ac"
        ]);
        let out = h
            .command(
                &__msk_registry(),
                "tasks.set_project",
                json!({ "ids": ids, "project": "Alpha" }),
            )
            .unwrap();
        assert_eq!(out["changed"], 2);
        let bad = MockHost::new()
            .command(
                &__msk_registry(),
                "tasks.set_project",
                json!({ "ids": ["nope"], "project": "A" }),
            )
            .unwrap_err();
        assert!(bad.contains("not valid"));
        let none = MockHost::new()
            .command(&__msk_registry(), "tasks.set_project", json!({ "ids": [] }))
            .unwrap();
        assert_eq!(none["changed"], 0);
    }

    #[test]
    fn a_task_for_a_project_needs_both_names() {
        for args in [
            json!({ "project": "", "title": "x" }),
            json!({ "project": "A", "title": "  " }),
            json!({ "project": "A", "title": "x", "due": "soon" }),
        ] {
            assert!(MockHost::new()
                .command(&__msk_registry(), "tasks.add_for_project", args)
                .is_err());
        }
    }

    #[test]
    fn without_project_passes_the_trimmed_word() {
        let h = MockHost::new().on("db.query", |req| {
            assert_eq!(req["params"][0], "docs");
            Ok(json!([{ "id": "a", "title": "Write docs" }]))
        });
        let out = h
            .command(
                &__msk_registry(),
                "tasks.without_project",
                json!({ "q": " docs " }),
            )
            .unwrap();
        assert_eq!(out.as_array().unwrap().len(), 1);
    }

    #[test]
    fn due_between_needs_an_ordered_range() {
        let r = |a| MockHost::new().command(&__msk_registry(), "tasks.due_between", a);
        assert!(r(json!({ "from": "2026-10-05" })).is_err());
        assert!(r(json!({ "from": "2026-10-05", "to": "2026-10-01" }))
            .unwrap_err()
            .contains("before"));
        let h = MockHost::new().on("db.query", |_| Ok(json!([{ "id": "a" }])));
        let out = h
            .command(
                &__msk_registry(),
                "tasks.due_between",
                json!({ "from": "2026-10-01", "to": "2026-10-31" }),
            )
            .unwrap();
        assert_eq!(out.as_array().unwrap().len(), 1);
    }
}
