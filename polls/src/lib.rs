//! Polls plugin: a quick question to a group. The hook checks the question and the options (2 to 12 distinct texts, kept as
//! a JSON array in the hidden field `options`). A reader votes with the command `polls.vote` (the table `votes` is one a
//! reader writes, see `[[tables]]` in the manifest); `polls.results` answers what the poll shows, honouring when the
//! results may be seen and whether the voters are named; `polls.overview` what the list needs in one call.
//! The rules (validation of a vote, percent, visibility) are plain functions, tested without the database.
//! People outside the tenant vote from a public link: `public_poll` (read) and `public_vote` (write, one
//! set of votes per browser id, the table `votes` is also a visitor table). A visitor never sees names.

use mosaikit_plugin_sdk::prelude::*;
use mosaikit_plugin_sdk::serde_json;

const MAX_QUESTION: usize = 200;
const MAX_DETAILS: usize = 2000;
const MAX_OPTION: usize = 100;
const MIN_OPTIONS: usize = 2;
const MAX_OPTIONS: usize = 12;
/// The name stored for a vote cast from a public link (no user: the voter id is the id of the browser).
const VISITOR: &str = "visitor";
/// The most voter ids a poll takes from public links.
const MAX_VOTERS: i64 = 5000;
const RESULTS: [&str; 3] = ["always", "after_vote", "after_close"];

type Fail = (&'static str, String);

/// The options of a poll, trimmed and checked: 2 to 12 texts, none empty, none repeated, each at most 100 characters.
fn clean_options(list: &[Value]) -> std::result::Result<Vec<String>, Fail> {
    let mut out: Vec<String> = Vec::new();
    for o in list {
        let t = o.as_str().unwrap_or_default().trim().to_string();
        if t.is_empty() {
            return Err(("poll_option_empty", "an option cannot be empty".into()));
        }
        if t.chars().count() > MAX_OPTION {
            return Err((
                "poll_option_long",
                format!("an option has at most {MAX_OPTION} characters"),
            ));
        }
        if out.iter().any(|x| x.to_lowercase() == t.to_lowercase()) {
            return Err((
                "poll_option_duplicate",
                format!("the option “{t}” is written twice"),
            ));
        }
        out.push(t);
    }
    if out.len() < MIN_OPTIONS || out.len() > MAX_OPTIONS {
        return Err((
            "poll_option_count",
            format!("a poll has from {MIN_OPTIONS} to {MAX_OPTIONS} options"),
        ));
    }
    Ok(out)
}

/// The options as stored: a JSON array in text (an array value is accepted too).
fn stored_options(v: Option<&Value>) -> Vec<Value> {
    match v {
        Some(Value::Array(a)) => a.clone(),
        Some(Value::String(s)) => serde_json::from_str::<Vec<Value>>(s).unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn poll(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let question: String = v.str("question").trim().to_string();
    if question.is_empty() {
        return Err(Error::coded(
            "poll_question_empty",
            "a poll needs a question",
        ));
    }
    if question.chars().count() > MAX_QUESTION {
        return Err(Error::coded(
            "poll_question_long",
            format!("the question has at most {MAX_QUESTION} characters"),
        ));
    }
    v.set("question", question);
    let details = v.str("details");
    if details.chars().count() > MAX_DETAILS {
        return Err(Error::coded(
            "poll_details_long",
            format!("the details have at most {MAX_DETAILS} characters"),
        ));
    }
    let options = clean_options(&stored_options(v.get("options")))
        .map_err(|(code, m)| Error::coded(code, m))?;
    v.set(
        "options",
        serde_json::to_string(&options).unwrap_or_default(),
    );
    let results = v.str("results");
    if results.is_empty() {
        v.set("results", "after_vote");
    } else if !RESULTS.contains(&results.as_str()) {
        return Err(Error::coded(
            "poll_results",
            "results are shown always, after the vote or after the poll closes",
        ));
    }
    Ok(Some(v))
}

/// A boolean column as the database answers it (true, or 1 on SQLite).
fn truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        Some(Value::String(s)) => s == "true" || s == "t" || s == "1",
        _ => false,
    }
}

/// Whether the poll takes votes on `today` (YYYY-MM-DD): not closed by hand and `closes_on` not before today.
fn is_closed(closed: bool, closes_on: &str, today: &str) -> bool {
    closed || (!closes_on.is_empty() && closes_on < today)
}

/// Checks the choices of a vote and returns them sorted: at least one, no repeat, each below `count`, one only unless the
/// poll is multiple.
fn validate_vote(
    choices: &[i64],
    count: usize,
    multiple: bool,
) -> std::result::Result<Vec<i64>, Fail> {
    if choices.is_empty() {
        return Err(("vote_empty", "choose an option".into()));
    }
    let mut sorted = choices.to_vec();
    sorted.sort_unstable();
    if sorted.windows(2).any(|w| w[0] == w[1]) {
        return Err(("vote_duplicate", "an option is chosen twice".into()));
    }
    if sorted.iter().any(|&i| i < 0 || i as usize >= count) {
        return Err(("vote_range", "that option does not exist".into()));
    }
    if sorted.len() > 1 && !multiple {
        return Err(("vote_single", "this poll takes one choice only".into()));
    }
    Ok(sorted)
}

/// Whole percent of the people who voted that chose an option (0 when nobody voted).
fn percent(votes: usize, voters: usize) -> i64 {
    if voters == 0 {
        0
    } else {
        ((votes as f64) * 100.0 / (voters as f64)).round() as i64
    }
}

/// Whether the counts are shown: to someone who manages the poll (level 3) always; to the others by the rule `results`.
fn results_visible(mode: &str, closed: bool, has_voted: bool, level: i64) -> bool {
    if level >= 3 {
        return true;
    }
    match mode {
        "always" => true,
        "after_close" => closed,
        _ => has_voted || closed,
    }
}

fn id_arg(args: &Value) -> Result<String> {
    let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
    if id.is_empty() {
        return Err(Error::coded("poll_missing", "which poll?"));
    }
    Ok(id.to_string())
}

fn today(ctx: &Ctx) -> Result<String> {
    let row = ctx
        .db()
        .query_one("select current_date::text as d", &[])?
        .unwrap_or_default();
    Ok(row
        .get("d")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .chars()
        .take(10)
        .collect())
}

/// The poll `id` as the logic needs it: options, whether it takes several choices, the rule of the results, the closing.
struct PollRow {
    question: String,
    details: String,
    options: Vec<String>,
    multiple: bool,
    hide_voters: bool,
    results: String,
    closed: bool,
    closes_on: String,
}

fn read_poll(ctx: &Ctx, id: &str) -> Result<PollRow> {
    let row = ctx
        .db()
        .query_one(
            "select question, details, options, multiple, hide_voters, results, closed, closes_on::text as closes_on from polls where resource_id = $1::uuid",
            &[json!(id)],
        )?
        .ok_or_else(|| Error::coded("poll_missing", "that poll does not exist"))?;
    let options = stored_options(row.get("options"))
        .iter()
        .map(|o| o.as_str().unwrap_or_default().to_string())
        .collect();
    let text = |k: &str| {
        row.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .chars()
            .take(10)
            .collect::<String>()
    };
    let plain = |k: &str| {
        row.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    Ok(PollRow {
        question: plain("question"),
        details: plain("details"),
        options,
        multiple: truthy(row.get("multiple")),
        hide_voters: truthy(row.get("hide_voters")),
        results: {
            let r = row
                .get("results")
                .and_then(Value::as_str)
                .unwrap_or("after_vote");
            if r.is_empty() { "after_vote" } else { r }.to_string()
        },
        closed: truthy(row.get("closed")),
        closes_on: text("closes_on"),
    })
}

/// The caller votes on the poll `id` with `choices` (indexes of the options). A new vote replaces the old one while open.
fn vote(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = id_arg(&args)?;
    let user = ctx
        .user
        .clone()
        .ok_or_else(|| Error::coded("not_signed_in", "sign in to vote"))?;
    let tenant = ctx.tenant.clone().unwrap_or_default();
    let name = ctx.username.clone().unwrap_or_else(|| user.clone());
    let choices: Vec<i64> = args
        .get("choices")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_i64).collect())
        .unwrap_or_default();
    let p = read_poll(ctx, &id)?;
    if is_closed(p.closed, &p.closes_on, &today(ctx)?) {
        return Err(Error::coded("poll_closed", "this poll is closed"));
    }
    let sorted = validate_vote(&choices, p.options.len(), p.multiple)
        .map_err(|(code, m)| Error::coded(code, m))?;
    ctx.db().exec(
        "delete from votes where resource_id = $1::uuid and user_id = $2::uuid",
        &[json!(id), json!(user)],
    )?;
    for i in &sorted {
        ctx.db().exec(
            "insert into votes (resource_id, tenant_id, user_id, user_name, option_index) values ($1::uuid, $2::uuid, $3::uuid, $4, $5::int)",
            &[json!(id), json!(tenant), json!(user), json!(name), json!(i)],
        )?;
    }
    Ok(json!({ "voted": true, "choices": sorted }))
}

/// The state of the poll `id` for the caller: the options with votes, percent and voters (as far as the rules allow).
fn results(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = id_arg(&args)?;
    let user = ctx.user.clone().unwrap_or_default();
    let p = read_poll(ctx, &id)?;
    let closed = is_closed(p.closed, &p.closes_on, &today(ctx)?);
    let level = ctx
        .db()
        .query_one(
            "select core.level_of($1::uuid)::int as lv from polls where resource_id = $1::uuid",
            &[json!(id)],
        )?
        .and_then(|r| r.get("lv").and_then(Value::as_i64))
        .unwrap_or(1);
    let rows = ctx.db().query(
        "select option_index::int as i, user_id::text as id, user_name as name from votes where resource_id = $1::uuid order by voted_at, user_name",
        &[json!(id)],
    )?;
    // votes for an option that no longer exists (the poll was edited) are ignored
    let valid: Vec<(usize, String, String)> = rows
        .iter()
        .filter_map(|r| {
            let i = r.get("i").and_then(Value::as_i64)?;
            let uid = r.get("id").and_then(Value::as_str)?.to_string();
            let name = r.get("name").and_then(Value::as_str).unwrap_or_default();
            (i >= 0 && (i as usize) < p.options.len()).then(|| (i as usize, uid, name.to_string()))
        })
        .collect();
    let mine: Vec<usize> = valid
        .iter()
        .filter(|(_, u, _)| *u == user)
        .map(|(i, _, _)| *i)
        .collect();
    let visible = results_visible(&p.results, closed, !mine.is_empty(), level);
    let mut voters: Vec<&str> = valid.iter().map(|(_, u, _)| u.as_str()).collect();
    voters.sort_unstable();
    voters.dedup();
    let total = if visible { voters.len() } else { 0 };
    let visitors = if visible {
        visitor_count(valid.iter().map(|(_, u, n)| (u.as_str(), n.as_str())))
    } else {
        0
    };
    let options: Vec<Value> = p
        .options
        .iter()
        .enumerate()
        .map(|(n, label)| {
            let here: Vec<&(usize, String, String)> =
                valid.iter().filter(|(i, _, _)| *i == n).collect();
            let votes = if visible { here.len() } else { 0 };
            let names: Vec<Value> = if visible && !p.hide_voters {
                here.iter()
                    .filter(|(_, _, name)| !is_visitor(name))
                    .map(|(_, u, name)| json!({ "id": u, "name": name }))
                    .collect()
            } else {
                Vec::new()
            };
            json!({ "label": label, "votes": votes, "percent": percent(votes, total), "voters": names })
        })
        .collect();
    Ok(json!({
        "options": options,
        "total_voters": total,
        "visitors": visitors,
        "mine": mine,
        "closed": closed,
        "visible": visible,
        "hide_voters": p.hide_voters,
    }))
}

/// Whether a voter name is the one of a vote cast from a public link.
fn is_visitor(name: &str) -> bool {
    name == VISITOR
}

/// How many distinct voters (`(user id, name)`) voted from a public link.
fn visitor_count<'a>(rows: impl Iterator<Item = (&'a str, &'a str)>) -> usize {
    let mut ids: Vec<&str> = rows
        .filter(|(_, n)| is_visitor(n))
        .map(|(u, _)| u)
        .collect();
    ids.sort_unstable();
    ids.dedup();
    ids.len()
}

/// A browser id as the public page makes it up: a UUID (36 characters, hexadecimal digits and four hyphens), lower-cased.
fn browser_id(raw: &str) -> Option<String> {
    let t = raw.trim().to_lowercase();
    let ok = t.len() == 36
        && t.char_indices().all(|(i, c)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                c == '-'
            } else {
                c.is_ascii_hexdigit()
            }
        });
    ok.then_some(t)
}

/// What a visitor sees of a poll: whether the counts show, the choices of this browser and, when they show, the votes and
/// percent of each option and the number of voters. Never a name. `rows` are `(option index, voter id)`.
fn public_counts(
    options: usize,
    rows: &[(usize, String)],
    browser: &str,
    mode: &str,
    closed: bool,
) -> (bool, Vec<usize>, Vec<(usize, i64)>, usize) {
    let valid: Vec<&(usize, String)> = rows.iter().filter(|(i, _)| *i < options).collect();
    let mine: Vec<usize> = valid
        .iter()
        .filter(|(_, u)| !browser.is_empty() && u == browser)
        .map(|(i, _)| *i)
        .collect();
    let visible = results_visible(mode, closed, !mine.is_empty(), 0);
    if !visible {
        return (false, mine, Vec::new(), 0);
    }
    let mut voters: Vec<&str> = valid.iter().map(|(_, u)| u.as_str()).collect();
    voters.sort_unstable();
    voters.dedup();
    let counts = (0..options)
        .map(|n| {
            let v = valid.iter().filter(|(i, _)| *i == n).count();
            (v, percent(v, voters.len()))
        })
        .collect();
    (true, mine, counts, voters.len())
}

/// The poll of the public link as the page shows it (also the answer of a vote).
fn public_state(ctx: &Ctx, id: &str, p: &PollRow, browser: &str) -> Result<Value> {
    let closed = is_closed(p.closed, &p.closes_on, &today(ctx)?);
    let rows: Vec<(usize, String)> = ctx
        .db()
        .query(
            "select option_index::int as i, user_id::text as id from votes where resource_id = $1::uuid",
            &[json!(id)],
        )?
        .iter()
        .filter_map(|r| {
            let i = r.get("i").and_then(Value::as_i64)?;
            let u = r.get("id").and_then(Value::as_str)?.to_string();
            (i >= 0).then_some((i as usize, u))
        })
        .collect();
    let (visible, mine, counts, total) =
        public_counts(p.options.len(), &rows, browser, &p.results, closed);
    let options: Vec<Value> = p
        .options
        .iter()
        .enumerate()
        .map(|(n, label)| {
            let (votes, pct) = counts.get(n).copied().unwrap_or((0, 0));
            json!({ "label": label, "votes": votes, "percent": pct })
        })
        .collect();
    Ok(json!({
        "question": p.question,
        "details": p.details,
        "options": options,
        "multiple": p.multiple,
        "closed": closed,
        "results": p.results,
        "visible": visible,
        "total_voters": total,
        "mine": mine,
        "voted": !mine.is_empty(),
    }))
}

/// The item of the public link: the only poll a public command may touch.
fn link_poll(ctx: &Ctx) -> Result<String> {
    ctx.link_resource()
        .map(str::to_string)
        .ok_or_else(|| Error::coded("poll_missing", "which poll?"))
}

/// The browser id of the arguments: empty when absent (and not required), an error when it is not a UUID.
fn browser_arg(args: &Value, required: bool) -> Result<String> {
    let raw = args
        .get("browser")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if raw.is_empty() && !required {
        return Ok(String::new());
    }
    browser_id(raw).ok_or_else(|| Error::coded("browser_invalid", "the browser id is not valid"))
}

/// Public command: the poll of the link, with the counts when this visitor may see them.
fn public_poll(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = link_poll(ctx)?;
    let browser = browser_arg(&args, false)?;
    let p = read_poll(ctx, &id)?;
    public_state(ctx, &id, &p, &browser)
}

/// Public write command: a visitor votes once from this browser (a second vote is refused: a visitor cannot delete rows).
fn public_vote(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = link_poll(ctx)?;
    if !args
        .get("website")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .is_empty()
    {
        return Err(Error::coded("poll_spam", "the vote was refused"));
    }
    let browser = browser_arg(&args, true)?;
    let tenant = ctx.tenant.clone().unwrap_or_default();
    let choices: Vec<i64> = args
        .get("choices")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_i64).collect())
        .unwrap_or_default();
    let p = read_poll(ctx, &id)?;
    if is_closed(p.closed, &p.closes_on, &today(ctx)?) {
        return Err(Error::coded("poll_closed", "this poll is closed"));
    }
    let sorted = validate_vote(&choices, p.options.len(), p.multiple)
        .map_err(|(code, m)| Error::coded(code, m))?;
    let count = |sql: &str, params: &[Value]| -> Result<i64> {
        Ok(ctx
            .db()
            .query_one(sql, params)?
            .and_then(|r| r.get("n").and_then(Value::as_i64))
            .unwrap_or(0))
    };
    if count(
        "select count(*)::int as n from votes where resource_id = $1::uuid and user_id = $2::uuid",
        &[json!(id), json!(browser)],
    )? > 0
    {
        return Err(Error::coded(
            "already_voted",
            "this browser has already voted",
        ));
    }
    if count(
        "select count(distinct user_id)::int as n from votes where resource_id = $1::uuid",
        &[json!(id)],
    )? >= MAX_VOTERS
    {
        return Err(Error::coded(
            "poll_voters_cap",
            "this poll has reached the most voters it takes",
        ));
    }
    for i in &sorted {
        ctx.db().exec(
            "insert into votes (resource_id, tenant_id, user_id, user_name, option_index) values ($1::uuid, $2::uuid, $3::uuid, $4, $5::int)",
            &[json!(id), json!(tenant), json!(browser), json!(VISITOR), json!(i)],
        )?;
    }
    public_state(ctx, &id, &p, &browser)
}

/// What the list needs: the polls the caller voted on (ids) and how many people voted on each.
fn overview(ctx: &Ctx, _args: Value) -> Result<Value> {
    let user = ctx.user.clone().unwrap_or_default();
    let mine = ctx.db().query(
        "select distinct resource_id::text as id from votes where user_id = $1::uuid",
        &[json!(user)],
    )?;
    let counts = ctx.db().query(
        "select resource_id::text as id, count(distinct user_id)::int as n from votes group by resource_id",
        &[],
    )?;
    let mut by_poll = json!({});
    for r in &counts {
        if let (Some(id), Some(n)) = (r.get("id").and_then(Value::as_str), r.get("n")) {
            by_poll[id] = n.clone();
        }
    }
    Ok(json!({
        "mine": mine.iter().filter_map(|r| r.get("id").cloned()).collect::<Vec<_>>(),
        "counts": by_poll,
    }))
}

/// Counts for the widget: (open polls the caller has not voted on, open polls in all). `rows` carry `id`, `closed` and
/// `closes_on`; `voted` are the ids the caller voted on.
fn open_counts(rows: &[Value], voted: &[String], today: &str) -> (i64, i64) {
    let mut open = 0;
    let mut waiting = 0;
    for r in rows {
        let closes_on = r
            .get("closes_on")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if is_closed(truthy(r.get("closed")), closes_on, today) {
            continue;
        }
        open += 1;
        let id = r.get("id").and_then(Value::as_str).unwrap_or_default();
        if !voted.iter().any(|v| v == id) {
            waiting += 1;
        }
    }
    (waiting, open)
}

/// Widget `open-polls`: the open polls the caller can still vote on, and how many are open in all.
fn widget_open(ctx: &Ctx, _args: Value) -> Result<Value> {
    let user = ctx.user.clone().unwrap_or_default();
    let t = today(ctx)?;
    let rows = ctx.db().query(
        "select resource_id::text as id, closed, closes_on::text as closes_on from polls",
        &[],
    )?;
    let voted: Vec<String> = ctx
        .db()
        .query(
            "select distinct resource_id::text as id from votes where user_id = $1::uuid",
            &[json!(user)],
        )?
        .iter()
        .filter_map(|r| r.get("id").and_then(Value::as_str).map(str::to_string))
        .collect();
    let (waiting, open) = open_counts(&rows, &voted, &t);
    Ok(json!({ "value": waiting, "secondary": open, "tone": "" }))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "polls.before_create" => poll,
        "polls.before_update" => poll,
    },
    commands: {
        "polls.vote" => vote,
        "polls.results" => results,
        "polls.overview" => overview,
        "polls.widget_open" => widget_open,
        "public_poll" => public_poll,
        "public_vote" => public_vote,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn run(values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), "before_create", "polls", values)
    }
    fn ok(options: Value) -> Value {
        json!({ "question": "Lunch?", "options": options })
    }

    #[test]
    fn a_poll_is_trimmed_and_shows_results_after_the_vote_by_default() {
        let v = run(json!({ "question": "  Lunch?  ", "options": "[\" Pizza \",\"Sushi\"]" }))
            .unwrap()
            .unwrap();
        assert_eq!(v.str("question"), "Lunch?");
        assert_eq!(v.str("results"), "after_vote");
        assert_eq!(v.str("options"), "[\"Pizza\",\"Sushi\"]");
        assert!(run(json!({ "question": "  ", "options": ["a", "b"] }))
            .unwrap_err()
            .contains("question"));
    }

    #[test]
    fn the_options_are_two_to_twelve_distinct_texts() {
        assert!(run(ok(json!(["a", "b"]))).is_ok());
        let twelve: Vec<String> = (0..12).map(|i| format!("o{i}")).collect();
        assert!(run(ok(json!(twelve))).is_ok());
        let thirteen: Vec<String> = (0..13).map(|i| format!("o{i}")).collect();
        assert!(run(ok(json!(thirteen)))
            .unwrap_err()
            .contains("from 2 to 12"));
        assert!(run(ok(json!(["a"]))).unwrap_err().contains("from 2 to 12"));
        assert!(run(ok(json!([]))).unwrap_err().contains("from 2 to 12"));
        assert!(run(ok(json!("not json")))
            .unwrap_err()
            .contains("from 2 to 12"));
        assert!(run(ok(json!(["a", "  "]))).unwrap_err().contains("empty"));
        assert!(run(ok(json!(["a", "A"]))).unwrap_err().contains("twice"));
        assert!(run(ok(json!(["a", "x".repeat(101)])))
            .unwrap_err()
            .contains("at most 100"));
        assert!(run(ok(json!(["a", "x".repeat(100)]))).is_ok());
    }

    #[test]
    fn the_limits_of_the_texts_and_the_rule_of_the_results() {
        assert!(
            run(json!({ "question": "q".repeat(201), "options": ["a", "b"] }))
                .unwrap_err()
                .contains("at most 200")
        );
        assert!(run(
            json!({ "question": "q", "details": "d".repeat(2001), "options": ["a", "b"] })
        )
        .unwrap_err()
        .contains("at most 2000"));
        assert!(
            run(json!({ "question": "q", "options": ["a", "b"], "results": "always" })).is_ok()
        );
        assert!(
            run(json!({ "question": "q", "options": ["a", "b"], "results": "never" }))
                .unwrap_err()
                .contains("after the vote")
        );
    }

    #[test]
    fn a_vote_is_checked() {
        assert_eq!(validate_vote(&[1], 3, false).unwrap(), vec![1]);
        assert_eq!(validate_vote(&[2, 0], 3, true).unwrap(), vec![0, 2]);
        assert_eq!(validate_vote(&[], 3, true).unwrap_err().0, "vote_empty");
        assert_eq!(
            validate_vote(&[1, 1], 3, true).unwrap_err().0,
            "vote_duplicate"
        );
        assert_eq!(validate_vote(&[3], 3, false).unwrap_err().0, "vote_range");
        assert_eq!(validate_vote(&[-1], 3, false).unwrap_err().0, "vote_range");
        assert_eq!(
            validate_vote(&[0, 1], 3, false).unwrap_err().0,
            "vote_single"
        );
    }

    #[test]
    fn a_poll_closes_by_hand_or_by_date() {
        assert!(is_closed(true, "", "2026-05-01"));
        assert!(is_closed(false, "2026-04-30", "2026-05-01"));
        assert!(!is_closed(false, "2026-05-01", "2026-05-01"));
        assert!(!is_closed(false, "", "2026-05-01"));
    }

    #[test]
    fn percent_is_of_the_people_who_voted() {
        assert_eq!(percent(0, 0), 0);
        assert_eq!(percent(1, 1), 100);
        assert_eq!(percent(1, 3), 33);
        assert_eq!(percent(2, 3), 67);
        // multiple choice: the shares may add up to more than 100
        assert_eq!(percent(3, 3) + percent(2, 3), 167);
    }

    #[test]
    fn who_sees_the_counts() {
        // after the vote: only who voted, or the poll is closed, or who manages it
        assert!(!results_visible("after_vote", false, false, 1));
        assert!(results_visible("after_vote", false, true, 1));
        assert!(results_visible("after_vote", true, false, 1));
        assert!(results_visible("after_vote", false, false, 3));
        // after the close: voting does not show them while open
        assert!(!results_visible("after_close", false, true, 2));
        assert!(results_visible("after_close", true, false, 1));
        assert!(results_visible("after_close", false, false, 3));
        // always
        assert!(results_visible("always", false, false, 1));
    }

    #[test]
    fn booleans_come_as_true_or_one() {
        assert!(truthy(Some(&json!(true))));
        assert!(truthy(Some(&json!(1))));
        assert!(!truthy(Some(&json!(0))));
        assert!(!truthy(None));
    }

    #[test]
    fn the_commands_are_registered() {
        let names = __msk_registry().command_names();
        for c in [
            "polls.vote",
            "polls.results",
            "polls.overview",
            "polls.widget_open",
            "public_poll",
            "public_vote",
        ] {
            assert!(names.contains(&c), "{c}");
        }
    }

    #[test]
    fn open_polls_are_counted_for_the_caller() {
        let rows = vec![
            json!({ "id": "a", "closed": false, "closes_on": null }),
            json!({ "id": "b", "closed": false, "closes_on": "2026-10-20" }),
            json!({ "id": "c", "closed": true, "closes_on": null }),
            json!({ "id": "d", "closed": false, "closes_on": "2026-10-19" }),
            json!({ "id": "e", "closed": 0, "closes_on": "" }),
        ];
        // a, b and e are open (b closes today); the caller voted on b
        let voted = vec!["b".to_string(), "c".to_string()];
        assert_eq!(open_counts(&rows, &voted, "2026-10-20"), (2, 3));
        assert_eq!(open_counts(&[], &[], "2026-10-20"), (0, 0));
    }

    #[test]
    fn the_widget_answers() {
        let host = MockHost::new().on("db.query", |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            if sql.contains("current_date") {
                Ok(json!([{ "d": "2026-10-20" }]))
            } else if sql.contains("from votes") {
                Ok(json!([{ "id": "a" }]))
            } else {
                Ok(json!([
                    { "id": "a", "closed": false, "closes_on": null },
                    { "id": "b", "closed": false, "closes_on": null }
                ]))
            }
        });
        let out = host
            .command(&__msk_registry(), "polls.widget_open", json!({}))
            .unwrap();
        assert_eq!(out, json!({ "value": 1, "secondary": 2, "tone": "" }));
    }

    #[test]
    fn a_browser_id_is_a_uuid() {
        let ok = "0F8FAD5B-D9CB-469F-A165-70867728950E";
        assert_eq!(browser_id(ok).unwrap(), ok.to_lowercase());
        assert!(browser_id("").is_none());
        assert!(browser_id("not-a-uuid").is_none());
        assert!(browser_id("0f8fad5b-d9cb-469f-a165-70867728950g").is_none());
        assert!(browser_id("0f8fad5bd9cb469fa16570867728950e0000").is_none());
    }

    #[test]
    fn a_visitor_sees_counts_by_the_rule_and_never_names() {
        let me = "0f8fad5b-d9cb-469f-a165-70867728950e";
        let rows = vec![(0, me.to_string()), (1, "other".to_string())];
        let (v, mine, counts, total) = public_counts(2, &rows, me, "after_vote", false);
        assert!(v && total == 2 && mine == vec![0]);
        assert_eq!(counts, vec![(1, 50), (1, 50)]);
        // a browser that did not vote sees nothing while open
        let (v, mine, counts, total) = public_counts(2, &rows, "x", "after_vote", false);
        assert!(!v && mine.is_empty() && counts.is_empty() && total == 0);
        // closed shows them; after_close does not show them to who voted while open
        assert!(public_counts(2, &rows, "x", "after_vote", true).0);
        assert!(!public_counts(2, &rows, me, "after_close", false).0);
        assert!(public_counts(2, &rows, "x", "always", false).0);
        // votes for an option that does not exist are ignored
        let (_, _, counts, total) = public_counts(1, &[(5, "a".into())], "", "always", false);
        assert_eq!((counts, total), (vec![(0, 0)], 0));
    }

    #[test]
    fn visitors_are_counted_apart_from_named_voters() {
        let rows = [
            ("u1", "visitor"),
            ("u1", "visitor"),
            ("u2", "anna"),
            ("u3", "visitor"),
        ];
        assert_eq!(visitor_count(rows.iter().copied()), 2);
        assert!(is_visitor("visitor") && !is_visitor("anna"));
    }

    const POLL: &str = "00000000-0000-0000-0000-0000000000b1";
    const BROWSER: &str = "0f8fad5b-d9cb-469f-a165-70867728950e";

    /// A public host: the poll shows results always; `voted` rows of this browser, `voters` distinct voters in all.
    fn public_host(voted: i64, voters: i64) -> MockHost {
        MockHost::new().as_public(POLL).on("db.query", move |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            if sql.contains("current_date") {
                Ok(json!([{ "d": "2026-10-20" }]))
            } else if sql.contains("from polls") {
                Ok(json!([{ "question": "Lunch?", "details": "", "options": "[\"Pizza\",\"Sushi\"]", "multiple": false, "hide_voters": false, "results": "always", "closed": false, "closes_on": null }]))
            } else if sql.contains("count(distinct") {
                Ok(json!([{ "n": voters }]))
            } else if sql.contains("count(*)") {
                Ok(json!([{ "n": voted }]))
            } else {
                Ok(json!([{ "i": 0, "id": BROWSER }]))
            }
        })        .on("db.exec", |_| Ok(json!(1)))
    }

    #[test]
    fn a_visitor_reads_the_poll_of_the_link() {
        let reg = __msk_registry();
        let out = public_host(0, 0)
            .command(&reg, "public_poll", json!({ "browser": BROWSER }))
            .unwrap();
        assert_eq!(out["question"], "Lunch?");
        assert_eq!(out["visible"], true);
        assert_eq!(out["voted"], true);
        assert_eq!(out["options"][0]["votes"], 1);
        assert!(public_host(0, 0)
            .command(&reg, "public_poll", json!({ "browser": "nope" }))
            .is_err());
    }

    #[test]
    fn a_visitor_votes_once_and_within_the_limits() {
        let reg = __msk_registry();
        let vote = |host: MockHost, args: Value| host.command(&reg, "public_vote", args);
        let good = json!({ "browser": BROWSER, "choices": [0], "website": "" });
        assert!(vote(public_host(0, 0), good.clone()).is_ok());
        let e = vote(public_host(2, 0), good.clone()).unwrap_err();
        assert!(e.contains("already voted"), "{e}");
        let e = vote(public_host(0, MAX_VOTERS), good.clone()).unwrap_err();
        assert!(e.contains("most voters"), "{e}");
        let mut spam = good.clone();
        spam["website"] = json!("http://x");
        assert!(vote(public_host(0, 0), spam).is_err());
        let bad_browser = json!({ "browser": "x", "choices": [0] });
        assert!(vote(public_host(0, 0), bad_browser).is_err());
        let two = json!({ "browser": BROWSER, "choices": [0, 1] });
        assert!(vote(public_host(0, 0), two)
            .unwrap_err()
            .contains("one choice"));
        let none = json!({ "browser": BROWSER, "choices": [] });
        assert!(vote(public_host(0, 0), none).is_err());
    }
}
