//! Approvals plugin: a request that one or more people must approve or reject, with the history of who decided what.
//! The rules of a request are a hook (title, details, approvers fixed at creation, mode). The approvers decide with the
//! command `requests.decide` (the table `decisions` is one a reader writes, see `[[tables]]` in the manifest: the row is
//! the person's own and final). The state of a request is never stored: `compute` derives it from the request and its
//! decisions, and `requests.status` and `requests.overview` answer with it.

use mosaikit_plugin_sdk::prelude::*;
use mosaikit_plugin_sdk::serde_json;

const MODES: [&str; 3] = ["any", "all", "sequence"];
/// Limits, in characters (and people).
const MAX_TITLE: usize = 160;
const MAX_DETAILS: usize = 4000;
const MAX_AMOUNT: usize = 80;
const MAX_NAME: usize = 120;
const MAX_COMMENT: usize = 1000;
const MAX_APPROVERS: usize = 10;

#[derive(Debug, Clone, PartialEq)]
struct Approver {
    id: String,
    name: String,
}

#[derive(Debug, Clone, PartialEq)]
struct Decision {
    user_id: String,
    verdict: String,
    comment: String,
    at: String,
}

/// The state of a request and its approvers, each `{id, name, verdict, comment, decided_at, waiting}`.
#[derive(Debug, Clone, PartialEq)]
struct Computed {
    state: &'static str,
    approvers: Vec<Value>,
}

fn uuid_like(s: &str) -> bool {
    s.len() == 36
        && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
        && s.matches('-').count() == 4
}

/// Reads the JSON of the field `approvers`: a list of 1 to 10 people with an id and a name, no id twice.
fn parse_approvers(raw: &str) -> std::result::Result<Vec<Approver>, Error> {
    let bad = |m: &str| Error::coded("approvers_invalid", m.to_string());
    let list: Vec<Value> =
        serde_json::from_str(raw).map_err(|_| bad("the approvers are not a valid list"))?;
    if list.is_empty() {
        return Err(Error::coded(
            "approvers_empty",
            "choose at least one approver",
        ));
    }
    if list.len() > MAX_APPROVERS {
        return Err(Error::coded(
            "approvers_many",
            format!("a request has at most {MAX_APPROVERS} approvers"),
        ));
    }
    let mut out: Vec<Approver> = Vec::new();
    for p in &list {
        let id = p
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_lowercase();
        let name: String = p
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .chars()
            .take(MAX_NAME)
            .collect();
        if !uuid_like(&id) || name.is_empty() {
            return Err(bad("each approver needs an id and a name"));
        }
        if out.iter().any(|a| a.id == id) {
            return Err(Error::coded(
                "approvers_twice",
                "an approver is listed twice",
            ));
        }
        out.push(Approver { id, name });
    }
    Ok(out)
}

fn approvers_json(list: &[Approver]) -> String {
    Value::Array(
        list.iter()
            .map(|a| json!({ "id": a.id, "name": a.name }))
            .collect(),
    )
    .to_string()
}

fn request(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let title: String = v.str("title").trim().chars().take(MAX_TITLE).collect();
    if title.is_empty() {
        return Err(Error::coded(
            "request_title_empty",
            "a request needs a title",
        ));
    }
    v.set("title", title);
    if v.str("details").chars().count() > MAX_DETAILS {
        return Err(Error::coded(
            "request_too_long",
            format!("the details of a request have at most {MAX_DETAILS} characters"),
        ));
    }
    let amount: String = v.str("amount").trim().to_string();
    if amount.chars().count() > MAX_AMOUNT {
        return Err(Error::coded(
            "request_amount",
            format!("the amount has at most {MAX_AMOUNT} characters"),
        ));
    }
    v.set("amount", amount);
    let mode = v.str("mode");
    if mode.is_empty() {
        v.set("mode", "all");
    } else if !MODES.contains(&mode.as_str()) {
        return Err(Error::coded(
            "request_mode",
            "the mode is any, all or sequence",
        ));
    }
    let approvers = parse_approvers(&v.str("approvers"))?;
    v.set("approvers", approvers_json(&approvers));
    // the people who decide are fixed at creation: decisions already given would lose their meaning
    if let Some(prev) = &hook.previous {
        let before: Option<Vec<Approver>> = parse_approvers(&prev.str("approvers")).ok();
        if before.is_some_and(|b| b != approvers)
            || (!prev.str("mode").is_empty() && prev.str("mode") != v.str("mode"))
        {
            return Err(Error::coded(
                "approvers_fixed",
                "the approvers and the mode cannot change after the request is created",
            ));
        }
        if prev.bool("cancelled") && !v.bool("cancelled") {
            return Err(Error::coded(
                "request_cancelled",
                "a cancelled request stays cancelled",
            ));
        }
    }
    Ok(Some(v))
}

/// The state of a request from its approvers, mode, the flag `cancelled` and the decisions (pure: no database).
/// A request that is approved or rejected is final, even if it was cancelled afterwards.
/// `all`: everybody approves, one rejection closes it. `any`: one approval is enough, it is rejected when all rejected.
/// `sequence`: one after the other in the listed order, a rejection closes it.
fn compute(
    approvers: &[Approver],
    mode: &str,
    cancelled: bool,
    decisions: &[Decision],
) -> Computed {
    let verdict_of = |id: &str| decisions.iter().find(|d| d.user_id == id);
    let approved = |id: &str| verdict_of(id).is_some_and(|d| d.verdict == "approved");
    let rejected = |id: &str| verdict_of(id).is_some_and(|d| d.verdict == "rejected");
    let n = approvers.len();
    let yes = approvers.iter().filter(|a| approved(&a.id)).count();
    let no = approvers.iter().filter(|a| rejected(&a.id)).count();
    let verdict = match mode {
        "any" if yes > 0 => "approved",
        "any" if no == n && n > 0 => "rejected",
        "sequence" => {
            // the first approver who has not approved decides how it stands
            match approvers.iter().find(|a| !approved(&a.id)) {
                None if n > 0 => "approved",
                Some(a) if rejected(&a.id) => "rejected",
                _ => "pending",
            }
        }
        "any" => "pending",
        _ if no > 0 => "rejected",
        _ if yes == n && n > 0 => "approved",
        _ => "pending",
    };
    let state = match verdict {
        "pending" if cancelled => "cancelled",
        v => v,
    };
    // whose turn it is: everybody still undecided, or in a sequence only the first of them
    let next = approvers.iter().position(|a| verdict_of(&a.id).is_none());
    let list = approvers
        .iter()
        .enumerate()
        .map(|(i, a)| {
            let d = verdict_of(&a.id);
            let waiting =
                state == "pending" && d.is_none() && (mode != "sequence" || next == Some(i));
            json!({
                "id": a.id,
                "name": a.name,
                "verdict": d.map(|d| d.verdict.clone()),
                "comment": d.map(|d| d.comment.clone()).unwrap_or_default(),
                "decided_at": d.map(|d| d.at.clone()),
                "waiting": waiting,
            })
        })
        .collect();
    Computed {
        state,
        approvers: list,
    }
}

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

fn decision_of(r: &Value) -> Decision {
    Decision {
        user_id: text(r, "user_id"),
        verdict: text(r, "verdict"),
        comment: text(r, "comment"),
        at: text(r, "at"),
    }
}

const DECISIONS_SQL: &str = "select resource_id::text as id, user_id::text as user_id, verdict, comment, decided_at::text as at from decisions";

fn compute_row(r: &Value, decisions: &[Decision]) -> Computed {
    let list = parse_approvers(&text(r, "approvers")).unwrap_or_default();
    let mode = text(r, "mode");
    compute(
        &list,
        if mode.is_empty() { "all" } else { &mode },
        flag(r, "cancelled"),
        decisions,
    )
}

fn id_arg(args: &Value) -> Result<String> {
    let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
    if id.is_empty() {
        return Err(Error::coded("request_missing", "which request?"));
    }
    Ok(id.to_string())
}

/// The state of one request.
fn status(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = id_arg(&args)?;
    let rows = ctx.db().query(
        "select approvers, mode, cancelled from requests where resource_id = $1::uuid",
        &[json!(id)],
    )?;
    let Some(r) = rows.first() else {
        return Err(Error::coded(
            "request_missing",
            "the request does not exist",
        ));
    };
    let ds = ctx.db().query(
        &format!("{DECISIONS_SQL} where resource_id = $1::uuid order by decided_at"),
        &[json!(id)],
    )?;
    let decisions: Vec<Decision> = ds.iter().map(decision_of).collect();
    let c = compute_row(r, &decisions);
    Ok(json!({ "state": c.state, "mode": text(r, "mode"), "approvers": c.approvers }))
}

/// Whether it is the turn of `user` to decide on a request in this state.
fn is_todo(c: &Computed, user: &str) -> bool {
    c.state == "pending"
        && c.approvers.iter().any(|a| {
            text(a, "id") == user && a.get("waiting").and_then(Value::as_bool) == Some(true)
        })
}

/// Counts for the widget: (requests whose turn is that of `user`, requests of `user` still pending). `reqs` carry
/// `id`, `owner`, `approvers`, `mode` and `cancelled`; `ds` are all the decisions (with `id`).
fn decide_counts(reqs: &[Value], ds: &[Value], user: &str) -> (i64, i64) {
    let (mut todo, mut mine_pending) = (0, 0);
    for r in reqs {
        let id = text(r, "id");
        let mine: Vec<Decision> = ds
            .iter()
            .filter(|d| text(d, "id") == id)
            .map(decision_of)
            .collect();
        let c = compute_row(r, &mine);
        if is_todo(&c, user) {
            todo += 1;
        }
        if c.state == "pending" && !user.is_empty() && text(r, "owner") == user {
            mine_pending += 1;
        }
    }
    (todo, mine_pending)
}

/// Widget `to-decide`: the requests waiting for the decision of the caller and the requests of the caller still pending.
fn widget_to_decide(ctx: &Ctx, _args: Value) -> Result<Value> {
    let user = ctx.user.clone().unwrap_or_default();
    let reqs = ctx.db().query(
        "select r.resource_id::text as id, v.owner_id::text as owner, r.approvers, r.mode, r.cancelled \
         from requests r join core.visible_resources v on v.id = r.resource_id where v.kind = 'requests'",
        &[],
    )?;
    let ds = ctx
        .db()
        .query(&format!("{DECISIONS_SQL} order by decided_at"), &[])?;
    let (todo, mine_pending) = decide_counts(&reqs, &ds, &user);
    Ok(json!({
        "value": todo,
        "secondary": mine_pending,
        "tone": if todo > 0 { "warn" } else { "" },
    }))
}

/// For the list: the state of every request the caller sees, and whether the caller still has to decide (`todo`).
fn overview(ctx: &Ctx, _args: Value) -> Result<Value> {
    let user = ctx.user.clone().unwrap_or_default();
    let reqs = ctx.db().query(
        "select resource_id::text as id, approvers, mode, cancelled from requests",
        &[],
    )?;
    let ds = ctx
        .db()
        .query(&format!("{DECISIONS_SQL} order by decided_at"), &[])?;
    let mut out = Vec::new();
    for r in &reqs {
        let id = text(r, "id");
        let mine: Vec<Decision> = ds
            .iter()
            .filter(|d| text(d, "id") == id)
            .map(decision_of)
            .collect();
        let c = compute_row(r, &mine);
        let todo = is_todo(&c, &user);
        out.push(json!({ "id": id, "state": c.state, "todo": todo, "approvers": c.approvers }));
    }
    Ok(json!({ "requests": out }))
}

/// The caller approves or rejects the request `id`, once: the decision is final.
fn decide(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = id_arg(&args)?;
    let verdict = args
        .get("verdict")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if verdict != "approved" && verdict != "rejected" {
        return Err(Error::coded(
            "verdict_invalid",
            "decide approved or rejected",
        ));
    }
    let comment: String = args
        .get("comment")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if comment.chars().count() > MAX_COMMENT {
        return Err(Error::coded(
            "comment_too_long",
            format!("a comment has at most {MAX_COMMENT} characters"),
        ));
    }
    if verdict == "rejected" && comment.is_empty() {
        return Err(Error::coded(
            "comment_required",
            "say why you reject the request",
        ));
    }
    let user = ctx
        .user
        .clone()
        .ok_or_else(|| Error::coded("not_signed_in", "sign in to decide a request"))?;
    let rows = ctx.db().query(
        "select approvers, mode, cancelled from requests where resource_id = $1::uuid",
        &[json!(id)],
    )?;
    let Some(r) = rows.first() else {
        return Err(Error::coded(
            "request_missing",
            "the request does not exist",
        ));
    };
    let ds = ctx.db().query(
        &format!("{DECISIONS_SQL} where resource_id = $1::uuid order by decided_at"),
        &[json!(id)],
    )?;
    let decisions: Vec<Decision> = ds.iter().map(decision_of).collect();
    let c = compute_row(r, &decisions);
    check_turn(&c, &user)?;
    let tenant = ctx.tenant.clone().unwrap_or_default();
    let name = c
        .approvers
        .iter()
        .find(|a| text(a, "id") == user)
        .map(|a| text(a, "name"))
        .unwrap_or_else(|| ctx.username.clone().unwrap_or_else(|| user.clone()));
    // the row is accepted only as the caller's own (policies of the table)
    let n = ctx.db().exec(
        "insert into decisions (resource_id, tenant_id, user_id, user_name, verdict, comment) values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6) on conflict (resource_id, user_id) do nothing",
        &[json!(id), json!(tenant), json!(user), json!(name), json!(verdict), json!(comment)],
    )?;
    if n == 0 {
        return Err(Error::coded(
            "already_decided",
            "you have already decided this request",
        ));
    }
    Ok(json!({ "decided": true }))
}

/// Whether `user` may decide now on the request with this computed state.
fn check_turn(c: &Computed, user: &str) -> Result<()> {
    if c.state == "cancelled" {
        return Err(Error::coded(
            "request_cancelled",
            "the request was cancelled",
        ));
    }
    let mine = c.approvers.iter().find(|a| text(a, "id") == user);
    let Some(mine) = mine else {
        return Err(Error::coded(
            "not_approver",
            "you are not an approver of this request",
        ));
    };
    if !mine.get("verdict").is_none_or(Value::is_null) {
        return Err(Error::coded(
            "already_decided",
            "you have already decided this request",
        ));
    }
    if c.state != "pending" {
        return Err(Error::coded(
            "request_closed",
            "the request is already decided",
        ));
    }
    if mine.get("waiting").and_then(Value::as_bool) != Some(true) {
        return Err(Error::coded(
            "not_your_turn",
            "an earlier approver has not decided yet",
        ));
    }
    Ok(())
}

/// The rules for changing the approvers of an open request (pure): the request is still pending, everybody who already
/// decided stays, and in a sequence the people who decided stay first and in the same order.
fn check_change(
    old: &[Approver],
    new: &[Approver],
    mode: &str,
    state: &str,
    decisions: &[Decision],
) -> Result<()> {
    if state != "pending" {
        return Err(Error::coded(
            "request_closed",
            "only an open request can change its approvers",
        ));
    }
    let decided: Vec<&Approver> = old
        .iter()
        .filter(|a| decisions.iter().any(|d| d.user_id == a.id))
        .collect();
    if decided.iter().any(|a| !new.iter().any(|n| n.id == a.id)) {
        return Err(Error::coded(
            "approver_decided",
            "an approver who already decided cannot be removed",
        ));
    }
    if mode == "sequence"
        && decided
            .iter()
            .enumerate()
            .any(|(i, a)| new.get(i).map(|n| &n.id) != Some(&a.id))
    {
        return Err(Error::coded(
            "approver_order",
            "in a sequence the people who decided stay first, in the same order",
        ));
    }
    if old == new {
        return Err(Error::coded(
            "approvers_same",
            "the approvers are the same as before",
        ));
    }
    Ok(())
}

/// The caller (who writes the request) changes the approvers of an open request; the change is kept in `approver_changes`.
fn set_approvers(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = id_arg(&args)?;
    let user = ctx
        .user
        .clone()
        .ok_or_else(|| Error::coded("not_signed_in", "sign in to change the approvers"))?;
    let level = ctx
        .db()
        .query_one("select core.level_of($1::uuid) as l", &[json!(id)])?
        .and_then(|r| r.get("l").and_then(Value::as_i64))
        .unwrap_or(0);
    if level < 2 {
        return Err(Error::coded(
            "permission_denied",
            "only a person who can edit the request changes its approvers",
        ));
    }
    let new = parse_approvers(
        args.get("approvers")
            .and_then(Value::as_str)
            .unwrap_or_default(),
    )?;
    let rows = ctx.db().query(
        "select approvers, mode, cancelled from requests where resource_id = $1::uuid",
        &[json!(id)],
    )?;
    let Some(r) = rows.first() else {
        return Err(Error::coded(
            "request_missing",
            "the request does not exist",
        ));
    };
    let ds = ctx.db().query(
        &format!("{DECISIONS_SQL} where resource_id = $1::uuid order by decided_at"),
        &[json!(id)],
    )?;
    let decisions: Vec<Decision> = ds.iter().map(decision_of).collect();
    let c = compute_row(r, &decisions);
    let old = parse_approvers(&text(r, "approvers")).unwrap_or_default();
    let mode = text(r, "mode");
    let mode = if mode.is_empty() {
        "all"
    } else {
        mode.as_str()
    };
    check_change(&old, &new, mode, c.state, &decisions)?;
    let tenant = ctx.tenant.clone().unwrap_or_default();
    let name = ctx.username.clone().unwrap_or_else(|| user.clone());
    let after = approvers_json(&new);
    ctx.db().exec(
        "update requests set approvers = $1 where resource_id = $2::uuid",
        &[json!(after), json!(id)],
    )?;
    ctx.db().exec(
        "insert into approver_changes (resource_id, tenant_id, user_id, user_name, old_list, new_list) values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)",
        &[json!(id), json!(tenant), json!(user), json!(name), json!(approvers_json(&old)), json!(after)],
    )?;
    Ok(json!({ "changed": true }))
}

/// The changes of the approvers of one request, first to last, each `{by, at, added, removed}` (names).
fn approver_log(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = id_arg(&args)?;
    let rows = ctx.db().query(
        "select user_name as who, changed_at::text as at, old_list, new_list from approver_changes where resource_id = $1::uuid order by changed_at, n",
        &[json!(id)],
    )?;
    let names = |list: &[Approver], other: &[Approver]| -> Vec<String> {
        list.iter()
            .filter(|x| !other.iter().any(|o| o.id == x.id))
            .map(|x| x.name.clone())
            .collect()
    };
    let out: Vec<Value> = rows
        .iter()
        .map(|r| {
            let b = parse_approvers(&text(r, "old_list")).unwrap_or_default();
            let a = parse_approvers(&text(r, "new_list")).unwrap_or_default();
            json!({ "by": text(r, "who"), "at": text(r, "at"), "added": names(&a, &b), "removed": names(&b, &a) })
        })
        .collect();
    Ok(Value::Array(out))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "requests.before_create" => request,
        "requests.before_update" => request,
    },
    commands: {
        "requests.set_approvers" => set_approvers,
        "requests.approver_log" => approver_log,
        "requests.decide" => decide,
        "requests.status" => status,
        "requests.overview" => overview,
        "requests.widget_to_decide" => widget_to_decide,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    const A: &str = "11111111-1111-1111-1111-111111111111";
    const B: &str = "22222222-2222-2222-2222-222222222222";
    const C: &str = "33333333-3333-3333-3333-333333333333";

    fn people(ids: &[&str]) -> String {
        Value::Array(
            ids.iter()
                .map(|i| json!({ "id": i, "name": format!("P{}", &i[..1]) }))
                .collect(),
        )
        .to_string()
    }

    fn run(values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), "before_create", "requests", values)
    }

    fn ok(extra: Value) -> Value {
        let mut v = json!({ "title": "Laptop", "approvers": people(&[A]) });
        for (k, x) in extra.as_object().unwrap() {
            v[k] = x.clone();
        }
        v
    }

    #[test]
    fn a_request_is_trimmed_and_every_one_must_approve_by_default() {
        let v = run(ok(json!({ "title": "  Laptop  " }))).unwrap().unwrap();
        assert_eq!(v.str("title"), "Laptop");
        assert_eq!(v.str("mode"), "all");
        assert!(run(ok(json!({ "title": "  " })))
            .unwrap_err()
            .contains("title"));
    }

    #[test]
    fn the_texts_and_the_mode_have_limits() {
        assert!(
            run(ok(json!({ "title": "é".repeat(MAX_TITLE + 40) })))
                .unwrap()
                .unwrap()
                .str("title")
                .chars()
                .count()
                == MAX_TITLE
        );
        assert!(run(ok(json!({ "details": "é".repeat(MAX_DETAILS) }))).is_ok());
        assert!(run(ok(json!({ "details": "é".repeat(MAX_DETAILS + 1) })))
            .unwrap_err()
            .contains("at most"));
        assert!(run(ok(json!({ "mode": "sequence" }))).is_ok());
        assert!(run(ok(json!({ "mode": "majority" })))
            .unwrap_err()
            .contains("sequence"));
    }

    #[test]
    fn the_approvers_are_a_valid_list() {
        assert!(run(json!({ "title": "x" })).is_err());
        assert!(run(ok(json!({ "approvers": "nope" })))
            .unwrap_err()
            .contains("not a valid list"));
        assert!(run(ok(json!({ "approvers": "[]" })))
            .unwrap_err()
            .contains("at least one"));
        assert!(run(ok(json!({ "approvers": people(&[A, A]) })))
            .unwrap_err()
            .contains("twice"));
        assert!(
            run(ok(json!({ "approvers": r#"[{"id":"abc","name":"X"}]"# })))
                .unwrap_err()
                .contains("id and a name")
        );
        assert!(run(ok(
            json!({ "approvers": format!(r#"[{{"id":"{A}","name":" "}}]"#) })
        ))
        .is_err());
        let many: Vec<String> = (0..11)
            .map(|i| format!("{:08}-1111-1111-1111-111111111111", i))
            .collect();
        let many: Vec<&str> = many.iter().map(String::as_str).collect();
        assert!(run(ok(json!({ "approvers": people(&many) })))
            .unwrap_err()
            .contains("at most 10"));
        assert!(run(ok(json!({ "approvers": people(&many[..10]) }))).is_ok());
    }

    #[test]
    fn the_approvers_cannot_change_after_creation() {
        let host = MockHost::new();
        let prev = json!({ "title": "x", "mode": "all", "approvers": people(&[A]) });
        let same = host.hook_with_previous(
            &__msk_registry(),
            "before_update",
            "requests",
            ok(json!({ "mode": "all" })),
            prev.clone(),
        );
        assert!(same.is_ok());
        let other = host.hook_with_previous(
            &__msk_registry(),
            "before_update",
            "requests",
            ok(json!({ "mode": "all", "approvers": people(&[B]) })),
            prev.clone(),
        );
        assert!(other.unwrap_err().contains("cannot change"));
        let mode = host.hook_with_previous(
            &__msk_registry(),
            "before_update",
            "requests",
            ok(json!({ "mode": "any" })),
            prev,
        );
        assert!(mode.unwrap_err().contains("cannot change"));
    }

    fn ap(ids: &[&str]) -> Vec<Approver> {
        ids.iter()
            .map(|i| Approver {
                id: i.to_string(),
                name: format!("P{}", &i[..1]),
            })
            .collect()
    }
    fn d(user: &str, verdict: &str) -> Decision {
        Decision {
            user_id: user.into(),
            verdict: verdict.into(),
            comment: String::new(),
            at: "2026-05-01".into(),
        }
    }
    fn waiting(c: &Computed) -> Vec<bool> {
        c.approvers
            .iter()
            .map(|a| a["waiting"].as_bool().unwrap())
            .collect()
    }

    #[test]
    fn mode_all_needs_everybody_and_one_rejection_closes_it() {
        let p = ap(&[A, B]);
        assert_eq!(compute(&p, "all", false, &[]).state, "pending");
        assert_eq!(
            compute(&p, "all", false, &[d(A, "approved")]).state,
            "pending"
        );
        let both = compute(&p, "all", false, &[d(A, "approved"), d(B, "approved")]);
        assert_eq!(both.state, "approved");
        assert_eq!(waiting(&both), [false, false]);
        assert_eq!(
            compute(&p, "all", false, &[d(B, "rejected")]).state,
            "rejected"
        );
        // everybody who has not decided is up
        assert_eq!(
            waiting(&compute(&p, "all", false, &[d(A, "approved")])),
            [false, true]
        );
    }

    #[test]
    fn mode_any_is_approved_by_one_and_rejected_by_all() {
        let p = ap(&[A, B, C]);
        assert_eq!(compute(&p, "any", false, &[]).state, "pending");
        assert_eq!(
            compute(&p, "any", false, &[d(B, "approved")]).state,
            "approved"
        );
        assert_eq!(
            compute(&p, "any", false, &[d(A, "rejected")]).state,
            "pending"
        );
        assert_eq!(
            compute(&p, "any", false, &[d(A, "rejected"), d(B, "rejected")]).state,
            "pending"
        );
        assert_eq!(
            compute(
                &p,
                "any",
                false,
                &[d(A, "rejected"), d(B, "rejected"), d(C, "rejected")]
            )
            .state,
            "rejected"
        );
        assert_eq!(
            compute(&p, "any", false, &[d(A, "rejected"), d(C, "approved")]).state,
            "approved"
        );
    }

    #[test]
    fn mode_sequence_goes_in_order_and_only_the_next_one_waits() {
        let p = ap(&[A, B, C]);
        let c = compute(&p, "sequence", false, &[]);
        assert_eq!(
            (c.state, waiting(&c)),
            ("pending", vec![true, false, false])
        );
        let c = compute(&p, "sequence", false, &[d(A, "approved")]);
        assert_eq!(
            (c.state, waiting(&c)),
            ("pending", vec![false, true, false])
        );
        // a later person who decided out of turn does not skip the one before
        assert_eq!(
            compute(&p, "sequence", false, &[d(C, "approved")]).state,
            "pending"
        );
        assert_eq!(
            compute(
                &p,
                "sequence",
                false,
                &[d(A, "approved"), d(B, "approved"), d(C, "approved")]
            )
            .state,
            "approved"
        );
        let r = compute(&p, "sequence", false, &[d(A, "approved"), d(B, "rejected")]);
        assert_eq!(
            (r.state, waiting(&r)),
            ("rejected", vec![false, false, false])
        );
    }

    #[test]
    fn a_cancelled_request_is_cancelled_unless_it_was_already_decided() {
        let p = ap(&[A, B]);
        let c = compute(&p, "all", true, &[d(A, "approved")]);
        assert_eq!(c.state, "cancelled");
        assert_eq!(waiting(&c), [false, false]);
        assert_eq!(
            compute(&p, "all", true, &[d(A, "rejected")]).state,
            "rejected"
        );
        assert_eq!(
            compute(&ap(&[A]), "all", true, &[d(A, "approved")]).state,
            "approved"
        );
    }

    #[test]
    fn the_approver_list_carries_verdict_comment_and_time() {
        let mut x = d(A, "rejected");
        x.comment = "too dear".into();
        let c = compute(&ap(&[A, B]), "all", false, &[x]);
        assert_eq!(c.approvers[0]["verdict"], "rejected");
        assert_eq!(c.approvers[0]["comment"], "too dear");
        assert_eq!(c.approvers[0]["decided_at"], "2026-05-01");
        assert!(c.approvers[1]["verdict"].is_null());
    }

    #[test]
    fn who_may_decide_now() {
        let p = ap(&[A, B]);
        let pending = compute(&p, "sequence", false, &[]);
        assert!(check_turn(&pending, A).is_ok());
        assert!(check_turn(&pending, B)
            .unwrap_err()
            .to_string()
            .contains("earlier"));
        assert!(check_turn(&pending, C)
            .unwrap_err()
            .to_string()
            .contains("not an approver"));
        let after_a = compute(&p, "sequence", false, &[d(A, "approved")]);
        assert!(check_turn(&after_a, A)
            .unwrap_err()
            .to_string()
            .contains("already decided"));
        assert!(check_turn(&after_a, B).is_ok());
        let closed = compute(&p, "any", false, &[d(A, "approved")]);
        assert!(check_turn(&closed, B)
            .unwrap_err()
            .to_string()
            .contains("already decided"));
        let cancelled = compute(&p, "all", true, &[]);
        assert!(check_turn(&cancelled, A)
            .unwrap_err()
            .to_string()
            .contains("cancelled"));
    }

    #[test]
    fn the_commands_are_registered() {
        let names = __msk_registry().command_names();
        for c in [
            "requests.decide",
            "requests.status",
            "requests.overview",
            "requests.widget_to_decide",
        ] {
            assert!(names.contains(&c), "{c}");
        }
    }

    fn req(id: &str, owner: &str, approvers: &[&str], mode: &str) -> Value {
        json!({ "id": id, "owner": owner, "approvers": people(approvers), "mode": mode, "cancelled": false })
    }

    #[test]
    fn the_widget_counts_my_turns_and_my_pending_requests() {
        let reqs = vec![
            // A and B approve, owned by C
            req("r1", C, &[A, B], "all"),
            // a sequence where B goes first: A waits
            req("r2", C, &[B, A], "sequence"),
            // owned by A, still pending
            req("r3", A, &[B], "all"),
            // owned by A, already approved
            req("r4", A, &[B], "any"),
        ];
        let ds = vec![
            json!({ "id": "r4", "user_id": B, "verdict": "approved", "comment": "", "at": "t" }),
            json!({ "id": "r1", "user_id": B, "verdict": "approved", "comment": "", "at": "t" }),
        ];
        // A: r1 is the turn of A, r2 is not; r3 is owned and pending, r4 is done
        assert_eq!(decide_counts(&reqs, &ds, A), (1, 1));
        // B: r2 is the turn of B, r3 too (r1 and r4 are decided by B)
        assert_eq!(decide_counts(&reqs, &ds, B), (2, 0));
        assert_eq!(decide_counts(&[], &[], A), (0, 0));
        assert_eq!(decide_counts(&reqs, &ds, ""), (0, 0));
    }

    #[test]
    fn the_widget_is_amber_when_something_waits() {
        // the default user of the mock host is the approver
        let me = "00000000-0000-0000-0000-000000000001";
        let list = people(&[me]);
        let host = MockHost::new().on("db.query", move |req| {
            if req["sql"].as_str().unwrap_or_default().contains("from decisions") {
                Ok(json!([]))
            } else {
                Ok(json!([{ "id": "r1", "owner": "x", "approvers": list, "mode": "all", "cancelled": false }]))
            }
        });
        let out = host
            .command(&__msk_registry(), "requests.widget_to_decide", json!({}))
            .unwrap();
        assert_eq!(out, json!({ "value": 1, "secondary": 0, "tone": "warn" }));
    }
}

#[cfg(test)]
mod change_tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    const A: &str = "11111111-1111-1111-1111-111111111111";
    const B: &str = "22222222-2222-2222-2222-222222222222";
    const C: &str = "33333333-3333-3333-3333-333333333333";

    fn ap(ids: &[&str]) -> Vec<Approver> {
        ids.iter()
            .map(|i| Approver {
                id: i.to_string(),
                name: format!("P{}", &i[..1]),
            })
            .collect()
    }

    fn d(user: &str) -> Decision {
        Decision {
            user_id: user.into(),
            verdict: "approved".into(),
            comment: String::new(),
            at: String::new(),
        }
    }

    #[test]
    fn approvers_change_only_on_an_open_request_and_decided_ones_stay() {
        let old = ap(&[A, B]);
        let ds = vec![d(A)];
        assert!(check_change(&old, &ap(&[A, B, C]), "all", "pending", &ds).is_ok());
        assert!(check_change(&old, &ap(&[A, C]), "all", "pending", &ds).is_ok());
        assert!(check_change(&old, &ap(&[B, C]), "all", "pending", &ds)
            .unwrap_err()
            .to_string()
            .contains("already decided"));
        assert!(check_change(&old, &ap(&[A, C]), "all", "approved", &ds).is_err());
        assert!(check_change(&old, &ap(&[A, C]), "all", "cancelled", &ds).is_err());
        assert!(check_change(&old, &old, "all", "pending", &ds).is_err());
    }

    #[test]
    fn in_a_sequence_the_people_who_decided_stay_first() {
        let old = ap(&[A, B, C]);
        let ds = vec![d(A)];
        assert!(check_change(&old, &ap(&[A, C, B]), "sequence", "pending", &ds).is_ok());
        assert!(
            check_change(&old, &ap(&[B, A, C]), "sequence", "pending", &ds)
                .unwrap_err()
                .to_string()
                .contains("stay first")
        );
        assert!(check_change(&old, &ap(&[B, A, C]), "all", "pending", &ds).is_ok());
    }

    #[test]
    fn the_log_names_who_was_added_and_removed() {
        let names = __msk_registry().command_names();
        assert!(names.contains(&"requests.set_approvers"));
        let (b, a) = (approvers_json(&ap(&[A, B])), approvers_json(&ap(&[A, C])));
        let host = MockHost::new().on("db.query", move |_| {
            Ok(json!([{ "who": "ann", "at": "2026-11-13", "old_list": b, "new_list": a }]))
        });
        let out = host
            .command(
                &__msk_registry(),
                "requests.approver_log",
                json!({ "id": A }),
            )
            .unwrap();
        assert_eq!(out[0]["added"], json!(["P3"]));
        assert_eq!(out[0]["removed"], json!(["P2"]));
        assert_eq!(out[0]["by"], "ann");
    }
}
