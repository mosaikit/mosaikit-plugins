//! Calendar plugin: the agenda of the team. An event is a resource with a start and an end (dates, and times written as
//! the person typed them: floating local times, no time zone), a recurrence and invited people. The rules of an event are a
//! hook. The invitees answer with the command `events.rsvp` (the table `rsvps` is one a reader writes, see `[[tables]]`
//! in the manifest: the row is the person's own). `events.range` expands the recurrence into occurrences inside a date
//! range with `occurrences` (pure: no database, no clock) and adds the due dates of Tasks, read through
//! `ctx.call_plugin`: a failing call never fails the calendar.

use mosaikit_plugin_sdk::prelude::*;
use mosaikit_plugin_sdk::serde_json;

const REPEATS: [&str; 5] = ["none", "daily", "weekly", "monthly", "yearly"];
const COLORS: [&str; 6] = ["blue", "green", "red", "orange", "purple", "grey"];
const ANSWERS: [&str; 3] = ["yes", "no", "maybe"];
/// Limits, in characters (and people).
const MAX_TITLE: usize = 160;
const MAX_DETAILS: usize = 4000;
const MAX_LOCATION: usize = 200;
const MAX_NAME: usize = 120;
const MAX_ATTENDEES: usize = 50;
/// Occurrences of one event inside a range, and of all the events of one answer.
const MAX_PER_EVENT: usize = 500;
const MAX_OCCURRENCES: usize = 1000;
/// Widest range `events.range` accepts, in days.
const MAX_RANGE_DAYS: i64 = 400;
const MAX_INVITATIONS: usize = 50;
const WIDGET_ITEMS: usize = 8;

// ------------------------------------------------------------------------------------------------------------- dates

fn days_in_month(y: i32, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        _ => 28,
    }
}

/// A date `YYYY-MM-DD` as (year, month, day); `None` if it is not a real date.
fn parse_date(s: &str) -> Option<(i32, u32, u32)> {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let y: i32 = s.get(0..4)?.parse().ok()?;
    let m: u32 = s.get(5..7)?.parse().ok()?;
    let d: u32 = s.get(8..10)?.parse().ok()?;
    if !(1..=12).contains(&m) || d == 0 || d > days_in_month(y, m) {
        return None;
    }
    Some((y, m, d))
}

fn fmt_date((y, m, d): (i32, u32, u32)) -> String {
    format!("{y:04}-{m:02}-{d:02}")
}

/// Days since 1970-01-01 of a civil date (proleptic Gregorian).
fn days_from_civil((y, m, d): (i32, u32, u32)) -> i64 {
    let y = i64::from(y) - i64::from(m <= 2);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (i64::from(m) + 9) % 12;
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + i64::from(m <= 2);
    (y as i32, m, d)
}

fn day_number(s: &str) -> Option<i64> {
    parse_date(s).map(days_from_civil)
}

/// A time `HH:MM` (00:00 to 23:59) as minutes after midnight.
fn parse_time(s: &str) -> Option<u32> {
    let b = s.as_bytes();
    if b.len() != 5 || b[2] != b':' {
        return None;
    }
    let h: u32 = s.get(0..2)?.parse().ok()?;
    let m: u32 = s.get(3..5)?.parse().ok()?;
    (h < 24 && m < 60).then_some(h * 60 + m)
}

/// The occurrence number `k` of a monthly or yearly series that starts on `(y, m, d)`: the same day of the month (the
/// last day of a shorter month) or the same day of the year (29 February becomes 28 February in a common year).
fn nth_start((y, m, d): (i32, u32, u32), repeat: &str, k: i64) -> (i32, u32, u32) {
    let (ny, nm) = if repeat == "yearly" {
        (i64::from(y) + k, m)
    } else {
        let total = i64::from(y) * 12 + i64::from(m) - 1 + k;
        (total.div_euclid(12), (total.rem_euclid(12) + 1) as u32)
    };
    let ny = ny as i32;
    (ny, nm, d.min(days_in_month(ny, nm)))
}

/// The occurrences of an event that touch the range `from..=to`, each as `(first day, last day)`, at most `max`.
/// An event that lasts several days (`end` after `start`) keeps its length in every occurrence. `repeat` is `none`,
/// `daily`, `weekly` (same weekday), `monthly` or `yearly`; `until` (empty for no limit) is the last day an occurrence
/// may start. A bad date gives nothing.
fn occurrences(
    start: &str,
    end: &str,
    repeat: &str,
    until: &str,
    from: &str,
    to: &str,
    max: usize,
) -> Vec<(String, String)> {
    let (Some(s), Some(f), Some(t)) = (parse_date(start), day_number(from), day_number(to)) else {
        return Vec::new();
    };
    let sn = days_from_civil(s);
    let en = day_number(end).unwrap_or(sn).max(sn);
    let dur = en - sn;
    let last_start = match day_number(until) {
        Some(u) if repeat != "none" => t.min(u),
        _ => t,
    };
    let mut out = Vec::new();
    let push = |st: i64, out: &mut Vec<(String, String)>| {
        out.push((
            fmt_date(civil_from_days(st)),
            fmt_date(civil_from_days(st + dur)),
        ));
    };
    if t < f || max == 0 {
        return out;
    }
    match repeat {
        "daily" | "weekly" => {
            let step = if repeat == "daily" { 1 } else { 7 };
            // first occurrence that can still reach `from`
            let k0 = if f - dur > sn {
                (f - dur - sn + step - 1) / step
            } else {
                0
            };
            let mut k = k0;
            loop {
                let st = sn + k * step;
                if st > last_start || out.len() >= max {
                    break;
                }
                push(st, &mut out);
                k += 1;
            }
        }
        "monthly" | "yearly" => {
            let (fy, fm, _) = civil_from_days(f);
            let k0 = if repeat == "yearly" {
                i64::from(fy) - i64::from(s.0) - dur / 365 - 2
            } else {
                (i64::from(fy) * 12 + i64::from(fm) - (i64::from(s.0) * 12 + i64::from(s.1)))
                    - dur / 28
                    - 2
            }
            .max(0);
            let mut k = k0;
            loop {
                let st = days_from_civil(nth_start(s, repeat, k));
                if st > last_start || out.len() >= max {
                    break;
                }
                if st + dur >= f {
                    push(st, &mut out);
                }
                k += 1;
            }
        }
        _ => {
            if sn <= last_start && en >= f {
                push(sn, &mut out);
            }
        }
    }
    out
}

// ------------------------------------------------------------------------------------------------------------ people

#[derive(Debug, Clone, PartialEq)]
struct Person {
    id: String,
    name: String,
}

fn uuid_like(s: &str) -> bool {
    s.len() == 36
        && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
        && s.matches('-').count() == 4
}

/// Reads the JSON of the field `attendees`: up to 50 people with an id and a name, no id twice. An empty text is nobody.
fn parse_attendees(raw: &str) -> std::result::Result<Vec<Person>, Error> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Ok(Vec::new());
    }
    let bad = |m: &str| Error::coded("attendees_invalid", m.to_string());
    let list: Vec<Value> =
        serde_json::from_str(raw).map_err(|_| bad("the invitees are not a valid list"))?;
    if list.len() > MAX_ATTENDEES {
        return Err(Error::coded(
            "attendees_many",
            format!("an event has at most {MAX_ATTENDEES} invitees"),
        ));
    }
    let mut out: Vec<Person> = Vec::new();
    for p in &list {
        let id = text(p, "id").trim().to_lowercase();
        let name: String = text(p, "name").trim().chars().take(MAX_NAME).collect();
        if !uuid_like(&id) || name.is_empty() {
            return Err(bad("each invitee needs an id and a name"));
        }
        if out.iter().any(|a| a.id == id) {
            return Err(Error::coded(
                "attendees_twice",
                "an invitee is listed twice",
            ));
        }
        out.push(Person { id, name });
    }
    Ok(out)
}

fn attendees_json(list: &[Person]) -> String {
    Value::Array(
        list.iter()
            .map(|a| json!({ "id": a.id, "name": a.name }))
            .collect(),
    )
    .to_string()
}

// ------------------------------------------------------------------------------------------------------------- hook

fn event(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let title: String = v.str("title").trim().chars().take(MAX_TITLE).collect();
    if title.is_empty() {
        return Err(Error::coded("event_title_empty", "an event needs a title"));
    }
    v.set("title", title);
    if v.str("details").chars().count() > MAX_DETAILS {
        return Err(Error::coded(
            "event_too_long",
            format!("the details of an event have at most {MAX_DETAILS} characters"),
        ));
    }
    let location = v.str("location").trim().to_string();
    if location.chars().count() > MAX_LOCATION {
        return Err(Error::coded(
            "event_location",
            format!("the location has at most {MAX_LOCATION} characters"),
        ));
    }
    v.set("location", location);

    let start = v.str("starts_on").trim().to_string();
    let Some(sd) = parse_date(&start) else {
        return Err(Error::coded(
            "event_date",
            "the start date is required, as YYYY-MM-DD",
        ));
    };
    let end_raw = v.str("ends_on").trim().to_string();
    let end = if end_raw.is_empty() {
        start.clone()
    } else {
        end_raw
    };
    let Some(ed) = parse_date(&end) else {
        return Err(Error::coded(
            "event_date",
            "the end date is not a date, use YYYY-MM-DD",
        ));
    };
    if ed < sd {
        return Err(Error::coded(
            "event_end_before_start",
            "the event cannot end before it starts",
        ));
    }
    v.set("starts_on", start.clone());
    v.set("ends_on", end);

    if v.bool("all_day") {
        v.set("all_day", true);
        v.set("starts_time", "");
        v.set("ends_time", "");
    } else {
        v.set("all_day", false);
        let (st, et) = (
            v.str("starts_time").trim().to_string(),
            v.str("ends_time").trim().to_string(),
        );
        let bad_time =
            || Error::coded("event_time", "a time is written HH:MM, from 00:00 to 23:59");
        let smin = if st.is_empty() {
            None
        } else {
            Some(parse_time(&st).ok_or_else(bad_time)?)
        };
        let emin = if et.is_empty() {
            None
        } else {
            Some(parse_time(&et).ok_or_else(bad_time)?)
        };
        if emin.is_some() && smin.is_none() {
            return Err(Error::coded("event_time", "an end time needs a start time"));
        }
        if let (Some(s), Some(e)) = (smin, emin) {
            if ed == sd && e < s {
                return Err(Error::coded(
                    "event_end_before_start",
                    "the event cannot end before it starts",
                ));
            }
        }
        v.set("starts_time", st);
        v.set("ends_time", et);
    }

    let repeat = v.str("repeat");
    let repeat = if repeat.is_empty() {
        "none".to_string()
    } else {
        repeat
    };
    if !REPEATS.contains(&repeat.as_str()) {
        return Err(Error::coded(
            "event_repeat",
            "the repeat is none, daily, weekly, monthly or yearly",
        ));
    }
    let until = v.str("repeat_until").trim().to_string();
    if repeat == "none" || until.is_empty() {
        v.set("repeat_until", Value::Null);
    } else {
        let Some(ud) = parse_date(&until) else {
            return Err(Error::coded(
                "event_until",
                "the last day of the repeat is not a date, use YYYY-MM-DD",
            ));
        };
        if ud < sd {
            return Err(Error::coded(
                "event_until",
                "the repeat cannot stop before the event starts",
            ));
        }
        v.set("repeat_until", until);
    }
    v.set("repeat", repeat);

    let color = v.str("color");
    if color.is_empty() {
        v.set("color", "blue");
    } else if !COLORS.contains(&color.as_str()) {
        return Err(Error::coded(
            "event_color",
            "the color is blue, green, red, orange, purple or grey",
        ));
    }
    let people = parse_attendees(&v.str("attendees"))?;
    v.set("attendees", attendees_json(&people));
    let zone = v.str("timezone").trim().to_string();
    if !zone.is_empty() && !zone_like(&zone) {
        return Err(Error::coded(
            "event_timezone",
            "the time zone is a name such as Europe/Rome, or empty for local times",
        ));
    }
    // an all-day event has no time of the day to convert
    v.set(
        "timezone",
        if v.bool("all_day") {
            String::new()
        } else {
            zone
        },
    );
    Ok(Some(v))
}

/// Whether `s` looks like the name of an IANA time zone (`UTC`, `Europe/Rome`, `America/Argentina/Buenos_Aires`).
fn zone_like(s: &str) -> bool {
    s.len() <= 64
        && s.split('/').count() <= 3
        && s.split('/').all(|p| {
            !p.is_empty()
                && p.chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '+' | '-'))
        })
        && s.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
}

// ---------------------------------------------------------------------------------------------------------- commands

fn text(r: &Value, k: &str) -> String {
    r.get(k)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn flag(r: &Value, k: &str) -> bool {
    match r.get(k) {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64() == Some(1),
        Some(Value::String(s)) => matches!(s.as_str(), "true" | "t" | "1"),
        _ => false,
    }
}

fn id_arg(args: &Value) -> Result<String> {
    let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
    if !uuid_like(id) {
        return Err(Error::coded("event_missing", "which event?"));
    }
    Ok(id.to_string())
}

fn date_arg(args: &Value, key: &str) -> Result<String> {
    let s = args
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim();
    if parse_date(s).is_none() {
        return Err(Error::coded(
            "event_date",
            format!("{key} is required, as YYYY-MM-DD"),
        ));
    }
    Ok(s.to_string())
}

const EVENT_COLUMNS: &str = "resource_id::text as id, title, location, starts_on::text as starts_on, starts_time, ends_on::text as ends_on, ends_time, all_day, repeat, repeat_until::text as repeat_until, attendees, color, timezone";

/// The date of today, from the database (the guest has no clock).
fn today(ctx: &Ctx) -> Result<String> {
    let row = ctx.db().query_one("select current_date::text as d", &[])?;
    Ok(row.map(|r| text(&r, "d")).unwrap_or_default())
}

fn add_days(date: &str, n: i64) -> String {
    day_number(date)
        .map(|d| fmt_date(civil_from_days(d + n)))
        .unwrap_or_default()
}

/// The occurrences of an event row inside a range.
fn row_occurrences(r: &Value, from: &str, to: &str, max: usize) -> Vec<(String, String)> {
    let start = text(r, "starts_on");
    let end = text(r, "ends_on");
    let repeat = text(r, "repeat");
    occurrences(
        &start,
        if end.is_empty() { &start } else { &end },
        if repeat.is_empty() { "none" } else { &repeat },
        &text(r, "repeat_until"),
        from,
        to,
        max,
    )
}

/// Who answered what: `(yes, no, maybe, mine)` for one event from the rows of `rsvps` (`id`, `user_id`, `answer`).
fn count_answers(rs: &[Value], id: &str, user: &str) -> (i64, i64, i64, String) {
    let (mut yes, mut no, mut maybe, mut mine) = (0, 0, 0, String::new());
    for r in rs.iter().filter(|r| text(r, "id") == id) {
        match text(r, "answer").as_str() {
            "yes" => yes += 1,
            "no" => no += 1,
            "maybe" => maybe += 1,
            _ => {}
        }
        if text(r, "user_id") == user {
            mine = text(r, "answer");
        }
    }
    (yes, no, maybe, mine)
}

fn invited(r: &Value, user: &str) -> bool {
    !user.is_empty()
        && parse_attendees(&text(r, "attendees"))
            .unwrap_or_default()
            .iter()
            .any(|a| a.id == user)
}

const RSVPS_SQL: &str =
    "select resource_id::text as id, user_id::text as user_id, answer from rsvps";

/// What an exception changes in one occurrence of a series (`skipped` removes it).
const EXCEPTIONS_SQL: &str = "select resource_id::text as id, on_date::text as on_date, skipped, title, location, starts_time, ends_time from exceptions";

/// Applies the exception row `e` to the JSON of an occurrence: a changed title, place or time.
fn apply_exception(occ: &mut Value, e: &Value) {
    for k in ["title", "location", "starts_time", "ends_time"] {
        // null leaves the value of the series, an empty text clears it (a title never empties)
        if let Some(t) = e.get(k).and_then(Value::as_str) {
            if k != "title" || !t.is_empty() {
                occ[k] = json!(t);
            }
        }
    }
    occ["exception"] = json!(true);
}

fn exception_for<'a>(excs: &'a [Value], id: &str, on: &str) -> Option<&'a Value> {
    excs.iter()
        .find(|e| text(e, "id") == id && text(e, "on_date") == on)
}

/// A time of an exception: absent (unchanged), empty (cleared) or `HH:MM`.
fn opt_time(args: &Value, key: &str) -> Result<Option<String>> {
    match args.get(key).and_then(Value::as_str) {
        None => Ok(None),
        Some(t) => {
            let t = t.trim();
            if !t.is_empty() && parse_time(t).is_none() {
                return Err(Error::coded(
                    "event_time",
                    "a time is written HH:MM, from 00:00 to 23:59",
                ));
            }
            Ok(Some(t.to_string()))
        }
    }
}

/// The event `id` and the first day `on` of one of its occurrences; the caller must be able to write the event, which
/// must repeat, and `on` must be the first day of an occurrence. Gives the event row.
fn occurrence_target(ctx: &Ctx, args: &Value) -> Result<(String, String, Value)> {
    let id = id_arg(args)?;
    let on = date_arg(args, "on")?;
    let row = ctx.db().query_one(
        &format!("select {EVENT_COLUMNS}, core.level_of(resource_id)::int as lvl from events where resource_id = $1::uuid"),
        &[json!(id)],
    )?;
    let Some(r) = row else {
        return Err(Error::coded("event_missing", "the event does not exist"));
    };
    if r.get("lvl").and_then(Value::as_i64).unwrap_or(0) < 2 {
        return Err(Error::coded(
            "permission_denied",
            "only a person who can edit the event changes one of its occurrences",
        ));
    }
    let repeat = text(&r, "repeat");
    if repeat.is_empty() || repeat == "none" {
        return Err(Error::coded(
            "not_recurring",
            "only an event that repeats has occurrences of its own",
        ));
    }
    if !row_occurrences(&r, &on, &on, 1)
        .iter()
        .any(|(s, _)| *s == on)
    {
        return Err(Error::coded(
            "occurrence_missing",
            "the event has no occurrence starting on that day",
        ));
    }
    Ok((id, on, r))
}

/// Writes the exception of one occurrence: changes the row of that day or adds it.
fn put_exception(ctx: &Ctx, id: &str, on: &str, skipped: bool, f: [Option<&str>; 4]) -> Result<()> {
    let tenant = ctx.tenant.clone().unwrap_or_default();
    let cols: Vec<Value> = f
        .iter()
        .map(|x| x.map_or(Value::Null, |t| json!(t)))
        .collect();
    let mut p = vec![json!(skipped)];
    p.extend(cols.iter().cloned());
    p.extend([json!(id), json!(on)]);
    let n = ctx.db().exec(
        "update exceptions set skipped = $1, title = $2, location = $3, starts_time = $4, ends_time = $5 where resource_id = $6::uuid and on_date = $7::date",
        &p,
    )?;
    if n == 0 {
        let mut p = vec![json!(id), json!(tenant), json!(on), json!(skipped)];
        p.extend(cols);
        ctx.db().exec(
            "insert into exceptions (resource_id, tenant_id, on_date, skipped, title, location, starts_time, ends_time) values ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8)",
            &p,
        )?;
    }
    Ok(())
}

/// The caller removes one occurrence of a series (the others stay).
fn skip(ctx: &Ctx, args: Value) -> Result<Value> {
    let (id, on, _) = occurrence_target(ctx, &args)?;
    put_exception(ctx, &id, &on, true, [None; 4])?;
    Ok(json!({ "skipped": on }))
}

/// The caller changes the title, place or times of one occurrence of a series.
fn override_one(ctx: &Ctx, args: Value) -> Result<Value> {
    let (id, on, r) = occurrence_target(ctx, &args)?;
    let title = match args.get("title").and_then(Value::as_str) {
        None => None,
        Some(t) => {
            let t: String = t.trim().chars().take(MAX_TITLE).collect();
            if t.is_empty() {
                return Err(Error::coded("event_title_empty", "an event needs a title"));
            }
            Some(t)
        }
    };
    let location = args
        .get("location")
        .and_then(Value::as_str)
        .map(|l| l.trim().to_string());
    if location
        .as_ref()
        .is_some_and(|l| l.chars().count() > MAX_LOCATION)
    {
        return Err(Error::coded(
            "event_location",
            format!("the location has at most {MAX_LOCATION} characters"),
        ));
    }
    let (st, et) = (
        opt_time(&args, "starts_time")?,
        opt_time(&args, "ends_time")?,
    );
    if flag(&r, "all_day") && (st.is_some() || et.is_some()) {
        return Err(Error::coded(
            "event_time",
            "an all-day event has no times to change",
        ));
    }
    let one_day = text(&r, "ends_on").is_empty() || text(&r, "starts_on") == text(&r, "ends_on");
    let start_now = st.clone().unwrap_or_else(|| text(&r, "starts_time"));
    let end_now = et.clone().unwrap_or_else(|| text(&r, "ends_time"));
    if !end_now.is_empty() && start_now.is_empty() {
        return Err(Error::coded("event_time", "an end time needs a start time"));
    }
    if one_day && !start_now.is_empty() && !end_now.is_empty() && end_now < start_now {
        return Err(Error::coded(
            "event_end_before_start",
            "the event cannot end before it starts",
        ));
    }
    put_exception(
        ctx,
        &id,
        &on,
        false,
        [
            title.as_deref(),
            location.as_deref(),
            st.as_deref(),
            et.as_deref(),
        ],
    )?;
    Ok(json!({ "changed": on }))
}

/// The caller brings an occurrence back to what the series says (removes its exception).
fn restore(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = id_arg(&args)?;
    let on = date_arg(&args, "on")?;
    let level = ctx
        .db()
        .query_one(
            "select core.level_of(resource_id)::int as lvl from events where resource_id = $1::uuid",
            &[json!(id)],
        )?
        .and_then(|r| r.get("lvl").and_then(Value::as_i64))
        .unwrap_or(0);
    if level < 2 {
        return Err(Error::coded(
            "permission_denied",
            "only a person who can edit the event changes one of its occurrences",
        ));
    }
    ctx.db().exec(
        "delete from exceptions where resource_id = $1::uuid and on_date = $2::date",
        &[json!(id), json!(on)],
    )?;
    Ok(json!({ "restored": on }))
}

/// What the .ics file needs besides the events: for each event the exceptions of its series and who is invited with
/// the answer (PARTSTAT). `ids` are the events (at most 500).
fn ics_data(ctx: &Ctx, args: Value) -> Result<Value> {
    let ids: Vec<String> = args
        .get("ids")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .filter(|i| uuid_like(i))
                .take(MAX_PER_EVENT)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let mut out = serde_json::Map::new();
    if ids.is_empty() {
        return Ok(Value::Object(out));
    }
    let events = ctx.db().query(
        &format!("select {EVENT_COLUMNS} from events limit 2000"),
        &[],
    )?;
    let excs = ctx.db().query(
        &format!("{EXCEPTIONS_SQL} order by on_date limit 5000"),
        &[],
    )?;
    let rs = ctx.db().query(
        "select resource_id::text as id, user_id::text as user_id, answer from rsvps",
        &[],
    )?;
    for r in events.iter().filter(|r| ids.contains(&text(r, "id"))) {
        let id = text(r, "id");
        let people: Vec<Value> = parse_attendees(&text(r, "attendees"))
            .unwrap_or_default()
            .iter()
            .map(|p| {
                let answer = rs
                    .iter()
                    .find(|a| text(a, "id") == id && text(a, "user_id") == p.id)
                    .map(|a| text(a, "answer"))
                    .unwrap_or_default();
                json!({ "id": p.id, "name": p.name, "answer": answer })
            })
            .collect();
        let list: Vec<Value> = excs
            .iter()
            .filter(|e| text(e, "id") == id)
            .map(|e| {
                json!({
                    "on": text(e, "on_date"),
                    "skipped": flag(e, "skipped"),
                    "title": e.get("title").and_then(Value::as_str),
                    "location": e.get("location").and_then(Value::as_str),
                    "starts_time": e.get("starts_time").and_then(Value::as_str),
                    "ends_time": e.get("ends_time").and_then(Value::as_str),
                })
            })
            .collect();
        out.insert(id, json!({ "attendees": people, "exceptions": list }));
    }
    Ok(Value::Object(out))
}

/// The events the caller sees, expanded into occurrences inside `from..=to`, and the due dates of Tasks.
fn range(ctx: &Ctx, args: Value) -> Result<Value> {
    let (from, to) = (date_arg(&args, "from")?, date_arg(&args, "to")?);
    let (f, t) = (day_number(&from).unwrap_or(0), day_number(&to).unwrap_or(0));
    if t < f {
        return Err(Error::coded("event_date", "to cannot be before from"));
    }
    if t - f > MAX_RANGE_DAYS {
        return Err(Error::coded(
            "range_too_wide",
            format!("a range has at most {MAX_RANGE_DAYS} days"),
        ));
    }
    let user = ctx.user.clone().unwrap_or_default();
    let rows = ctx.db().query(
        &format!("select {EVENT_COLUMNS} from events where starts_on <= $1::date order by starts_on limit 2000"),
        &[json!(to)],
    )?;
    let rs = ctx.db().query(RSVPS_SQL, &[])?;
    let excs = ctx.db().query(
        &format!("{EXCEPTIONS_SQL} where on_date <= $1::date limit 5000"),
        &[json!(to)],
    )?;
    let mut out: Vec<Value> = Vec::new();
    'rows: for r in &rows {
        let id = text(r, "id");
        let (yes, no, maybe, mine) = count_answers(&rs, &id, &user);
        let people = parse_attendees(&text(r, "attendees")).unwrap_or_default();
        for (s, e) in row_occurrences(r, &from, &to, MAX_PER_EVENT) {
            if out.len() >= MAX_OCCURRENCES {
                break 'rows;
            }
            let exc = exception_for(&excs, &id, &s);
            if exc.is_some_and(|x| flag(x, "skipped")) {
                continue;
            }
            let mut occ = json!({
                "id": id,
                "title": text(r, "title"),
                "location": text(r, "location"),
                "start": s,
                "end": e,
                "starts_time": text(r, "starts_time"),
                "ends_time": text(r, "ends_time"),
                "all_day": flag(r, "all_day"),
                "repeat": text(r, "repeat"),
                "color": text(r, "color"),
                "invitees": people.len(),
                "invited": invited(r, &user),
                "yes": yes, "no": no, "maybe": maybe, "mine": mine,
                "timezone": text(r, "timezone"),
                "orig": s,
                "exception": false,
            });
            if let Some(x) = exc {
                apply_exception(&mut occ, x);
            }
            out.push(occ);
        }
    }
    let (tasks, tasks_error) = if args.get("tasks").and_then(Value::as_bool) == Some(false) {
        (Value::Array(Vec::new()), Value::Null)
    } else {
        match ctx.call_plugin(
            "com.mosaikit.tasks",
            "tasks.due_between",
            json!({ "from": from, "to": to }),
        ) {
            Ok(Value::Array(a)) => (Value::Array(a), Value::Null),
            Ok(_) => (Value::Array(Vec::new()), Value::Null),
            Err(e) => (
                Value::Array(Vec::new()),
                Value::String(e.message.chars().take(160).collect()),
            ),
        }
    };
    Ok(json!({ "events": out, "tasks": tasks, "tasks_error": tasks_error }))
}

/// The caller answers an invitation (or changes the answer): `yes`, `no` or `maybe`.
fn rsvp(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = id_arg(&args)?;
    let answer = args
        .get("answer")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !ANSWERS.contains(&answer) {
        return Err(Error::coded("answer_invalid", "answer yes, no or maybe"));
    }
    let user = ctx
        .user
        .clone()
        .ok_or_else(|| Error::coded("not_signed_in", "sign in to answer an invitation"))?;
    let row = ctx.db().query_one(
        "select attendees, core.level_of(resource_id)::int as lvl from events where resource_id = $1::uuid",
        &[json!(id)],
    )?;
    let Some(r) = row else {
        return Err(Error::coded("event_missing", "the event does not exist"));
    };
    let people = parse_attendees(&text(&r, "attendees")).unwrap_or_default();
    let level = r.get("lvl").and_then(Value::as_i64).unwrap_or(0);
    let me = people.iter().find(|p| p.id == user);
    if me.is_none() && level < 2 {
        return Err(Error::coded(
            "not_invited",
            "you are not invited to this event",
        ));
    }
    let name = me
        .map(|p| p.name.clone())
        .unwrap_or_else(|| ctx.username.clone().unwrap_or_else(|| user.clone()));
    let tenant = ctx.tenant.clone().unwrap_or_default();
    // the row is accepted only as the caller's own (policies of the table)
    let n = ctx.db().exec(
        "update rsvps set answer = $1, user_name = $2, answered_at = now() where resource_id = $3::uuid and user_id = $4::uuid",
        &[json!(answer), json!(name), json!(id), json!(user)],
    )?;
    if n == 0 {
        ctx.db().exec(
            "insert into rsvps (resource_id, tenant_id, user_id, user_name, answer) values ($1::uuid, $2::uuid, $3::uuid, $4, $5) on conflict (resource_id, user_id) do nothing",
            &[json!(id), json!(tenant), json!(user), json!(name), json!(answer)],
        )?;
    }
    Ok(json!({ "answer": answer }))
}

/// Who answered what on one event, and who was invited.
fn rsvps(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = id_arg(&args)?;
    let row = ctx.db().query_one(
        "select attendees from events where resource_id = $1::uuid",
        &[json!(id)],
    )?;
    let Some(r) = row else {
        return Err(Error::coded("event_missing", "the event does not exist"));
    };
    let people = parse_attendees(&text(&r, "attendees")).unwrap_or_default();
    let answers = ctx.db().query(
        "select user_id::text as user_id, user_name, answer, answered_at::text as at from rsvps where resource_id = $1::uuid order by answered_at",
        &[json!(id)],
    )?;
    let list: Vec<Value> = answers
        .iter()
        .map(|a| json!({ "user_id": text(a, "user_id"), "name": text(a, "user_name"), "answer": text(a, "answer"), "at": text(a, "at") }))
        .collect();
    let attendees: Vec<Value> = people
        .iter()
        .map(|p| json!({ "id": p.id, "name": p.name }))
        .collect();
    Ok(json!({ "attendees": attendees, "answers": list }))
}

/// The events from today on where the caller is invited and has not answered: the next occurrence of each, soonest first.
fn invitations(ctx: &Ctx, _args: Value) -> Result<Value> {
    let user = ctx.user.clone().unwrap_or_default();
    if user.is_empty() {
        return Ok(json!({ "invitations": [] }));
    }
    let t = today(ctx)?;
    let horizon = add_days(&t, 365);
    let rows = ctx.db().query(
        &format!("select {EVENT_COLUMNS} from events order by starts_on limit 2000"),
        &[],
    )?;
    let mine = ctx.db().query(
        "select resource_id::text as id from rsvps where user_id = $1::uuid",
        &[json!(user)],
    )?;
    let mut out: Vec<(String, String, Value)> = Vec::new();
    for r in rows.iter().filter(|r| invited(r, &user)) {
        let id = text(r, "id");
        if mine.iter().any(|m| text(m, "id") == id) {
            continue;
        }
        let Some((s, e)) = row_occurrences(r, &t, &horizon, 1).into_iter().next() else {
            continue;
        };
        let time = text(r, "starts_time");
        out.push((
            s.clone(),
            time.clone(),
            json!({
                "id": id, "title": text(r, "title"), "location": text(r, "location"), "start": s, "end": e,
                "starts_time": time, "ends_time": text(r, "ends_time"), "all_day": flag(r, "all_day"),
                "color": text(r, "color"), "timezone": text(r, "timezone"),
            }),
        ));
    }
    out.sort_by(|a, b| (&a.0, &a.1).cmp(&(&b.0, &b.1)));
    let list: Vec<Value> = out.into_iter().take(MAX_INVITATIONS).map(|x| x.2).collect();
    Ok(json!({ "invitations": list }))
}

/// Widget `today`: the occurrences of today and tomorrow, with the time (the date for tomorrow).
fn widget_today(ctx: &Ctx, _args: Value) -> Result<Value> {
    let t = today(ctx)?;
    let tomorrow = add_days(&t, 1);
    let rows = ctx.db().query(
        &format!("select {EVENT_COLUMNS} from events where starts_on <= $1::date order by starts_on limit 2000"),
        &[json!(tomorrow)],
    )?;
    let mut items: Vec<(String, String, String, String)> = Vec::new();
    let excs = ctx.db().query(
        &format!("{EXCEPTIONS_SQL} where on_date <= $1::date limit 5000"),
        &[json!(tomorrow)],
    )?;
    for r in &rows {
        for (s, e) in row_occurrences(r, &t, &tomorrow, MAX_PER_EVENT) {
            let exc = exception_for(&excs, &text(r, "id"), &s);
            if exc.is_some_and(|x| flag(x, "skipped")) {
                continue;
            }
            // a multi-day event shows on the days it covers: today and tomorrow, whichever it touches
            for day in [&t, &tomorrow] {
                if s.as_str() <= day.as_str() && e.as_str() >= day.as_str() {
                    let time = if flag(r, "all_day") || s.as_str() != day.as_str() {
                        String::new()
                    } else {
                        text(r, "starts_time")
                    };
                    let meta = if *day == t {
                        time.clone()
                    } else {
                        format!("{day} {time}").trim().to_string()
                    };
                    let title = exc
                        .and_then(|x| x.get("title").and_then(Value::as_str))
                        .filter(|t| !t.is_empty())
                        .map_or_else(|| text(r, "title"), str::to_string);
                    items.push((day.clone(), time, title, meta));
                }
            }
        }
    }
    items.sort();
    let more = items.len().saturating_sub(WIDGET_ITEMS);
    let list: Vec<Value> = items
        .into_iter()
        .take(WIDGET_ITEMS)
        .enumerate()
        .map(|(i, (_, _, title, meta))| json!({ "id": format!("{i}"), "title": title, "meta": meta, "tone": "" }))
        .collect();
    Ok(json!({ "items": list, "more": more }))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "events.before_create" => event,
        "events.before_update" => event,
    },
    commands: {
        "events.range" => range,
        "events.rsvp" => rsvp,
        "events.skip" => skip,
        "events.override" => override_one,
        "events.restore" => restore,
        "events.ics_data" => ics_data,
        "events.rsvps" => rsvps,
        "events.invitations" => invitations,
        "events.widget_today" => widget_today,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    const A: &str = "11111111-1111-1111-1111-111111111111";
    const B: &str = "22222222-2222-2222-2222-222222222222";
    const ME: &str = "00000000-0000-0000-0000-000000000001";
    const EV: &str = "99999999-9999-9999-9999-999999999999";

    fn people(ids: &[&str]) -> String {
        Value::Array(
            ids.iter()
                .map(|i| json!({ "id": i, "name": format!("P{}", &i[..1]) }))
                .collect(),
        )
        .to_string()
    }

    fn run(values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), "before_create", "events", values)
    }

    fn ok(extra: Value) -> Value {
        let mut v = json!({ "title": "Standup", "starts_on": "2026-11-12" });
        for (k, x) in extra.as_object().unwrap() {
            v[k] = x.clone();
        }
        v
    }

    fn occ(start: &str, end: &str, repeat: &str, until: &str, from: &str, to: &str) -> Vec<String> {
        occurrences(start, end, repeat, until, from, to, MAX_PER_EVENT)
            .into_iter()
            .map(|(s, e)| if s == e { s } else { format!("{s}..{e}") })
            .collect()
    }

    #[test]
    fn dates_round_trip_and_know_the_weekday() {
        assert_eq!(days_from_civil((1970, 1, 1)), 0);
        for d in [-800_000i64, -1, 0, 59, 11_016, 20_000, 800_000] {
            assert_eq!(days_from_civil(civil_from_days(d)), d);
        }
        assert_eq!(
            civil_from_days(days_from_civil((2028, 2, 29))),
            (2028, 2, 29)
        );
        assert!(parse_date("2026-02-29").is_none());
        assert!(parse_date("2028-02-29").is_some());
        assert!(parse_date("2026-1-5").is_none());
        assert_eq!(parse_time("23:59"), Some(1439));
        assert_eq!(parse_time("24:00"), None);
        assert_eq!(parse_time("9:30"), None);
    }

    #[test]
    fn an_event_gets_defaults_and_is_trimmed() {
        let v = run(ok(json!({ "title": "  Standup  " }))).unwrap().unwrap();
        assert_eq!(v.str("title"), "Standup");
        assert_eq!(v.str("repeat"), "none");
        assert_eq!(v.str("color"), "blue");
        assert_eq!(v.str("ends_on"), "2026-11-12");
        assert_eq!(v.str("attendees"), "[]");
        assert!(!v.bool("all_day"));
        assert!(run(ok(json!({ "title": " " })))
            .unwrap_err()
            .contains("title"));
    }

    #[test]
    fn the_texts_have_limits() {
        let long = run(ok(json!({ "title": "é".repeat(MAX_TITLE + 30) })))
            .unwrap()
            .unwrap();
        assert_eq!(long.str("title").chars().count(), MAX_TITLE);
        assert!(run(ok(json!({ "details": "é".repeat(MAX_DETAILS) }))).is_ok());
        assert!(run(ok(json!({ "details": "é".repeat(MAX_DETAILS + 1) })))
            .unwrap_err()
            .contains("at most"));
        assert!(run(ok(json!({ "location": "é".repeat(MAX_LOCATION + 1) })))
            .unwrap_err()
            .contains("location"));
    }

    #[test]
    fn dates_and_times_are_checked() {
        assert!(run(json!({ "title": "x" }))
            .unwrap_err()
            .contains("start date"));
        assert!(run(ok(json!({ "starts_on": "12/11/2026" }))).is_err());
        assert!(run(ok(json!({ "starts_on": "2026-02-30" }))).is_err());
        assert!(run(ok(json!({ "ends_on": "2026-11-11" })))
            .unwrap_err()
            .contains("end before"));
        assert!(run(ok(json!({ "ends_on": "2026-11-13" }))).is_ok());
        assert!(run(ok(json!({ "starts_time": "25:00" })))
            .unwrap_err()
            .contains("HH:MM"));
        assert!(run(ok(json!({ "starts_time": "9:30" }))).is_err());
        assert!(
            run(ok(json!({ "starts_time": "10:00", "ends_time": "09:00" })))
                .unwrap_err()
                .contains("end before")
        );
        // the same time is fine, and a later day makes an earlier clock time fine
        assert!(run(ok(json!({ "starts_time": "10:00", "ends_time": "10:00" }))).is_ok());
        assert!(run(ok(
            json!({ "starts_time": "22:00", "ends_time": "02:00", "ends_on": "2026-11-13" })
        ))
        .is_ok());
        assert!(run(ok(json!({ "ends_time": "10:00" })))
            .unwrap_err()
            .contains("start time"));
    }

    #[test]
    fn an_all_day_event_has_no_times() {
        let v = run(ok(
            json!({ "all_day": true, "starts_time": "10:00", "ends_time": "11:00" }),
        ))
        .unwrap()
        .unwrap();
        assert!(v.bool("all_day"));
        assert_eq!(v.str("starts_time"), "");
        assert_eq!(v.str("ends_time"), "");
    }

    #[test]
    fn the_repeat_and_its_end_are_checked() {
        assert!(run(ok(json!({ "repeat": "hourly" }))).is_err());
        let v = run(ok(
            json!({ "repeat": "weekly", "repeat_until": "2026-12-31" }),
        ))
        .unwrap()
        .unwrap();
        assert_eq!(v.str("repeat_until"), "2026-12-31");
        assert!(run(ok(
            json!({ "repeat": "weekly", "repeat_until": "2026-11-01" })
        ))
        .unwrap_err()
        .contains("stop"));
        assert!(run(ok(json!({ "repeat": "weekly", "repeat_until": "nope" }))).is_err());
        // an end with no repeat is dropped
        let v = run(ok(
            json!({ "repeat": "none", "repeat_until": "2026-12-31" }),
        ))
        .unwrap()
        .unwrap();
        assert!(v.get("repeat_until").is_none());
        assert!(run(ok(json!({ "color": "pink" }))).is_err());
        assert_eq!(
            run(ok(json!({ "color": "red" })))
                .unwrap()
                .unwrap()
                .str("color"),
            "red"
        );
    }

    #[test]
    fn the_invitees_are_a_valid_list() {
        let v = run(ok(json!({ "attendees": people(&[A, B]) })))
            .unwrap()
            .unwrap();
        assert_eq!(parse_attendees(&v.str("attendees")).unwrap().len(), 2);
        assert!(run(ok(json!({ "attendees": "nope" })))
            .unwrap_err()
            .contains("not a valid list"));
        assert!(run(ok(json!({ "attendees": people(&[A, A]) })))
            .unwrap_err()
            .contains("twice"));
        assert!(
            run(ok(json!({ "attendees": r#"[{"id":"abc","name":"X"}]"# })))
                .unwrap_err()
                .contains("id and a name")
        );
        let many: Vec<Value> = (0..51)
            .map(|i| json!({ "id": format!("{i:08}-1111-1111-1111-111111111111"), "name": "x" }))
            .collect();
        assert!(
            run(ok(json!({ "attendees": Value::Array(many).to_string() })))
                .unwrap_err()
                .contains("at most 50")
        );
    }

    #[test]
    fn a_single_event_and_a_multi_day_event() {
        assert_eq!(
            occ(
                "2026-11-12",
                "2026-11-12",
                "none",
                "",
                "2026-11-01",
                "2026-11-30"
            ),
            ["2026-11-12"]
        );
        assert!(occ(
            "2026-11-12",
            "2026-11-12",
            "none",
            "",
            "2026-11-13",
            "2026-11-30"
        )
        .is_empty());
        // it covers the days of the range that it touches, even when it started before
        assert_eq!(
            occ(
                "2026-11-10",
                "2026-11-14",
                "none",
                "",
                "2026-11-12",
                "2026-11-12"
            ),
            ["2026-11-10..2026-11-14"]
        );
        assert!(occ(
            "2026-11-10",
            "2026-11-14",
            "none",
            "",
            "2026-11-15",
            "2026-11-20"
        )
        .is_empty());
        assert!(occ("bad", "bad", "none", "", "2026-11-01", "2026-11-30").is_empty());
        assert!(occ(
            "2026-11-12",
            "2026-11-12",
            "none",
            "",
            "2026-12-01",
            "2026-11-01"
        )
        .is_empty());
    }

    #[test]
    fn daily_and_weekly_series() {
        assert_eq!(
            occ(
                "2026-11-10",
                "2026-11-10",
                "daily",
                "",
                "2026-11-12",
                "2026-11-14"
            ),
            ["2026-11-12", "2026-11-13", "2026-11-14"]
        );
        // 2026-11-12 is a Thursday: the same weekday every week
        assert_eq!(
            occ(
                "2026-11-12",
                "2026-11-12",
                "weekly",
                "",
                "2026-11-01",
                "2026-12-05"
            ),
            ["2026-11-12", "2026-11-19", "2026-11-26", "2026-12-03"]
        );
        // a series that began long ago reaches the range at once
        assert_eq!(
            occ(
                "2020-01-02",
                "2020-01-02",
                "weekly",
                "",
                "2026-11-12",
                "2026-11-18"
            ),
            ["2026-11-12"]
        );
        // it stops at the last day
        assert_eq!(
            occ(
                "2026-11-12",
                "2026-11-12",
                "weekly",
                "2026-11-19",
                "2026-11-01",
                "2026-12-31"
            ),
            ["2026-11-12", "2026-11-19"]
        );
        // a two-day series shows the overlap with the range
        assert_eq!(
            occ(
                "2026-11-10",
                "2026-11-11",
                "daily",
                "",
                "2026-11-11",
                "2026-11-11"
            ),
            ["2026-11-10..2026-11-11", "2026-11-11..2026-11-12"]
        );
    }

    #[test]
    fn monthly_and_yearly_series() {
        // the 31st falls on the last day of a shorter month
        assert_eq!(
            occ(
                "2026-01-31",
                "2026-01-31",
                "monthly",
                "",
                "2026-01-01",
                "2026-05-31"
            ),
            [
                "2026-01-31",
                "2026-02-28",
                "2026-03-31",
                "2026-04-30",
                "2026-05-31"
            ]
        );
        assert_eq!(
            occ(
                "2028-01-31",
                "2028-01-31",
                "monthly",
                "",
                "2028-02-01",
                "2028-02-29"
            ),
            ["2028-02-29"]
        );
        // across the year
        assert_eq!(
            occ(
                "2026-11-15",
                "2026-11-15",
                "monthly",
                "",
                "2026-12-01",
                "2027-02-28"
            ),
            ["2026-12-15", "2027-01-15", "2027-02-15"]
        );
        // 29 February: 28 February in common years
        assert_eq!(
            occ(
                "2028-02-29",
                "2028-02-29",
                "yearly",
                "",
                "2028-01-01",
                "2030-12-31"
            ),
            ["2028-02-29", "2029-02-28", "2030-02-28"]
        );
        assert_eq!(
            occ(
                "2020-02-29",
                "2020-02-29",
                "yearly",
                "",
                "2032-01-01",
                "2032-12-31"
            ),
            ["2032-02-29"]
        );
        assert_eq!(
            occ(
                "2020-03-05",
                "2020-03-05",
                "yearly",
                "2027-12-31",
                "2025-01-01",
                "2030-12-31"
            ),
            ["2025-03-05", "2026-03-05", "2027-03-05"]
        );
        // a multi-day monthly event that started in the previous month still covers the first days
        assert_eq!(
            occ(
                "2026-10-30",
                "2026-11-02",
                "monthly",
                "",
                "2026-11-01",
                "2026-11-01"
            ),
            ["2026-10-30..2026-11-02"]
        );
    }

    #[test]
    fn the_occurrences_are_capped() {
        let all = occurrences(
            "2020-01-01",
            "2020-01-01",
            "daily",
            "",
            "2020-01-01",
            "2026-12-31",
            500,
        );
        assert_eq!(all.len(), 500);
        assert_eq!(
            occurrences(
                "2020-01-01",
                "2020-01-01",
                "daily",
                "",
                "2020-01-01",
                "2020-12-31",
                0
            )
            .len(),
            0
        );
    }

    fn event_row(id: &str, extra: Value) -> Value {
        let mut r = json!({
            "id": id, "title": "Standup", "location": "", "starts_on": "2026-11-12", "starts_time": "09:30",
            "ends_on": "2026-11-12", "ends_time": "10:00", "all_day": false, "repeat": "none", "repeat_until": "",
            "attendees": "[]", "color": "blue",
        });
        for (k, x) in extra.as_object().unwrap() {
            r[k] = x.clone();
        }
        r
    }

    fn host_with(rows: Vec<Value>, answers: Vec<Value>) -> MockHost {
        MockHost::new().on("db.query", move |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            if sql.contains("current_date") {
                Ok(json!([{ "d": "2026-11-12" }]))
            } else if sql.contains("from rsvps") {
                Ok(Value::Array(answers.clone()))
            } else {
                Ok(Value::Array(rows.clone()))
            }
        })
    }

    #[test]
    fn range_expands_counts_and_adds_the_tasks() {
        let rows = vec![
            event_row(
                EV,
                json!({ "repeat": "weekly", "attendees": people(&[ME, A]) }),
            ),
            event_row(
                B,
                json!({ "title": "Later", "starts_on": "2027-05-01", "ends_on": "2027-05-01" }),
            ),
        ];
        let answers = vec![
            json!({ "id": EV, "user_id": ME, "answer": "yes" }),
            json!({ "id": EV, "user_id": A, "answer": "maybe" }),
        ];
        let host = host_with(rows, answers).with_plugin_command(
            "com.mosaikit.tasks",
            "tasks.due_between",
            |a| {
                assert_eq!(a["from"], "2026-11-01");
                Ok(json!([{ "id": "t1", "title": "Pay", "due": "2026-11-13" }]))
            },
        );
        let out = host
            .command(
                &__msk_registry(),
                "events.range",
                json!({ "from": "2026-11-01", "to": "2026-11-30" }),
            )
            .unwrap();
        let evs = out["events"].as_array().unwrap();
        assert_eq!(evs.len(), 3, "{out}");
        assert_eq!(evs[0]["start"], "2026-11-12");
        assert_eq!(evs[0]["yes"], 1);
        assert_eq!(evs[0]["maybe"], 1);
        assert_eq!(evs[0]["mine"], "yes");
        assert_eq!(evs[0]["invited"], true);
        assert_eq!(evs[0]["invitees"], 2);
        assert_eq!(out["tasks"].as_array().unwrap().len(), 1);
        assert!(out["tasks_error"].is_null());
    }

    #[test]
    fn a_failing_tasks_call_does_not_fail_the_calendar() {
        let host = host_with(vec![event_row(EV, json!({}))], vec![]).with_plugin_command(
            "com.mosaikit.tasks",
            "tasks.due_between",
            |_| Err("plugin not installed".into()),
        );
        let out = host
            .command(
                &__msk_registry(),
                "events.range",
                json!({ "from": "2026-11-01", "to": "2026-11-30" }),
            )
            .unwrap();
        assert_eq!(out["events"].as_array().unwrap().len(), 1);
        assert_eq!(out["tasks"].as_array().unwrap().len(), 0);
        assert!(out["tasks_error"]
            .as_str()
            .unwrap()
            .contains("not installed"));
        // the switch off never calls Tasks
        let out = host_with(vec![], vec![])
            .command(
                &__msk_registry(),
                "events.range",
                json!({ "from": "2026-11-01", "to": "2026-11-30", "tasks": false }),
            )
            .unwrap();
        assert!(out["tasks_error"].is_null());
    }

    #[test]
    fn range_checks_its_arguments() {
        let h = host_with(vec![], vec![]);
        let run = |a: Value| h.command(&__msk_registry(), "events.range", a);
        assert!(run(json!({ "from": "2026-11-01" })).is_err());
        assert!(run(json!({ "from": "2026-11-05", "to": "2026-11-01" }))
            .unwrap_err()
            .contains("before"));
        assert!(run(json!({ "from": "2026-01-01", "to": "2027-12-31" }))
            .unwrap_err()
            .contains("at most"));
    }

    #[test]
    fn rsvp_needs_an_invitation_or_write_access() {
        let reg = __msk_registry();
        let ask = |attendees: String, lvl: i64| {
            MockHost::new()
                .on("db.query", move |_| {
                    Ok(json!([{ "attendees": attendees.clone(), "lvl": lvl }]))
                })
                .on("db.exec", |_| Ok(json!({ "rows": 1 })))
                .command(&reg, "events.rsvp", json!({ "id": EV, "answer": "yes" }))
        };
        assert!(ask(people(&[A]), 1).unwrap_err().contains("not invited"));
        assert!(ask(people(&[A]), 2).is_ok());
        assert!(ask(people(&[ME]), 1).is_ok());
        let bad = MockHost::new().command(
            &reg,
            "events.rsvp",
            json!({ "id": EV, "answer": "perhaps" }),
        );
        assert!(bad.unwrap_err().contains("yes, no or maybe"));
    }

    #[test]
    fn rsvp_updates_the_own_row_and_inserts_when_there_is_none() {
        let reg = __msk_registry();
        let seen = std::rc::Rc::new(std::cell::RefCell::new(Vec::<String>::new()));
        let log = seen.clone();
        let host = MockHost::new()
            .on("db.query", |_| {
                Ok(json!([{ "attendees": people(&[ME]), "lvl": 1 }]))
            })
            .on("db.exec", move |req| {
                let sql = req["sql"].as_str().unwrap_or_default().to_string();
                let first = log.borrow().is_empty();
                log.borrow_mut().push(sql);
                // the update finds no row the first time
                Ok(json!({ "rows": if first { 0 } else { 1 } }))
            });
        host.command(&reg, "events.rsvp", json!({ "id": EV, "answer": "maybe" }))
            .unwrap();
        let sqls = seen.borrow();
        assert!(sqls[0].starts_with("update rsvps"));
        assert!(sqls[1].starts_with("insert into rsvps"));
        assert!(sqls[1].contains("on conflict"));
    }

    #[test]
    fn invitations_list_the_unanswered_ones_from_today() {
        let rows = vec![
            event_row(
                EV,
                json!({ "attendees": people(&[ME]), "starts_on": "2026-11-20", "ends_on": "2026-11-20" }),
            ),
            event_row(
                A,
                json!({ "attendees": people(&[ME]), "starts_on": "2026-11-01", "ends_on": "2026-11-01" }),
            ),
            event_row(
                B,
                json!({ "attendees": people(&[ME]), "starts_on": "2026-11-15", "ends_on": "2026-11-15" }),
            ),
            event_row(
                "33333333-3333-3333-3333-333333333333",
                json!({ "attendees": people(&[A]) }),
            ),
            event_row(
                "44444444-4444-4444-4444-444444444444",
                json!({ "attendees": people(&[ME]), "starts_on": "2026-10-01", "ends_on": "2026-10-01", "repeat": "monthly" }),
            ),
        ];
        let host = MockHost::new().on("db.query", move |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            if sql.contains("current_date") {
                Ok(json!([{ "d": "2026-11-12" }]))
            } else if sql.contains("from rsvps") {
                Ok(json!([{ "id": B }]))
            } else {
                Ok(Value::Array(rows.clone()))
            }
        });
        let out = host
            .command(&__msk_registry(), "events.invitations", json!({}))
            .unwrap();
        let list = out["invitations"].as_array().unwrap();
        // the past one, the answered one and the one of other people are not listed; the monthly one comes on the 1st
        let starts: Vec<&str> = list.iter().map(|i| i["start"].as_str().unwrap()).collect();
        assert_eq!(starts, ["2026-11-20", "2026-12-01"]);
    }

    #[test]
    fn the_widget_lists_today_and_tomorrow() {
        let rows = vec![
            event_row(EV, json!({ "title": "Standup", "starts_time": "09:30" })),
            event_row(
                A,
                json!({ "title": "Tomorrow", "starts_on": "2026-11-13", "ends_on": "2026-11-13", "starts_time": "08:00" }),
            ),
            event_row(
                B,
                json!({ "title": "Holiday", "starts_on": "2026-11-11", "ends_on": "2026-11-13", "all_day": true, "starts_time": "" }),
            ),
        ];
        let host = host_with(rows, vec![]);
        let out = host
            .command(&__msk_registry(), "events.widget_today", json!({}))
            .unwrap();
        let items = out["items"].as_array().unwrap();
        let titles: Vec<&str> = items.iter().map(|i| i["title"].as_str().unwrap()).collect();
        assert_eq!(titles, ["Holiday", "Standup", "Holiday", "Tomorrow"]);
        assert_eq!(items[1]["meta"], "09:30");
        assert_eq!(items[3]["meta"], "2026-11-13 08:00");
        assert_eq!(out["more"], 0);
    }
}

#[cfg(test)]
mod exception_tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;
    use std::{cell::RefCell, rc::Rc};

    const EV: &str = "99999999-9999-9999-9999-999999999999";

    fn series(lvl: i64) -> Value {
        json!([{
            "id": EV, "title": "Standup", "location": "", "starts_on": "2026-11-02", "starts_time": "09:30",
            "ends_on": "2026-11-02", "ends_time": "10:00", "all_day": false, "repeat": "weekly",
            "repeat_until": "", "attendees": "[]", "color": "blue", "timezone": "", "lvl": lvl,
        }])
    }

    fn host(lvl: i64, seen: Rc<RefCell<Vec<String>>>) -> MockHost {
        MockHost::new()
            .on("db.query", move |_| Ok(series(lvl)))
            .on("db.exec", move |req| {
                seen.borrow_mut()
                    .push(req["sql"].as_str().unwrap_or_default().to_string());
                Ok(json!({ "rows": 0 }))
            })
    }

    fn run(lvl: i64, cmd: &str, args: Value) -> (std::result::Result<Value, String>, Vec<String>) {
        let seen = Rc::new(RefCell::new(Vec::new()));
        let out = host(lvl, seen.clone()).command(&__msk_registry(), cmd, args);
        let log = seen.borrow().clone();
        (out, log)
    }

    #[test]
    fn skipping_one_occurrence_writes_an_exception() {
        let (out, sql) = run(2, "events.skip", json!({ "id": EV, "on": "2026-11-09" }));
        assert_eq!(out.unwrap()["skipped"], "2026-11-09");
        // the update finds nothing, so the row is inserted
        assert!(sql[0].starts_with("update exceptions"));
        assert!(sql[1].starts_with("insert into exceptions"));
    }

    #[test]
    fn only_a_writer_changes_an_occurrence_that_exists_of_a_series() {
        let a = json!({ "id": EV, "on": "2026-11-09" });
        assert!(run(1, "events.skip", a).0.unwrap_err().contains("can edit"));
        // 2026-11-10 is a Tuesday: the series is on Mondays
        assert!(
            run(2, "events.skip", json!({ "id": EV, "on": "2026-11-10" }))
                .0
                .unwrap_err()
                .contains("no occurrence")
        );
        assert!(run(2, "events.skip", json!({ "id": EV, "on": "nonsense" }))
            .0
            .is_err());
    }

    #[test]
    fn an_event_that_does_not_repeat_has_no_occurrences_of_its_own() {
        let h = MockHost::new().on("db.query", |_| {
            let mut r = series(2);
            r[0]["repeat"] = json!("none");
            Ok(r)
        });
        let e = h
            .command(
                &__msk_registry(),
                "events.skip",
                json!({ "id": EV, "on": "2026-11-02" }),
            )
            .unwrap_err();
        assert!(e.contains("repeats"));
    }

    #[test]
    fn an_override_checks_title_place_and_times() {
        let on = "2026-11-09";
        let ok = run(
            2,
            "events.override",
            json!({ "id": EV, "on": on, "title": " Planning ", "starts_time": "11:00", "ends_time": "12:00" }),
        );
        assert!(ok.0.is_ok());
        assert!(ok.1[0].starts_with("update exceptions"));
        let bad = |a: Value| run(2, "events.override", a).0.unwrap_err();
        assert!(bad(json!({ "id": EV, "on": on, "title": "  " })).contains("title"));
        assert!(bad(json!({ "id": EV, "on": on, "starts_time": "25:00" })).contains("HH:MM"));
        // the end cannot be before the start on a one-day event
        assert!(bad(json!({ "id": EV, "on": on, "ends_time": "09:00" })).contains("end before"));
        assert!(
            bad(json!({ "id": EV, "on": on, "location": "x".repeat(MAX_LOCATION + 1) }))
                .contains("at most")
        );
    }

    #[test]
    fn restoring_deletes_the_exception_of_a_writer_only() {
        let (out, sql) = run(2, "events.restore", json!({ "id": EV, "on": "2026-11-09" }));
        assert!(out.is_ok());
        assert!(sql[0].starts_with("delete from exceptions"));
        assert!(
            run(1, "events.restore", json!({ "id": EV, "on": "2026-11-09" }))
                .0
                .is_err()
        );
    }

    #[test]
    fn an_exception_changes_the_fields_it_names_and_marks_the_occurrence() {
        let mut occ = json!({ "title": "Standup", "location": "Room 1", "starts_time": "09:30", "ends_time": "10:00" });
        apply_exception(
            &mut occ,
            &json!({ "title": "Planning", "location": "", "starts_time": null, "ends_time": "11:00" }),
        );
        assert_eq!(occ["title"], "Planning");
        assert_eq!(occ["location"], "");
        assert_eq!(occ["starts_time"], "09:30");
        assert_eq!(occ["ends_time"], "11:00");
        assert_eq!(occ["exception"], true);
    }

    #[test]
    fn range_drops_skipped_occurrences_and_applies_the_changed_ones() {
        let h = MockHost::new().on("db.query", |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            if sql.contains("from exceptions") {
                Ok(json!([
                    { "id": EV, "on_date": "2026-11-09", "skipped": true },
                    { "id": EV, "on_date": "2026-11-16", "skipped": false, "title": "Planning", "location": null, "starts_time": "11:00", "ends_time": null },
                ]))
            } else if sql.contains("from rsvps") {
                Ok(json!([]))
            } else {
                Ok(series(2))
            }
        });
        let out = h
            .command(
                &__msk_registry(),
                "events.range",
                json!({ "from": "2026-11-02", "to": "2026-11-22", "tasks": false }),
            )
            .unwrap();
        let ev = out["events"].as_array().unwrap();
        let days: Vec<&str> = ev.iter().map(|e| e["start"].as_str().unwrap()).collect();
        assert_eq!(days, ["2026-11-02", "2026-11-16"]);
        assert_eq!(ev[0]["exception"], false);
        assert_eq!(ev[1]["title"], "Planning");
        assert_eq!(ev[1]["starts_time"], "11:00");
        assert_eq!(ev[1]["ends_time"], "10:00");
        assert_eq!(ev[1]["orig"], "2026-11-16");
    }

    #[test]
    fn the_ics_data_lists_exceptions_and_answers_of_the_invited() {
        let a = "11111111-1111-1111-1111-111111111111";
        let h = MockHost::new().on("db.query", move |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            if sql.contains("from exceptions") {
                Ok(json!([{ "id": EV, "on_date": "2026-11-09", "skipped": true }]))
            } else if sql.contains("from rsvps") {
                Ok(json!([{ "id": EV, "user_id": a, "answer": "yes" }]))
            } else {
                let mut r = series(2);
                r[0]["attendees"] = json!(format!("[{{\"id\":\"{a}\",\"name\":\"Ann\"}}]"));
                Ok(r)
            }
        });
        let out = h
            .command(&__msk_registry(), "events.ics_data", json!({ "ids": [EV] }))
            .unwrap();
        assert_eq!(out[EV]["attendees"][0]["answer"], "yes");
        assert_eq!(out[EV]["exceptions"][0]["skipped"], true);
        assert_eq!(out[EV]["exceptions"][0]["title"], Value::Null);
    }

    #[test]
    fn a_time_zone_is_a_name_or_empty() {
        assert!(zone_like("UTC"));
        assert!(zone_like("Europe/Rome"));
        assert!(zone_like("America/Argentina/Buenos_Aires"));
        assert!(zone_like("Etc/GMT+5"));
        assert!(!zone_like("Europe//Rome"));
        assert!(!zone_like("+02:00"));
        assert!(!zone_like("Rome; drop"));
        assert!(!zone_like(&"a".repeat(65)));
        let run = |tz: &str, all_day: bool| {
            MockHost::new().hook(
                &__msk_registry(),
                "before_create",
                "events",
                json!({ "title": "x", "starts_on": "2026-11-12", "timezone": tz, "all_day": all_day }),
            )
        };
        assert_eq!(
            run("Europe/Rome", false).unwrap().unwrap().str("timezone"),
            "Europe/Rome"
        );
        assert!(run("Mars time", false).unwrap_err().contains("time zone"));
        // all-day events have no zone
        assert_eq!(
            run("Europe/Rome", true).unwrap().unwrap().str("timezone"),
            ""
        );
    }
}
