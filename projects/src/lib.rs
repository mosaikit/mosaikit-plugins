//! Projects plugin: a plan for a set of tasks. A project has the columns of a board, milestones with dates and sprints
//! (time boxes). The tasks stay tasks: the Tasks plugin owns them and the field `project` of a task holds the NAME of the
//! project. Projects reads and arranges them only through commands of Tasks (`ctx.call_plugin`), which run as the same
//! person with the rules of Tasks: nobody sees or changes more tasks here than in Tasks. The table `placements` keeps
//! which column and sprint a task is in.
//!
//! Calls between plugins need PostgreSQL. Moving a card to the last column does NOT change `done`: the card shows both.

use mosaikit_plugin_sdk::prelude::*;
use mosaikit_plugin_sdk::serde_json;

const DEFAULT_COLUMNS: [&str; 3] = ["To do", "Doing", "Done"];
const STATUSES: [&str; 4] = ["planned", "active", "on_hold", "done"];
const MAX_NAME: usize = 80;
const MAX_COLUMN: usize = 30;
const MAX_MILESTONES: usize = 30;
const MAX_SPRINTS: usize = 40;
/// Projects whose progress the list asks Tasks for in one call of `projects.overview`.
const OVERVIEW_PROJECTS: usize = 30;
/// Most tasks `projects.attach` sets at once.
const MAX_ATTACH: usize = 100;

// ------------------------------------------------------------------------------------------------------ dates

fn days_in_month(y: i32, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        _ => 28,
    }
}

/// Is `s` a real calendar date written `YYYY-MM-DD`?
fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let num = |r: std::ops::Range<usize>| {
        s.get(r)
            .filter(|t| t.bytes().all(|c| c.is_ascii_digit()))
            .and_then(|t| t.parse::<u32>().ok())
    };
    let (Some(y), Some(m), Some(d)) = (num(0..4), num(5..7), num(8..10)) else {
        return false;
    };
    (1..=12).contains(&m) && d >= 1 && d <= days_in_month(y as i32, m)
}

fn bad(code: &str, msg: impl Into<String>) -> Error {
    Error::coded(code, msg)
}

/// An optional date field: empty is fine, anything else must be a real date.
fn opt_date(v: &Values, key: &str, code: &str, what: &str) -> Result<String> {
    let s = v.str(key).trim().to_string();
    if !s.is_empty() && !is_date(&s) {
        return Err(bad(
            code,
            format!("{what} must be a date written YYYY-MM-DD"),
        ));
    }
    Ok(s)
}

// ------------------------------------------------------------------------------------------------------ rules

/// A text with no control characters (they would break the match with the `project` of a task and the display).
fn clean_text(s: &str, max: usize) -> Option<String> {
    let t = s.trim();
    if t.is_empty() || t.chars().count() > max || t.chars().any(char::is_control) {
        return None;
    }
    Some(t.to_string())
}

/// The columns of the board: 2 to 8 distinct non-empty names of at most 30 characters; empty means the default three.
fn check_columns(raw: &str) -> Result<Vec<String>> {
    if raw.trim().is_empty() {
        return Ok(DEFAULT_COLUMNS.iter().map(|c| c.to_string()).collect());
    }
    let list: Vec<Value> = serde_json::from_str(raw)
        .map_err(|_| bad("project_columns", "the columns must be a list of names"))?;
    if !(2..=8).contains(&list.len()) {
        return Err(bad("project_columns", "a board has from 2 to 8 columns"));
    }
    let mut out: Vec<String> = Vec::new();
    for c in &list {
        let name = c
            .as_str()
            .and_then(|s| clean_text(s, MAX_COLUMN))
            .ok_or_else(|| {
                bad(
                    "project_columns",
                    format!("a column name is not empty and has at most {MAX_COLUMN} characters"),
                )
            })?;
        if out.iter().any(|o| o.to_lowercase() == name.to_lowercase()) {
            return Err(bad("project_columns", "two columns have the same name"));
        }
        out.push(name);
    }
    Ok(out)
}

fn text_of(item: &Value, key: &str) -> String {
    item.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// The id of a milestone or sprint: short, letters digits and `-_`.
fn check_item_id(item: &Value, code: &str, seen: &mut Vec<String>) -> Result<String> {
    let id = text_of(item, "id");
    if id.is_empty()
        || id.len() > 40
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(bad(code, "an entry has no valid id"));
    }
    if seen.contains(&id) {
        return Err(bad(code, "two entries have the same id"));
    }
    seen.push(id.clone());
    Ok(id)
}

/// Milestones `{id, name, date, done}`, at most 30, each with a name and a real date.
fn check_milestones(raw: &str) -> Result<Vec<Value>> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let list: Vec<Value> = serde_json::from_str(raw)
        .map_err(|_| bad("project_milestones", "the milestones must be a list"))?;
    if list.len() > MAX_MILESTONES {
        return Err(bad(
            "project_milestones",
            format!("a project has at most {MAX_MILESTONES} milestones"),
        ));
    }
    let mut seen = Vec::new();
    let mut out = Vec::new();
    for m in &list {
        let id = check_item_id(m, "project_milestones", &mut seen)?;
        let name = clean_text(&text_of(m, "name"), MAX_NAME)
            .ok_or_else(|| bad("project_milestones", "a milestone needs a name"))?;
        let date = text_of(m, "date");
        if !is_date(&date) {
            return Err(bad(
                "project_milestones",
                "a milestone needs a date written YYYY-MM-DD",
            ));
        }
        let done = m.get("done").and_then(Value::as_bool).unwrap_or(false);
        out.push(json!({ "id": id, "name": name, "date": date, "done": done }));
    }
    Ok(out)
}

/// Sprints `{id, name, start, end}`, at most 40, each ending on or after its start (they may overlap).
fn check_sprints(raw: &str) -> Result<Vec<Value>> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let list: Vec<Value> = serde_json::from_str(raw)
        .map_err(|_| bad("project_sprints", "the sprints must be a list"))?;
    if list.len() > MAX_SPRINTS {
        return Err(bad(
            "project_sprints",
            format!("a project has at most {MAX_SPRINTS} sprints"),
        ));
    }
    let mut seen = Vec::new();
    let mut out = Vec::new();
    for s in &list {
        let id = check_item_id(s, "project_sprints", &mut seen)?;
        let name = clean_text(&text_of(s, "name"), MAX_COLUMN * 2)
            .ok_or_else(|| bad("project_sprints", "a sprint needs a name"))?;
        let (start, end) = (text_of(s, "start"), text_of(s, "end"));
        if !is_date(&start) || !is_date(&end) {
            return Err(bad(
                "project_sprints",
                "a sprint needs a start and an end written YYYY-MM-DD",
            ));
        }
        if end < start {
            return Err(bad(
                "project_sprints",
                "a sprint cannot end before it starts",
            ));
        }
        out.push(json!({ "id": id, "name": name, "start": start, "end": end }));
    }
    Ok(out)
}

fn project(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let name = clean_text(&v.str("name"), MAX_NAME).ok_or_else(|| {
        bad(
            "project_name",
            format!("a project needs a name of at most {MAX_NAME} characters, with no control characters"),
        )
    })?;
    v.set("name", name);
    let status = v.str("status");
    if status.is_empty() {
        v.set("status", "active");
    } else if !STATUSES.contains(&status.as_str()) {
        return Err(bad(
            "project_status",
            "the status is planned, active, on hold or done",
        ));
    }
    let starts = opt_date(&v, "starts_on", "project_dates", "the start")?;
    let ends = opt_date(&v, "ends_on", "project_dates", "the end")?;
    if !starts.is_empty() && !ends.is_empty() && ends < starts {
        return Err(bad(
            "project_dates",
            "a project cannot end before it starts",
        ));
    }
    v.set("starts_on", starts);
    v.set("ends_on", ends);
    let columns = check_columns(&v.str("columns"))?;
    v.set("columns", json!(columns).to_string());
    let milestones = check_milestones(&v.str("milestones"))?;
    v.set("milestones", Value::Array(milestones).to_string());
    let sprints = check_sprints(&v.str("sprints"))?;
    v.set("sprints", Value::Array(sprints).to_string());
    Ok(Some(v))
}

// ------------------------------------------------------------------------------------------------------ board logic

/// Where a task sits on the board: the column and sprint of its placement, if any.
#[derive(Clone, Debug, PartialEq)]
struct Placement {
    task: String,
    column: String,
    sprint: Option<String>,
    position: i64,
}

fn is_done(task: &Value) -> bool {
    task.get("done").and_then(Value::as_bool).unwrap_or(false)
}

/// Puts every task in a column. A task with a placement in an existing column stays there; any other goes to the first
/// column, or to the last one when it is done. Inside a column the placed tasks come first, by position, then the others
/// in the order Tasks gave them. Each card is the task plus `column`, `sprint` (a sprint of the project, or null) and
/// `position`.
fn arrange(
    columns: &[String],
    sprint_ids: &[String],
    tasks: &[Value],
    placements: &[Placement],
) -> Vec<Vec<Value>> {
    let mut out: Vec<Vec<(i64, usize, bool, Value)>> = columns.iter().map(|_| Vec::new()).collect();
    for (i, t) in tasks.iter().enumerate() {
        let id = t.get("id").and_then(Value::as_str).unwrap_or_default();
        let placed = placements.iter().find(|p| p.task == id);
        let at = placed.and_then(|p| columns.iter().position(|c| *c == p.column));
        let col = at.unwrap_or(if is_done(t) {
            columns.len().saturating_sub(1)
        } else {
            0
        });
        let sprint = placed
            .and_then(|p| p.sprint.clone())
            .filter(|s| sprint_ids.contains(s));
        let mut card = t.clone();
        card["column"] = json!(columns.get(col).cloned().unwrap_or_default());
        card["sprint"] = sprint.map_or(Value::Null, Value::String);
        let pos = placed.filter(|_| at.is_some()).map_or(0, |p| p.position);
        card["position"] = json!(pos);
        if let Some(list) = out.get_mut(col) {
            list.push((pos, i, at.is_some(), card));
        }
    }
    out.into_iter()
        .map(|mut list| {
            // placed first (by position), then the unplaced in the order of Tasks
            list.sort_by_key(|(pos, i, placed, _)| (!*placed, if *placed { *pos } else { 0 }, *i));
            list.into_iter().map(|(_, _, _, c)| c).collect()
        })
        .collect()
}

/// `(done, total, percent)` of the tasks; the percent is rounded and 0 for no task.
fn progress_of(tasks: &[Value]) -> (usize, usize, u32) {
    let total = tasks.len();
    let done = tasks.iter().filter(|t| is_done(t)).count();
    let percent = (done * 100 + total / 2).checked_div(total).unwrap_or(0) as u32;
    (done, total, percent)
}

/// Done and total tasks of each sprint (a sprint with no task counts 0 of 0).
fn per_sprint(sprint_ids: &[String], cards: &[Value]) -> Vec<Value> {
    sprint_ids
        .iter()
        .map(|id| {
            let mine: Vec<&Value> = cards
                .iter()
                .filter(|c| c.get("sprint").and_then(Value::as_str) == Some(id.as_str()))
                .collect();
            let done = mine.iter().filter(|c| is_done(c)).count();
            json!({ "id": id, "done": done, "total": mine.len() })
        })
        .collect()
}

// ------------------------------------------------------------------------------------------------------ burndown

/// Days since 1970-01-01 of a valid `YYYY-MM-DD`.
fn day_number(s: &str) -> Option<i64> {
    if !is_date(s) {
        return None;
    }
    let (y, m, d) = (
        s[0..4].parse::<i64>().ok()?,
        s[5..7].parse::<i64>().ok()?,
        s[8..10].parse::<i64>().ok()?,
    );
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

/// The date `YYYY-MM-DD` of a number of days since 1970-01-01.
fn date_of(n: i64) -> String {
    let z = n + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    format!("{:04}-{:02}-{:02}", if m <= 2 { y + 1 } else { y }, m, d)
}

/// The most days a burndown draws.
const MAX_BURNDOWN_DAYS: i64 = 400;

/// The burndown of `total` tasks between `from` and `to`: for each day the tasks still open at its end (`remaining`, only
/// up to `today`) and the ideal line, a straight way from all of them to none. `done_on` are the days the finished tasks
/// were completed; `undated` finished tasks have no day and count as finished before the first day. A task completed
/// before `from` is finished at the start; one completed after `to` is still open at the end of the period.
fn burndown_days(from: i64, to: i64, today: i64, total: usize, done_on: &[i64], undated: usize) -> Vec<Value> {
    let span = (to - from).max(1) as f64;
    (from..=to)
        .map(|d| {
            let finished = undated + done_on.iter().filter(|c| **c <= d).count();
            let remaining = if d <= today {
                json!(total.saturating_sub(finished))
            } else {
                Value::Null
            };
            let ideal = (total as f64 * (to - d) as f64 / span * 10.0).round() / 10.0;
            json!({ "date": date_of(d), "remaining": remaining, "ideal": ideal })
        })
        .collect()
}

/// The burndown of the project, or of one of its sprints (`sprint`): the tasks in scope are the cards of the board.
fn burndown(ctx: &Ctx, args: Value) -> Result<Value> {
    let p = load(ctx, &arg_id(&args, "id")?)?;
    let sprint = args
        .get("sprint")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let (start, end) = match &sprint {
        Some(sid) => {
            let s = p
                .sprints
                .iter()
                .find(|s| s.get("id").and_then(Value::as_str) == Some(sid.as_str()))
                .ok_or_else(|| Error::coded("not_found", "sprint not found"))?;
            (text_of(s, "start"), text_of(s, "end"))
        }
        None => (p.starts_on.clone(), p.ends_on.clone()),
    };
    let (Some(from), Some(to)) = (day_number(&start), day_number(&end)) else {
        // a project with no dates has nothing to burn down against
        return Ok(json!({ "available": false, "reason": "no_dates" }));
    };
    if to < from {
        return Ok(json!({ "available": false, "reason": "no_dates" }));
    }
    if to - from > MAX_BURNDOWN_DAYS {
        return Err(Error::coded(
            "range_too_wide",
            format!("a burndown covers at most {MAX_BURNDOWN_DAYS} days"),
        ));
    }
    let tasks = tasks_of(ctx, &p.name)?;
    let placements = placements_of(ctx, &p.id)?;
    let sprint_ids = ids_of(&p.sprints);
    let cards: Vec<Value> = arrange(&p.columns, &sprint_ids, &tasks, &placements)
        .into_iter()
        .flatten()
        .filter(|c| match &sprint {
            Some(sid) => c.get("sprint").and_then(Value::as_str) == Some(sid.as_str()),
            None => true,
        })
        .collect();
    let done: Vec<&Value> = cards.iter().filter(|c| is_done(c)).collect();
    let done_on: Vec<i64> = done
        .iter()
        .filter_map(|c| {
            c.get("completed_on")
                .and_then(Value::as_str)
                .and_then(|d| day_number(d.get(..10).unwrap_or("")))
        })
        .collect();
    let undated = done.len() - done_on.len();
    let today_text = ctx
        .db()
        .query_one("select current_date::text as d", &[])?
        .map(|r| row_str(&r, "d"))
        .unwrap_or_default();
    let today = day_number(today_text.get(..10).unwrap_or("")).unwrap_or(to);
    Ok(json!({
        "available": true,
        "from": date_of(from),
        "to": date_of(to),
        "total": cards.len(),
        "done": done.len(),
        "undated": undated,
        "days": burndown_days(from, to, today, cards.len(), &done_on, undated),
    }))
}

// ------------------------------------------------------------------------------------------------------ data

struct Loaded {
    id: String,
    name: String,
    status: String,
    description: String,
    starts_on: String,
    ends_on: String,
    columns: Vec<String>,
    milestones: Vec<Value>,
    sprints: Vec<Value>,
}

fn list_of(raw: &str) -> Vec<Value> {
    serde_json::from_str(raw).unwrap_or_default()
}

fn ids_of(list: &[Value]) -> Vec<String> {
    list.iter()
        .filter_map(|s| s.get("id").and_then(Value::as_str).map(str::to_string))
        .collect()
}

fn is_uuid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 5
        && parts
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(p, n)| p.len() == n && p.chars().all(|c| c.is_ascii_hexdigit()))
}

fn arg_id(args: &Value, key: &str) -> Result<String> {
    let id = args.get(key).and_then(Value::as_str).unwrap_or_default();
    if !is_uuid(id) {
        return Err(bad("invalid_id", format!("{key}: not a valid id")));
    }
    Ok(id.to_string())
}

fn row_str(row: &Value, key: &str) -> String {
    row.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// The project `id` as the caller sees it (the policies of the table hide it from anyone else).
fn load(ctx: &Ctx, id: &str) -> Result<Loaded> {
    let row = ctx
        .db()
        .query_one(
            "select name, status, description, starts_on::text as starts_on, ends_on::text as ends_on, \"columns\", milestones, sprints
             from projects where resource_id = $1::uuid",
            &[json!(id)],
        )?
        .ok_or_else(|| Error::coded("not_found", "project not found"))?;
    let mut columns: Vec<String> = list_of(&row_str(&row, "columns"))
        .iter()
        .filter_map(|c| c.as_str().map(str::to_string))
        .collect();
    if columns.len() < 2 {
        columns = DEFAULT_COLUMNS.iter().map(|c| c.to_string()).collect();
    }
    Ok(Loaded {
        id: id.to_string(),
        name: row_str(&row, "name"),
        status: row_str(&row, "status"),
        description: row_str(&row, "description"),
        starts_on: row_str(&row, "starts_on"),
        ends_on: row_str(&row, "ends_on"),
        columns,
        milestones: list_of(&row_str(&row, "milestones")),
        sprints: list_of(&row_str(&row, "sprints")),
    })
}

/// Does the message of a failed call say that Tasks cannot be reached (absent, off, too old, not declared, SQLite)? Any other
/// message is an answer of Tasks itself (a bad date, a missing title) and is kept.
fn is_unreachable(msg: &str) -> bool {
    [
        "plugin not active",
        "not turned on in this tenant",
        "unknown command",
        "not declared in permissions.calls",
        "requires PostgreSQL",
        "kernel not available",
        "plugin not installed",
    ]
    .iter()
    .any(|m| msg.contains(m))
}

/// Runs a command of Tasks. A call that cannot reach Tasks becomes `tasks_unavailable` with a message that says what to do.
fn tasks_call(ctx: &Ctx, name: &str, args: Value) -> Result<Value> {
    ctx.call_plugin("com.mosaikit.tasks", name, args).map_err(|e| {
        if !is_unreachable(&e.message) {
            return e;
        }
        Error::coded(
            "tasks_unavailable",
            format!("The Tasks plugin is not available: install it (version 0.6 or later) and turn it on. {}", e.message),
        )
    })
}

fn tasks_of(ctx: &Ctx, name: &str) -> Result<Vec<Value>> {
    match tasks_call(ctx, "tasks.for_project", json!({ "project": name }))? {
        Value::Array(a) => Ok(a),
        _ => Ok(Vec::new()),
    }
}

fn placements_of(ctx: &Ctx, id: &str) -> Result<Vec<Placement>> {
    let rows = ctx.db().query(
        "select task_id::text as task, column_name, sprint_id, position from placements where resource_id = $1::uuid",
        &[json!(id)],
    )?;
    Ok(rows
        .iter()
        .map(|r| Placement {
            task: row_str(r, "task"),
            column: row_str(r, "column_name"),
            sprint: r
                .get("sprint_id")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_string),
            position: r.get("position").and_then(Value::as_i64).unwrap_or(0),
        })
        .collect())
}

// ------------------------------------------------------------------------------------------------------ commands

/// Everything the board shows, in one call.
fn board(ctx: &Ctx, args: Value) -> Result<Value> {
    let p = load(ctx, &arg_id(&args, "id")?)?;
    let tasks = tasks_of(ctx, &p.name)?;
    let placements = placements_of(ctx, &p.id)?;
    let sprint_ids = ids_of(&p.sprints);
    let by_column = arrange(&p.columns, &sprint_ids, &tasks, &placements);
    let cards: Vec<Value> = by_column.iter().flatten().cloned().collect();
    let (done, total, percent) = progress_of(&tasks);
    let columns: Vec<Value> = p
        .columns
        .iter()
        .zip(by_column)
        .map(|(name, tasks)| json!({ "name": name, "tasks": tasks }))
        .collect();
    Ok(json!({
        "project": {
            "id": p.id, "name": p.name, "status": p.status, "description": p.description,
            "starts_on": p.starts_on, "ends_on": p.ends_on,
        },
        "columns": columns,
        "milestones": p.milestones,
        "sprints": p.sprints,
        "progress": { "done": done, "total": total, "percent": percent },
        "per_sprint": per_sprint(&sprint_ids, &cards),
    }))
}

/// Moves a task to a column of the project (and, when `sprint` is present, to that sprint or out of any: null or empty).
/// With a `position` the cards of the column from there on move one place down. `done` is not touched.
fn move_task(ctx: &Ctx, args: Value) -> Result<Value> {
    let p = load(ctx, &arg_id(&args, "id")?)?;
    let task = arg_id(&args, "task")?;
    let column = args
        .get("column")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !p.columns.iter().any(|c| c == column) {
        return Err(bad("column_unknown", "this project has no such column"));
    }
    let existing = placements_of(ctx, &p.id)?
        .into_iter()
        .find(|x| x.task == task);
    // an absent `sprint` keeps the sprint the task has; null or "" takes it out of any
    let sprint: Option<String> = match args.get("sprint") {
        None => existing.as_ref().and_then(|x| x.sprint.clone()),
        Some(s) => s.as_str().filter(|s| !s.is_empty()).map(str::to_string),
    };
    if let Some(s) = &sprint {
        if !ids_of(&p.sprints).contains(s) {
            return Err(bad("sprint_unknown", "this project has no such sprint"));
        }
    }
    let tenant = ctx.tenant.clone().unwrap_or_default();
    // with a `position` the cards of the column from there on move one place down; without one the task keeps its place
    let given = args
        .get("position")
        .and_then(Value::as_i64)
        .map(|p| p.clamp(0, 10_000));
    let position = given.unwrap_or_else(|| existing.as_ref().map_or(1_000, |x| x.position));
    if given.is_some() {
        ctx.db().exec(
            "update placements set position = position + 1 where resource_id = $1::uuid and column_name = $2 and position >= $3::int and task_id <> $4::uuid",
            &[json!(p.id), json!(column), json!(position), json!(task)],
        )?;
    }
    set_placement(
        ctx,
        &p.id,
        &tenant,
        &task,
        column,
        sprint.as_deref(),
        position,
    )?;
    Ok(json!({ "moved": true }))
}

/// Writes the placement of a task: an update first, an insert when there was none.
fn set_placement(
    ctx: &Ctx,
    project: &str,
    tenant: &str,
    task: &str,
    column: &str,
    sprint: Option<&str>,
    position: i64,
) -> Result<()> {
    let n = ctx.db().exec(
        "update placements set column_name = $3, sprint_id = $4, position = $5::int where resource_id = $1::uuid and task_id = $2::uuid",
        &[json!(project), json!(task), json!(column), json!(sprint), json!(position)],
    )?;
    if n == 0 {
        ctx.db().exec(
            "insert into placements (resource_id, tenant_id, task_id, column_name, sprint_id, position) values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::int) on conflict (resource_id, task_id) do nothing",
            &[json!(project), json!(tenant), json!(task), json!(column), json!(sprint), json!(position)],
        )?;
    }
    Ok(())
}

/// Creates a task of the project through Tasks and places it in a column (the first by default).
fn add_task(ctx: &Ctx, args: Value) -> Result<Value> {
    let p = load(ctx, &arg_id(&args, "id")?)?;
    let column = match args
        .get("column")
        .and_then(Value::as_str)
        .filter(|c| !c.is_empty())
    {
        Some(c) if p.columns.iter().any(|x| x == c) => c.to_string(),
        Some(_) => return Err(bad("column_unknown", "this project has no such column")),
        None => p.columns[0].clone(),
    };
    let made = tasks_call(
        ctx,
        "tasks.add_for_project",
        json!({ "project": p.name, "title": args.get("title").cloned().unwrap_or(Value::Null), "due": args.get("due").cloned().unwrap_or(Value::Null) }),
    )?;
    let task = made
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if !is_uuid(&task) {
        return Err(Error::msg("Tasks did not return the new task"));
    }
    let tenant = ctx.tenant.clone().unwrap_or_default();
    set_placement(ctx, &p.id, &tenant, &task, &column, None, 1_000)?;
    Ok(json!({ "id": task }))
}

/// Sets this project on existing tasks (those the caller may write); answers how many changed.
fn attach(ctx: &Ctx, args: Value) -> Result<Value> {
    let p = load(ctx, &arg_id(&args, "id")?)?;
    let ids: Vec<Value> = args
        .get("tasks")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if ids.len() > MAX_ATTACH {
        return Err(bad(
            "too_many_tasks",
            format!("at most {MAX_ATTACH} tasks at a time"),
        ));
    }
    let out = tasks_call(
        ctx,
        "tasks.set_project",
        json!({ "ids": ids, "project": p.name }),
    )?;
    Ok(json!({ "changed": out.get("changed").and_then(Value::as_u64).unwrap_or(0) }))
}

/// The open tasks that belong to no project, to attach (at most 50, filtered by a word of the title).
fn candidates(ctx: &Ctx, args: Value) -> Result<Value> {
    let _ = load(ctx, &arg_id(&args, "id")?)?;
    tasks_call(
        ctx,
        "tasks.without_project",
        json!({ "q": args.get("q").cloned().unwrap_or(Value::Null) }),
    )
}

/// Done and total tasks of the first 30 projects the caller sees (the most recently changed first); `null` beyond, and for
/// all of them when Tasks cannot be reached (`tasks_available` false).
fn overview(ctx: &Ctx, _args: Value) -> Result<Value> {
    let rows = ctx.db().query(
        "select p.resource_id::text as id, p.name from projects p join core.visible_resources v on v.id = p.resource_id
         where v.kind = 'projects' order by v.updated_at desc limit 500",
        &[],
    )?;
    let mut progress = mosaikit_plugin_sdk::Map::new();
    let mut available = true;
    for (i, r) in rows.iter().enumerate() {
        let id = row_str(r, "id");
        let mut value = Value::Null;
        if available && i < OVERVIEW_PROJECTS {
            match tasks_of(ctx, &row_str(r, "name")) {
                Ok(tasks) => {
                    let (done, total, percent) = progress_of(&tasks);
                    value = json!({ "done": done, "total": total, "percent": percent });
                }
                Err(e) if e.code.as_deref() == Some("tasks_unavailable") => available = false,
                Err(_) => {}
            }
        }
        progress.insert(id, value);
    }
    Ok(json!({ "progress": progress, "tasks_available": available }))
}

/// Most items a list widget shows; the rest is reported as `more`.
const WIDGET_ITEMS: usize = 6;

/// The next milestone not done, the earliest: `(date, name)`.
fn next_open_milestone(milestones: &[Value]) -> Option<(String, String)> {
    milestones
        .iter()
        .filter(|m| !m.get("done").and_then(Value::as_bool).unwrap_or(false))
        .map(|m| (text_of(m, "date"), text_of(m, "name")))
        .filter(|(d, _)| is_date(d))
        .min()
}

/// The items of the widget: each active project with its next milestone (red when it is past), those with a milestone
/// first by date, then the rest by name.
fn active_items(rows: &[Value], today: &str) -> Vec<Value> {
    let mut list: Vec<(bool, String, String, Value)> = rows
        .iter()
        .map(|r| {
            let (name, id) = (row_str(r, "name"), row_str(r, "id"));
            let next = next_open_milestone(&list_of(&row_str(r, "milestones")));
            let (meta, tone, date) = match &next {
                Some((d, n)) => (format!("{n} · {d}"), if d.as_str() < today { "err" } else { "" }, d.clone()),
                None => (String::new(), "", String::new()),
            };
            (next.is_none(), date, name.clone(), json!({ "id": id, "title": name, "meta": meta, "tone": tone }))
        })
        .collect();
    list.sort_by(|a, b| (a.0, &a.1, &a.2).cmp(&(b.0, &b.1, &b.2)));
    list.into_iter().map(|x| x.3).collect()
}

/// Widget `active-projects`: the active projects the caller sees with their next milestone.
fn widget_active(ctx: &Ctx, _args: Value) -> Result<Value> {
    let rows = ctx.db().query(
        "select p.resource_id::text as id, p.name, p.milestones from projects p join core.visible_resources v on v.id = p.resource_id where v.kind = 'projects' and p.status = 'active' limit 500",
        &[],
    )?;
    let today = ctx
        .db()
        .query_one("select current_date::text as d", &[])?
        .map(|r| row_str(&r, "d"))
        .unwrap_or_default();
    let items = active_items(&rows, today.get(..10).unwrap_or(""));
    let more = items.len().saturating_sub(WIDGET_ITEMS);
    Ok(json!({ "items": items.into_iter().take(WIDGET_ITEMS).collect::<Vec<_>>(), "more": more }))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "projects.before_create" => project,
        "projects.before_update" => project,
    },
    commands: {
        "projects.board" => board,
        "projects.burndown" => burndown,
        "projects.widget_active" => widget_active,
        "projects.move" => move_task,
        "projects.add_task" => add_task,
        "projects.attach" => attach,
        "projects.candidates" => candidates,
        "projects.overview" => overview,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    const TASKS: &str = "com.mosaikit.tasks";
    const PID: &str = "0a1b2c3d-0000-4000-8000-0123456789ab";
    const T1: &str = "11111111-0000-4000-8000-000000000001";
    const T2: &str = "11111111-0000-4000-8000-000000000002";
    const T3: &str = "11111111-0000-4000-8000-000000000003";

    fn run(values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), "before_create", "projects", values)
    }

    fn cols(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_project_has_a_clean_name_and_defaults() {
        let v = run(json!({ "name": "  Release 2  " })).unwrap().unwrap();
        assert_eq!(v.str("name"), "Release 2");
        assert_eq!(v.str("status"), "active");
        let columns: Vec<String> = serde_json::from_str(&v.str("columns")).unwrap();
        assert_eq!(columns, cols(&["To do", "Doing", "Done"]));
        assert_eq!(v.str("milestones"), "[]");
        assert!(run(json!({ "name": "   " })).unwrap_err().contains("name"));
        assert!(run(json!({ "name": "x".repeat(81) })).is_err());
        assert!(run(json!({ "name": "x".repeat(80) })).is_ok());
        assert!(run(json!({ "name": "two\nlines" })).is_err());
        assert!(run(json!({ "name": "x", "status": "stuck" })).is_err());
        assert!(run(json!({ "name": "x", "status": "on_hold" })).is_ok());
    }

    #[test]
    fn dates_are_real_and_ordered() {
        assert!(
            is_date("2028-02-29")
                && !is_date("2026-02-29")
                && !is_date("2026-13-01")
                && !is_date("26-1-1")
                && !is_date("2026-01-0a")
        );
        assert!(
            run(json!({ "name": "x", "starts_on": "2026-05-02", "ends_on": "2026-05-01" }))
                .unwrap_err()
                .contains("end before")
        );
        assert!(
            run(json!({ "name": "x", "starts_on": "2026-05-01", "ends_on": "2026-05-01" })).is_ok()
        );
        assert!(run(json!({ "name": "x", "ends_on": "2026-05-01" })).is_ok());
        assert!(run(json!({ "name": "x", "starts_on": "May" })).is_err());
    }

    #[test]
    fn columns_are_two_to_eight_distinct_names() {
        let ok = |l: Value| run(json!({ "name": "x", "columns": l.to_string() }));
        assert!(ok(json!(["A", "B"])).is_ok());
        assert!(ok(json!(["A"])).unwrap_err().contains("2 to 8"));
        assert!(ok(json!(["1", "2", "3", "4", "5", "6", "7", "8", "9"])).is_err());
        assert!(ok(json!(["A", "a"])).unwrap_err().contains("same name"));
        assert!(ok(json!(["A", " "])).is_err());
        assert!(ok(json!(["A", "x".repeat(31)])).is_err());
        assert!(ok(json!(["A", 3])).is_err());
        assert!(run(json!({ "name": "x", "columns": "not json" })).is_err());
        let v = ok(json!([" Backlog ", "Live"])).unwrap().unwrap();
        assert_eq!(v.str("columns"), "[\"Backlog\",\"Live\"]");
    }

    #[test]
    fn milestones_and_sprints_are_checked() {
        let ms = |l: Value| run(json!({ "name": "x", "milestones": l.to_string() }));
        assert!(
            ms(json!([{ "id": "m1", "name": "Beta", "date": "2026-06-01", "done": true }])).is_ok()
        );
        assert!(ms(json!([{ "id": "m1", "name": "Beta", "date": "2026-6-1" }])).is_err());
        assert!(ms(json!([{ "id": "m1", "name": "", "date": "2026-06-01" }])).is_err());
        assert!(ms(json!([{ "id": "", "name": "a", "date": "2026-06-01" }])).is_err());
        assert!(ms(json!([{ "id": "a b", "name": "a", "date": "2026-06-01" }])).is_err());
        assert!(ms(json!([{ "id": "m", "name": "a", "date": "2026-06-01" }, { "id": "m", "name": "b", "date": "2026-06-02" }])).is_err());
        let many: Vec<Value> = (0..31)
            .map(|i| json!({ "id": format!("m{i}"), "name": "a", "date": "2026-06-01" }))
            .collect();
        assert!(ms(Value::Array(many[..30].to_vec())).is_ok());
        assert!(ms(Value::Array(many)).unwrap_err().contains("at most 30"));
        let sp = |l: Value| run(json!({ "name": "x", "sprints": l.to_string() }));
        assert!(sp(
            json!([{ "id": "s1", "name": "Sprint 1", "start": "2026-06-01", "end": "2026-06-14" }])
        )
        .is_ok());
        assert!(sp(
            json!([{ "id": "s1", "name": "S", "start": "2026-06-14", "end": "2026-06-01" }])
        )
        .unwrap_err()
        .contains("end before"));
        assert!(sp(json!([{ "id": "s1", "name": "S", "start": "2026-06-14" }])).is_err());
        // overlapping sprints are allowed
        assert!(sp(json!([
            { "id": "a", "name": "A", "start": "2026-06-01", "end": "2026-06-14" },
            { "id": "b", "name": "B", "start": "2026-06-10", "end": "2026-06-20" }
        ]))
        .is_ok());
    }

    fn task(id: &str, done: bool) -> Value {
        json!({ "id": id, "title": id, "done": done })
    }

    #[test]
    fn tasks_without_a_placement_go_first_or_last() {
        let c = cols(&["To do", "Doing", "Done"]);
        let out = arrange(&c, &[], &[task(T1, false), task(T2, true)], &[]);
        assert_eq!(out[0].len(), 1);
        assert_eq!(out[0][0]["id"], T1);
        assert!(out[1].is_empty());
        assert_eq!(out[2][0]["id"], T2);
        assert_eq!(out[2][0]["column"], "Done");
    }

    #[test]
    fn a_placement_wins_and_an_unknown_column_is_ignored() {
        let c = cols(&["To do", "Doing", "Done"]);
        let p = |t: &str, col: &str, pos: i64, sprint: Option<&str>| Placement {
            task: t.into(),
            column: col.into(),
            sprint: sprint.map(str::to_string),
            position: pos,
        };
        let placements = [
            p(T1, "Doing", 1, Some("s1")),
            p(T2, "Doing", 0, Some("gone")),
            p(T3, "Removed", 0, None),
        ];
        let out = arrange(
            &c,
            &["s1".to_string()],
            &[task(T1, false), task(T2, true), task(T3, false)],
            &placements,
        );
        // T2 is done and placed in Doing (done does not move it); T3 had a column that no longer exists
        assert_eq!(
            out[1]
                .iter()
                .map(|x| x["id"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec![T2, T1]
        );
        assert_eq!(out[1][1]["sprint"], "s1");
        assert_eq!(out[1][0]["sprint"], Value::Null);
        assert_eq!(out[0][0]["id"], T3);
    }

    #[test]
    fn placed_cards_come_before_unplaced_ones() {
        let c = cols(&["A", "B"]);
        let p = Placement {
            task: T3.into(),
            column: "A".into(),
            sprint: None,
            position: 5,
        };
        let out = arrange(
            &c,
            &[],
            &[task(T1, false), task(T2, false), task(T3, false)],
            &[p],
        );
        assert_eq!(
            out[0]
                .iter()
                .map(|x| x["id"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec![T3, T1, T2]
        );
    }

    #[test]
    fn progress_rounds_and_handles_no_tasks() {
        assert_eq!(progress_of(&[]), (0, 0, 0));
        assert_eq!(
            progress_of(&[task(T1, true), task(T2, false), task(T3, false)]),
            (1, 3, 33)
        );
        assert_eq!(
            progress_of(&[task(T1, true), task(T2, true), task(T3, false)]),
            (2, 3, 67)
        );
        assert_eq!(progress_of(&[task(T1, true)]), (1, 1, 100));
    }

    #[test]
    fn each_sprint_counts_its_tasks() {
        let c = cols(&["A", "B"]);
        let p = |t: &str| Placement {
            task: t.into(),
            column: "A".into(),
            sprint: Some("s1".into()),
            position: 0,
        };
        let out = arrange(
            &c,
            &["s1".into(), "s2".into()],
            &[task(T1, true), task(T2, false), task(T3, false)],
            &[p(T1), p(T2)],
        );
        let cards: Vec<Value> = out.into_iter().flatten().collect();
        let s = per_sprint(&["s1".into(), "s2".into()], &cards);
        assert_eq!(s[0], json!({ "id": "s1", "done": 1, "total": 2 }));
        assert_eq!(s[1], json!({ "id": "s2", "done": 0, "total": 0 }));
    }

    fn project_row() -> Value {
        json!({ "name": "Release 2", "status": "active", "description": "", "starts_on": "", "ends_on": "",
                "columns": "[\"To do\",\"Doing\",\"Done\"]", "milestones": "[{\"id\":\"m1\",\"name\":\"Beta\",\"date\":\"2026-06-01\",\"done\":false}]",
                "sprints": "[{\"id\":\"s1\",\"name\":\"Sprint 1\",\"start\":\"2026-06-01\",\"end\":\"2026-06-14\"}]" })
    }

    fn host() -> MockHost {
        MockHost::new()
            .on("db.query", |req| {
                let sql = req["sql"].as_str().unwrap_or_default();
                if sql.contains("from placements") {
                    Ok(json!([{ "task": T1, "column_name": "Doing", "sprint_id": "s1", "position": 0 }]))
                } else {
                    Ok(json!([project_row()]))
                }
            })
            .with_plugin_command(TASKS, "tasks.for_project", |args| {
                assert_eq!(args["project"], "Release 2");
                Ok(json!([task(T1, false), task(T2, true), task(T3, false)]))
            })
    }

    #[test]
    fn the_board_joins_tasks_placements_and_progress() {
        let out = host()
            .command(&__msk_registry(), "projects.board", json!({ "id": PID }))
            .unwrap();
        assert_eq!(out["project"]["name"], "Release 2");
        let names: Vec<&str> = out["columns"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, vec!["To do", "Doing", "Done"]);
        assert_eq!(out["columns"][0]["tasks"][0]["id"], T3);
        assert_eq!(out["columns"][1]["tasks"][0]["id"], T1);
        assert_eq!(out["columns"][2]["tasks"][0]["id"], T2);
        assert_eq!(
            out["progress"],
            json!({ "done": 1, "total": 3, "percent": 33 })
        );
        assert_eq!(
            out["per_sprint"][0],
            json!({ "id": "s1", "done": 0, "total": 1 })
        );
        assert_eq!(out["milestones"][0]["name"], "Beta");
        assert!(host()
            .command(&__msk_registry(), "projects.board", json!({ "id": "x" }))
            .is_err());
    }

    #[test]
    fn a_missing_tasks_plugin_is_said_clearly() {
        let h = MockHost::new()
            .on("db.query", |_| Ok(json!([project_row()])))
            .with_plugin_command(TASKS, "tasks.for_project", |_| {
                Err("plugin not active: com.mosaikit.tasks".into())
            });
        let err = h
            .command_err(&__msk_registry(), "projects.board", json!({ "id": PID }))
            .unwrap_err();
        assert_eq!(err.code.as_deref(), Some("tasks_unavailable"));
        assert!(err.message.contains("Tasks plugin"));
    }

    #[test]
    fn only_a_failed_call_is_unavailable() {
        assert!(is_unreachable("plugin not active: com.mosaikit.tasks"));
        assert!(is_unreachable("unknown command: tasks.for_project"));
        assert!(is_unreachable("plugin.call requires PostgreSQL"));
        assert!(!is_unreachable("a task needs a title"));
        let h = host().with_plugin_command(TASKS, "tasks.add_for_project", |_| {
            Err("a task needs a title".into())
        });
        let err = h
            .command_err(
                &__msk_registry(),
                "projects.add_task",
                json!({ "id": PID, "title": " " }),
            )
            .unwrap_err();
        assert_ne!(err.code.as_deref(), Some("tasks_unavailable"));
        assert!(err.message.contains("title"));
    }

    #[test]
    fn move_checks_the_column_and_the_sprint() {
        let r = |a: Value| {
            host().on("db.exec", |_| Ok(json!({ "rows": 1 }))).command(
                &__msk_registry(),
                "projects.move",
                a,
            )
        };
        assert!(r(json!({ "id": PID, "task": T1, "column": "Nowhere" }))
            .unwrap_err()
            .contains("no such column"));
        assert!(
            r(json!({ "id": PID, "task": T1, "column": "Done", "sprint": "s9" }))
                .unwrap_err()
                .contains("no such sprint")
        );
        assert!(r(json!({ "id": PID, "task": "x", "column": "Done" })).is_err());
        assert_eq!(
            r(json!({ "id": PID, "task": T1, "column": "Done", "sprint": "s1", "position": 0 }))
                .unwrap()["moved"],
            true
        );
        assert!(r(json!({ "id": PID, "task": T1, "column": "Done", "sprint": null })).is_ok());
    }

    #[test]
    fn add_task_creates_through_tasks_and_places_it() {
        let h = host()
            .with_plugin_command(TASKS, "tasks.add_for_project", |args| {
                assert_eq!(
                    (args["project"].as_str(), args["title"].as_str()),
                    (Some("Release 2"), Some("Write docs"))
                );
                Ok(json!({ "id": T3 }))
            })
            .on("db.exec", |_| Ok(json!({ "rows": 1 })));
        let out = h
            .command(
                &__msk_registry(),
                "projects.add_task",
                json!({ "id": PID, "title": "Write docs", "column": "Doing" }),
            )
            .unwrap();
        assert_eq!(out["id"], T3);
        let bad_col = host().command(
            &__msk_registry(),
            "projects.add_task",
            json!({ "id": PID, "title": "x", "column": "Nope" }),
        );
        assert!(bad_col.unwrap_err().contains("no such column"));
    }

    #[test]
    fn attach_sets_the_project_through_tasks() {
        let h = host().with_plugin_command(TASKS, "tasks.set_project", |args| {
            assert_eq!(args["project"], "Release 2");
            Ok(json!({ "changed": 2 }))
        });
        let out = h
            .command(
                &__msk_registry(),
                "projects.attach",
                json!({ "id": PID, "tasks": [T1, T2] }),
            )
            .unwrap();
        assert_eq!(out["changed"], 2);
    }

    #[test]
    fn the_overview_asks_tasks_only_for_the_first_thirty() {
        let rows: Vec<Value> = (0..32)
            .map(|i| json!({ "id": format!("p{i}"), "name": format!("P{i}") }))
            .collect();
        let h = MockHost::new()
            .on("db.query", move |_| Ok(Value::Array(rows.clone())))
            .with_plugin_command(TASKS, "tasks.for_project", |_| {
                Ok(json!([task(T1, true), task(T2, false)]))
            });
        let out = h
            .command(&__msk_registry(), "projects.overview", json!({}))
            .unwrap();
        assert_eq!(out["tasks_available"], true);
        assert_eq!(
            out["progress"]["p0"],
            json!({ "done": 1, "total": 2, "percent": 50 })
        );
        assert_eq!(out["progress"]["p29"]["total"], 2);
        assert_eq!(out["progress"]["p30"], Value::Null);
        assert_eq!(out["progress"]["p31"], Value::Null);
        let none = MockHost::new()
            .on("db.query", |_| Ok(json!([{ "id": "p0", "name": "P" }])))
            .with_plugin_command(TASKS, "tasks.for_project", |_| {
                Err("unknown command: tasks.for_project".into())
            });
        let out = none
            .command(&__msk_registry(), "projects.overview", json!({}))
            .unwrap();
        assert_eq!(out["tasks_available"], false);
        assert_eq!(out["progress"]["p0"], Value::Null);
    }

    #[test]
    fn the_commands_are_registered() {
        let names = __msk_registry().command_names();
        for c in [
            "projects.board",
            "projects.move",
            "projects.add_task",
            "projects.attach",
            "projects.candidates",
            "projects.overview",
        ] {
            assert!(names.contains(&c), "{c}");
        }
    }
}

#[cfg(test)]
mod burndown_tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    const PID: &str = "99999999-9999-9999-9999-999999999999";
    const TASKS: &str = "com.mosaikit.tasks";

    #[test]
    fn days_and_dates_go_back_and_forth() {
        for d in ["1970-01-01", "2000-02-29", "2026-11-13", "2027-03-01", "1999-12-31"] {
            assert_eq!(date_of(day_number(d).unwrap()), d);
        }
        assert_eq!(day_number("1970-01-02"), Some(1));
        assert_eq!(day_number("2026-02-30"), None);
        assert_eq!(day_number("soon"), None);
        assert_eq!(
            day_number("2026-03-01").unwrap() - day_number("2026-02-28").unwrap(),
            1
        );
    }

    fn n(d: &str) -> i64 {
        day_number(d).unwrap()
    }

    #[test]
    fn the_burndown_counts_the_open_tasks_at_the_end_of_each_day() {
        // four tasks over five days; one done on the 2nd, two on the 4th; today is the 4th
        let days = burndown_days(n("2026-06-01"), n("2026-06-05"), n("2026-06-04"), 4, &[n("2026-06-02"), n("2026-06-04"), n("2026-06-04")], 0);
        let rem: Vec<Value> = days.iter().map(|d| d["remaining"].clone()).collect();
        assert_eq!(rem, [json!(4), json!(3), json!(3), json!(1), Value::Null]);
        let ideal: Vec<f64> = days.iter().map(|d| d["ideal"].as_f64().unwrap()).collect();
        assert_eq!(ideal, [4.0, 3.0, 2.0, 1.0, 0.0]);
        assert_eq!(days[0]["date"], "2026-06-01");
        assert_eq!(days[4]["date"], "2026-06-05");
    }

    #[test]
    fn finished_tasks_with_no_day_count_from_the_start_and_late_ones_stay_open() {
        let days = burndown_days(n("2026-06-01"), n("2026-06-03"), n("2026-06-03"), 3, &[n("2026-06-09"), n("2026-05-20")], 1);
        let rem: Vec<Value> = days.iter().map(|d| d["remaining"].clone()).collect();
        // one undated and one done before the start are finished at the start; the one done on the 9th is still open
        assert_eq!(rem, [json!(1), json!(1), json!(1)]);
        // a single day does not divide by zero
        let one = burndown_days(n("2026-06-01"), n("2026-06-01"), n("2026-06-01"), 2, &[], 0);
        assert_eq!(one.len(), 1);
        assert_eq!(one[0]["ideal"].as_f64(), Some(0.0));
    }

    fn row(starts: &str, ends: &str) -> Value {
        json!({ "name": "Release 2", "status": "active", "description": "", "starts_on": starts, "ends_on": ends,
                "columns": "[\"To do\",\"Doing\",\"Done\"]", "milestones": "[]",
                "sprints": "[{\"id\":\"s1\",\"name\":\"Sprint 1\",\"start\":\"2026-06-01\",\"end\":\"2026-06-04\"}]" })
    }

    fn host(starts: &'static str, ends: &'static str) -> MockHost {
        MockHost::new()
            .on("db.query", move |req| {
                let sql = req["sql"].as_str().unwrap_or_default();
                if sql.contains("from placements") {
                    Ok(json!([{ "task": "t1", "column_name": "Done", "sprint_id": "s1", "position": 0 },
                              { "task": "t2", "column_name": "Doing", "sprint_id": "s1", "position": 0 }]))
                } else if sql.contains("current_date") {
                    Ok(json!([{ "d": "2026-06-03" }]))
                } else {
                    Ok(json!([row(starts, ends)]))
                }
            })
            .with_plugin_command(TASKS, "tasks.for_project", |_| {
                Ok(json!([
                    { "id": "t1", "title": "a", "done": true, "completed_on": "2026-06-02" },
                    { "id": "t2", "title": "b", "done": false },
                    { "id": "t3", "title": "c", "done": true },
                ]))
            })
    }

    #[test]
    fn the_burndown_of_a_sprint_uses_its_dates_and_its_tasks() {
        let out = host("", "")
            .command(&__msk_registry(), "projects.burndown", json!({ "id": PID, "sprint": "s1" }))
            .unwrap();
        assert_eq!(out["available"], true);
        assert_eq!((out["from"].as_str(), out["to"].as_str()), (Some("2026-06-01"), Some("2026-06-04")));
        // t3 is in no sprint: two tasks, one done
        assert_eq!((out["total"].as_i64(), out["done"].as_i64(), out["undated"].as_i64()), (Some(2), Some(1), Some(0)));
        let rem: Vec<Value> = out["days"].as_array().unwrap().iter().map(|d| d["remaining"].clone()).collect();
        assert_eq!(rem, [json!(2), json!(1), json!(1), Value::Null]);
    }

    #[test]
    fn the_burndown_of_the_project_counts_every_task_and_says_what_is_undated() {
        let out = host("2026-06-01", "2026-06-04")
            .command(&__msk_registry(), "projects.burndown", json!({ "id": PID }))
            .unwrap();
        assert_eq!((out["total"].as_i64(), out["done"].as_i64(), out["undated"].as_i64()), (Some(3), Some(2), Some(1)));
        // t3 has no day: finished from the start; t1 on the 2nd
        let rem: Vec<Value> = out["days"].as_array().unwrap().iter().map(|d| d["remaining"].clone()).collect();
        assert_eq!(rem, [json!(2), json!(1), json!(1), Value::Null]);
    }

    #[test]
    fn a_project_with_no_dates_has_no_burndown_and_an_unknown_sprint_is_an_error() {
        let out = host("", "")
            .command(&__msk_registry(), "projects.burndown", json!({ "id": PID }))
            .unwrap();
        assert_eq!(out, json!({ "available": false, "reason": "no_dates" }));
        assert!(host("", "")
            .command(&__msk_registry(), "projects.burndown", json!({ "id": PID, "sprint": "nope" }))
            .is_err());
        assert!(host("2024-01-01", "2026-06-04")
            .command(&__msk_registry(), "projects.burndown", json!({ "id": PID }))
            .unwrap_err()
            .contains("at most"));
    }
}

#[cfg(test)]
mod widget_tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn row(id: &str, name: &str, milestones: &str) -> Value {
        json!({ "id": id, "name": name, "milestones": milestones })
    }

    #[test]
    fn the_widget_shows_the_next_open_milestone_and_marks_a_past_one() {
        let rows = vec![
            row("a", "Zeta", r#"[{"id":"m","name":"Beta","date":"2026-12-01","done":false}]"#),
            row("b", "Alpha", r#"[{"id":"m","name":"Old","date":"2026-01-01","done":false},{"id":"n","name":"Done","date":"2025-01-01","done":true}]"#),
            row("c", "Nomilestone", "[]"),
            row("d", "Bravo", r#"[{"id":"m","name":"Only done","date":"2026-02-02","done":true}]"#),
        ];
        let items = active_items(&rows, "2026-11-13");
        let titles: Vec<&str> = items.iter().map(|i| i["title"].as_str().unwrap()).collect();
        // by next date, then the ones with no open milestone by name
        assert_eq!(titles, ["Alpha", "Zeta", "Bravo", "Nomilestone"]);
        assert_eq!(items[0]["meta"], "Old · 2026-01-01");
        assert_eq!(items[0]["tone"], "err");
        assert_eq!(items[1]["tone"], "");
        assert_eq!(items[2]["meta"], "");
    }

    #[test]
    fn the_widget_command_lists_six_and_counts_the_rest() {
        let host = MockHost::new().on("db.query", |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            if sql.contains("current_date") {
                Ok(json!([{ "d": "2026-11-13" }]))
            } else {
                Ok(Value::Array((0..8).map(|i| row(&format!("id{i}"), &format!("P{i}"), "[]")).collect()))
            }
        });
        let out = host
            .command(&__msk_registry(), "projects.widget_active", json!({}))
            .unwrap();
        assert_eq!(out["items"].as_array().unwrap().len(), 6);
        assert_eq!(out["more"], 2);
    }
}
