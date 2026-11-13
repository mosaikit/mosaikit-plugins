//! Forms plugin: a form builder with a public link. A form keeps its fields as a JSON array in the hidden field `fields`;
//! the hook checks them. A signed-in person answers with `forms.submit`, anyone holding a public link of the form with the
//! public command `forms.public_submit` (the table `answers` is one a reader and a visitor write, see `[[tables]]` in the
//! manifest). Both go through the same pure function, `validate_answer`. `forms.results` gives the answers and the per-field
//! counts to people with write level; a visitor never reads an answer, nor the number of them.

use mosaikit_plugin_sdk::prelude::*;
use mosaikit_plugin_sdk::serde_json::{self, Map};
use std::collections::BTreeSet;

const MAX_TITLE: usize = 160;
const MAX_INTRO: usize = 4000;
const MAX_THANKS: usize = 500;
const MAX_FIELDS: usize = 30;
const MAX_LABEL: usize = 120;
const MAX_HELP: usize = 200;
const MAX_OPTION: usize = 100;
const MAX_ID: usize = 40;
const MIN_OPTIONS: usize = 2;
const MAX_OPTIONS: usize = 12;
const MAX_TEXT: usize = 200;
const MAX_LONG: usize = 2000;
const MAX_NUMBER: usize = 20;
const MAX_BODY: usize = 8 * 1024;
const DEFAULT_MAX_ANSWERS: i64 = 1000;
const TOP_MAX_ANSWERS: i64 = 5000;
const RESULT_ROWS: i64 = 5000;
const KINDS: [&str; 7] = [
    "text", "longtext", "choice", "multi", "number", "date", "email",
];

/// One field of a form, as stored.
#[derive(Debug, Clone, PartialEq)]
struct Field {
    id: String,
    label: String,
    kind: String,
    options: Vec<String>,
    required: bool,
    help: String,
    /// Shown only when an earlier field was answered with one of these options.
    show_if: Option<ShowIf>,
}

/// A condition of a field: the earlier choice or multi field `field` has one of the options in `any_of` among its answers.
#[derive(Debug, Clone, PartialEq)]
struct ShowIf {
    field: String,
    any_of: Vec<String>,
}

impl Field {
    fn has_options(&self) -> bool {
        self.kind == "choice" || self.kind == "multi"
    }

    fn to_json(&self) -> Value {
        let mut o = json!({
            "id": self.id, "label": self.label, "kind": self.kind, "options": self.options,
            "required": self.required, "help": self.help,
        });
        if let Some(c) = &self.show_if {
            o["show_if"] = json!({ "field": c.field, "any_of": c.any_of });
        }
        o
    }
}

fn bad(code: &str, msg: impl Into<String>) -> Error {
    Error::coded(code, msg.into())
}

/// Parses and checks the JSON array of fields. An empty text is an empty list.
fn parse_fields(raw: &str) -> Result<Vec<Field>> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let parsed: Value = serde_json::from_str(raw)
        .map_err(|_| bad("form_fields_invalid", "the fields are not valid"))?;
    let list = parsed
        .as_array()
        .ok_or_else(|| bad("form_fields_invalid", "the fields are not a list"))?;
    if list.len() > MAX_FIELDS {
        return Err(bad(
            "form_too_many_fields",
            format!("a form has at most {MAX_FIELDS} fields"),
        ));
    }
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for (i, f) in list.iter().enumerate() {
        let n = i + 1;
        let id = f.get("id").and_then(Value::as_str).unwrap_or("").trim();
        if id.is_empty() || id.chars().count() > MAX_ID {
            return Err(bad("form_field_id", format!("field {n} has no valid id")));
        }
        if !seen.insert(id.to_string()) {
            return Err(bad(
                "form_field_id",
                format!("field {n} repeats the id of another field"),
            ));
        }
        let label = f
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if label.is_empty() {
            return Err(bad("form_field_label", format!("field {n} needs a label")));
        }
        if label.chars().count() > MAX_LABEL {
            return Err(bad(
                "form_field_label",
                format!("the label of field {n} has at most {MAX_LABEL} characters"),
            ));
        }
        let kind = f.get("kind").and_then(Value::as_str).unwrap_or("");
        if !KINDS.contains(&kind) {
            return Err(bad(
                "form_field_kind",
                format!(
                    "field {n}: the kind is text, longtext, choice, multi, number, date or email"
                ),
            ));
        }
        let help = f
            .get("help")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if help.chars().count() > MAX_HELP {
            return Err(bad(
                "form_field_help",
                format!("the help of field {n} has at most {MAX_HELP} characters"),
            ));
        }
        let mut options: Vec<String> = Vec::new();
        if kind == "choice" || kind == "multi" {
            for o in f
                .get("options")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or(&[])
            {
                let s = o.as_str().unwrap_or("").trim().to_string();
                if s.is_empty() || s.chars().count() > MAX_OPTION {
                    return Err(bad(
                        "form_field_options",
                        format!(
                            "field {n}: every option needs a text of at most {MAX_OPTION} characters"
                        ),
                    ));
                }
                if options.contains(&s) {
                    return Err(bad(
                        "form_field_options",
                        format!("field {n}: an option is repeated"),
                    ));
                }
                options.push(s);
            }
            if options.len() < MIN_OPTIONS || options.len() > MAX_OPTIONS {
                return Err(bad(
                    "form_field_options",
                    format!("field {n} needs from {MIN_OPTIONS} to {MAX_OPTIONS} options"),
                ));
            }
        }
        let show_if = parse_show_if(f.get("show_if"), &out, n)?;
        out.push(Field {
            id: id.to_string(),
            label,
            kind: kind.to_string(),
            options,
            required: f.get("required").and_then(Value::as_bool).unwrap_or(false),
            help,
            show_if,
        });
    }
    Ok(out)
}

/// Reads the condition of field `n` against the fields before it: it must name one of them, a choice or multi field,
/// and list at least one of its options.
fn parse_show_if(raw: Option<&Value>, before: &[Field], n: usize) -> Result<Option<ShowIf>> {
    let Some(c) = raw.filter(|c| !c.is_null()) else {
        return Ok(None);
    };
    let wrong = |m: &str| bad("form_field_branch", format!("field {n}: {m}"));
    let source = c.get("field").and_then(Value::as_str).unwrap_or("");
    let Some(src) = before.iter().find(|f| f.id == source) else {
        return Err(wrong("the condition must use an earlier field"));
    };
    if !src.has_options() {
        return Err(wrong("the condition needs a field with options"));
    }
    let list = c
        .get("any_of")
        .and_then(Value::as_array)
        .ok_or_else(|| wrong("the condition needs at least one option"))?;
    let mut any_of: Vec<String> = Vec::new();
    for v in list {
        let o = v.as_str().unwrap_or("");
        if !src.options.iter().any(|x| x == o) {
            return Err(wrong("the condition has an option the field does not have"));
        }
        if !any_of.iter().any(|x| x == o) {
            any_of.push(o.to_string());
        }
    }
    if any_of.is_empty() {
        return Err(wrong("the condition needs at least one option"));
    }
    // in the order of the options of the source
    any_of.sort_by_key(|o| src.options.iter().position(|x| x == o));
    Ok(Some(ShowIf {
        field: source.to_string(),
        any_of,
    }))
}

/// Whether the (checked) values meet the condition `c`.
fn condition_met(c: &ShowIf, values: &Map<String, Value>) -> bool {
    match values.get(&c.field) {
        Some(Value::String(s)) => c.any_of.contains(s),
        Some(Value::Array(l)) => l
            .iter()
            .filter_map(Value::as_str)
            .any(|s| c.any_of.iter().any(|x| x == s)),
        _ => false,
    }
}

/// The cap of answers is empty (the default, 1000) or a whole number from 1 to 5000.
fn parse_max_answers(raw: &str) -> Result<i64> {
    let s = raw.trim();
    if s.is_empty() {
        return Ok(DEFAULT_MAX_ANSWERS);
    }
    s.parse::<i64>()
        .ok()
        .filter(|n| (1..=TOP_MAX_ANSWERS).contains(n) && s.chars().all(|c| c.is_ascii_digit()))
        .ok_or_else(|| {
            bad(
                "form_max_answers",
                format!("the most answers is a whole number from 1 to {TOP_MAX_ANSWERS}"),
            )
        })
}

/// The cap as stored, forgiving: whatever is not valid is the default.
fn max_answers_of(raw: &str) -> i64 {
    parse_max_answers(raw).unwrap_or(DEFAULT_MAX_ANSWERS)
}

fn form(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let title: String = v.str("title").trim().to_string();
    if title.is_empty() {
        return Err(bad("form_title_empty", "a form needs a title"));
    }
    if title.chars().count() > MAX_TITLE {
        return Err(bad(
            "form_title_long",
            format!("the title of a form has at most {MAX_TITLE} characters"),
        ));
    }
    v.set("title", title);
    if v.str("intro").chars().count() > MAX_INTRO {
        return Err(bad(
            "form_intro_long",
            format!("the introduction has at most {MAX_INTRO} characters"),
        ));
    }
    let fields = parse_fields(&v.str("fields"))?;
    let normal: Vec<Value> = fields.iter().map(Field::to_json).collect();
    v.set("fields", Value::Array(normal).to_string());
    v.set(
        "max_answers",
        parse_max_answers(&v.str("max_answers"))?.to_string(),
    );
    let thanks = v.str("thanks").trim().to_string();
    if thanks.chars().count() > MAX_THANKS {
        return Err(bad(
            "form_thanks_long",
            format!("the thank-you message has at most {MAX_THANKS} characters"),
        ));
    }
    v.set("thanks", thanks);
    // an anonymous form stays anonymous: the people who answered it were promised not to be known
    if hook.previous.as_ref().is_some_and(|p| p.bool("anonymous")) && !v.bool("anonymous") {
        return Err(bad(
            "form_anonymous_fixed",
            "an anonymous form cannot be made named again",
        ));
    }
    v.set("anonymous", v.bool("anonymous"));
    Ok(Some(v))
}

/// Whether a form takes answers: switched on and not past its closing day (`YYYY-MM-DD`, compared as text).
fn is_open(open: bool, closes_on: &str, today: &str) -> bool {
    open && (closes_on.is_empty() || closes_on >= today)
}

/// Whether the form already has all the answers it may have.
fn exceeds_cap(count: i64, max: i64) -> bool {
    count >= max
}

/// A date as `YYYY-MM-DD` that exists in the calendar.
fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let digits = |r: std::ops::Range<usize>| b[r].iter().all(u8::is_ascii_digit);
    if !(digits(0..4) && digits(5..7) && digits(8..10)) {
        return false;
    }
    let y: u32 = s[0..4].parse().unwrap_or(0);
    let m: u32 = s[5..7].parse().unwrap_or(0);
    let d: u32 = s[8..10].parse().unwrap_or(0);
    let leap = (y.is_multiple_of(4) && !y.is_multiple_of(100)) || y.is_multiple_of(400);
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    y > 0 && (1..=days).contains(&d)
}

/// The shape of an address: one `@`, something before it, a domain with a dot and no empty part, no spaces.
fn is_email(s: &str) -> bool {
    if s.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return false;
    }
    let mut parts = s.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    !local.is_empty()
        && domain.contains('.')
        && domain.split('.').all(|p| !p.is_empty())
        && !domain.starts_with('-')
}

/// A number as plain text: an optional minus, digits and an optional fraction. Everything else (exponent, plus sign,
/// thousands separator, `NaN`) is refused so that what is stored is what the person sees.
fn number_text(s: &str) -> Option<String> {
    let t = s.trim();
    let digits = t.strip_prefix('-').unwrap_or(t);
    let (int, frac) = match digits.split_once('.') {
        Some((i, f)) => (i, Some(f)),
        None => (digits, None),
    };
    let ok = !int.is_empty()
        && int.chars().all(|c| c.is_ascii_digit())
        && frac.is_none_or(|f| !f.is_empty() && f.chars().all(|c| c.is_ascii_digit()))
        && t.len() <= MAX_NUMBER;
    ok.then(|| t.to_string())
}

fn is_empty_value(raw: Option<&Value>) -> bool {
    match raw {
        None | Some(Value::Null) => true,
        Some(Value::String(s)) => s.trim().is_empty(),
        Some(Value::Array(a)) => a.is_empty(),
        _ => false,
    }
}

/// What a person answered to one field, checked against it. `Ok(None)` is an unanswered optional field.
fn check_value(f: &Field, raw: Option<&Value>, n: usize) -> Result<Option<Value>> {
    if is_empty_value(raw) {
        if f.required {
            return Err(bad(
                "answer_required",
                format!("field {n} ({}) needs an answer", f.label),
            ));
        }
        return Ok(None);
    }
    let raw = raw.unwrap_or(&Value::Null);
    let invalid = |code: &str, what: &str| bad(code, format!("field {n} ({}): {what}", f.label));
    let text = |limit: usize| -> Result<String> {
        let s = raw
            .as_str()
            .ok_or_else(|| invalid("answer_invalid", "the answer is not a text"))?
            .trim()
            .to_string();
        if s.chars().count() > limit {
            return Err(invalid(
                "answer_too_long",
                &format!("the answer has at most {limit} characters"),
            ));
        }
        Ok(s)
    };
    match f.kind.as_str() {
        "text" => Ok(Some(json!(text(MAX_TEXT)?))),
        "longtext" => Ok(Some(json!(text(MAX_LONG)?))),
        "email" => {
            let s = text(MAX_TEXT)?;
            if !is_email(&s) {
                return Err(invalid("answer_email", "this is not an email address"));
            }
            Ok(Some(json!(s)))
        }
        "date" => {
            let s = text(10)?;
            if !is_date(&s) {
                return Err(invalid("answer_date", "the date is YYYY-MM-DD"));
            }
            Ok(Some(json!(s)))
        }
        "number" => {
            let s = match raw {
                Value::Number(x) => x.to_string(),
                Value::String(s) => s.clone(),
                _ => return Err(invalid("answer_number", "this is not a number")),
            };
            number_text(&s)
                .map(|t| Some(json!(t)))
                .ok_or_else(|| invalid("answer_number", "this is not a number"))
        }
        "choice" => {
            let s = text(MAX_OPTION)?;
            if !f.options.contains(&s) {
                return Err(invalid("answer_choice", "this is not one of the options"));
            }
            Ok(Some(json!(s)))
        }
        "multi" => {
            let list = raw
                .as_array()
                .ok_or_else(|| invalid("answer_choice", "the answer is not a list"))?;
            let mut picked = BTreeSet::new();
            for x in list {
                let s = x.as_str().unwrap_or("").trim();
                let i =
                    f.options.iter().position(|o| o == s).ok_or_else(|| {
                        invalid("answer_choice", "this is not one of the options")
                    })?;
                picked.insert(i);
            }
            // in the order of the options, each once
            Ok(Some(json!(picked
                .into_iter()
                .map(|i| f.options[i].clone())
                .collect::<Vec<_>>())))
        }
        _ => Err(invalid(
            "answer_invalid",
            "the kind of the field is not known",
        )),
    }
}

/// Checks the values of an answer (a map of field id to value) against the fields of the form and returns the normalised
/// body, a JSON text of at most 8 KB. Unknown ids, a missing required field, a value of the wrong shape and an empty
/// answer are refused with a coded error.
fn validate_answer(fields: &[Field], values: &Value) -> Result<String> {
    let map = values
        .as_object()
        .ok_or_else(|| bad("answer_invalid", "the answers are not valid"))?;
    if let Some(k) = map.keys().find(|k| !fields.iter().any(|f| &f.id == *k)) {
        return Err(bad(
            "answer_unknown_field",
            format!("there is no field {k} in this form"),
        ));
    }
    let mut out = Map::new();
    let mut shown: BTreeSet<String> = BTreeSet::new();
    for (i, f) in fields.iter().enumerate() {
        // a field whose condition is not met is not asked: nothing is required and a stray value is dropped
        let on = f
            .show_if
            .as_ref()
            .is_none_or(|c| shown.contains(&c.field) && condition_met(c, &out));
        if !on {
            continue;
        }
        shown.insert(f.id.clone());
        if let Some(v) = check_value(f, map.get(&f.id), i + 1)? {
            out.insert(f.id.clone(), v);
        }
    }
    if out.is_empty() {
        return Err(bad("answer_empty", "the answer is empty"));
    }
    let body = Value::Object(out).to_string();
    if body.len() > MAX_BODY {
        return Err(bad(
            "answer_too_large",
            "the answer is too large: shorten the texts",
        ));
    }
    Ok(body)
}

/// A uuid in its text form (hex digits in groups of 8-4-4-4-12), lower case; `None` for anything else.
fn parse_uuid(s: &str) -> Option<String> {
    let t = s.trim();
    let ok = t.len() == 36
        && t.char_indices().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        });
    ok.then(|| t.to_ascii_lowercase())
}

/// Per field counts of the answers of everyone: how many answered, and for a choice or multi field the count of each option.
fn tally(fields: &[Field], all: &[Map<String, Value>]) -> Vec<Value> {
    fields
        .iter()
        .map(|f| {
            let given: Vec<&Value> = all.iter().filter_map(|a| a.get(&f.id)).collect();
            let mut o = json!({ "id": f.id, "kind": f.kind, "answered": given.len() });
            if f.has_options() {
                let mut counts = vec![0u64; f.options.len()];
                for a in &given {
                    let picks: Vec<&str> = match a {
                        Value::Array(l) => l.iter().filter_map(Value::as_str).collect(),
                        other => other.as_str().into_iter().collect(),
                    };
                    for p in picks {
                        if let Some(i) = f.options.iter().position(|x| x == p) {
                            counts[i] += 1;
                        }
                    }
                }
                o["counts"] = json!(counts);
            }
            o
        })
        .collect()
}

fn arg_id(args: &Value) -> Result<String> {
    let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
    if id.is_empty() {
        return Err(bad("form_missing", "which form?"));
    }
    Ok(id.to_string())
}

/// A boolean column as the database answers it (true, or 1 on SQLite).
fn flag(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        Some(Value::String(s)) => matches!(s.as_str(), "true" | "t" | "1"),
        _ => false,
    }
}

/// A form as the commands need it.
struct Loaded {
    title: String,
    intro: String,
    fields: Vec<Field>,
    open: bool,
    thanks: String,
    max: i64,
    anonymous: bool,
}

fn loaded_from(row: &Value) -> Result<Loaded> {
    let s = |k: &str| row.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let closes_on = s("closes_on");
    let today = s("today");
    let max_raw = match row.get("max_answers") {
        Some(Value::Number(n)) => n.to_string(),
        _ => s("max_answers"),
    };
    Ok(Loaded {
        title: s("title"),
        intro: s("intro"),
        fields: parse_fields(&s("fields"))?,
        open: is_open(flag(row.get("is_open")), &closes_on, &today),
        thanks: s("thanks"),
        max: max_answers_of(&max_raw),
        anonymous: flag(row.get("anonymous")),
    })
}

/// Loads the form `id` (the database shows only a form the caller, or the public link, reaches).
fn load(ctx: &Ctx, id: &str) -> Result<Loaded> {
    let row = ctx
        .db()
        .query_one(
            "select title, intro, fields, coalesce(\"open\", false) as is_open, closes_on::text as closes_on, \
             max_answers, thanks, coalesce(anonymous, false) as anonymous, current_date::text as today \
             from forms where resource_id::text = $1",
            &[json!(id)],
        )?
        .ok_or_else(|| bad("form_missing", "this form does not exist or is not shared with you"))?;
    loaded_from(&row)
}

fn count_answers(ctx: &Ctx, id: &str) -> Result<i64> {
    Ok(ctx
        .db()
        .query_one(
            "select count(*)::int as n from answers where resource_id::text = $1",
            &[json!(id)],
        )?
        .and_then(|r| r.get("n").and_then(Value::as_i64))
        .unwrap_or(0))
}

fn has_answered(ctx: &Ctx, id: &str, user: &str) -> Result<bool> {
    Ok(ctx
        .db()
        .query_one(
            "select 1 as x from answers where resource_id::text = $1 and user_id = $2::uuid",
            &[json!(id), json!(user)],
        )?
        .is_some())
}

fn level_of(ctx: &Ctx, id: &str) -> Result<i64> {
    let row = ctx
        .db()
        .query_one("select core.level_of($1::uuid)::int as lvl", &[json!(id)])?;
    Ok(row
        .and_then(|r| r.get("lvl").and_then(Value::as_i64))
        .unwrap_or(0))
}

/// The checks both ways of answering share, in the order a person meets them: the form is open and not empty, it has room.
fn ready_for_answers(ctx: &Ctx, id: &str, f: &Loaded) -> Result<()> {
    if !f.open {
        return Err(bad("form_closed", "this form is closed"));
    }
    if f.fields.is_empty() {
        return Err(bad("form_empty", "this form has no fields yet"));
    }
    if exceeds_cap(count_answers(ctx, id)?, f.max) {
        return Err(bad("form_full", "this form cannot take more answers"));
    }
    Ok(())
}

fn insert_answer(ctx: &Ctx, id: &str, user: &str, name: &str, body: &str) -> Result<()> {
    let tenant = ctx.tenant.clone().unwrap_or_default();
    ctx.db().exec(
        "insert into answers (resource_id, tenant_id, user_id, user_name, body) \
         values ($1::uuid, $2::uuid, $3::uuid, $4, $5)",
        &[
            json!(id),
            json!(tenant),
            json!(user),
            json!(name),
            json!(body),
        ],
    )?;
    Ok(())
}

/// A signed-in person answers the form `id` (once).
fn submit(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args)?;
    let user = ctx
        .user
        .clone()
        .ok_or_else(|| bad("not_signed_in", "sign in to answer a form"))?;
    let f = load(ctx, &id)?;
    // an anonymous form keeps no name with the answers (the person is still known once, to answer only once)
    let name = if f.anonymous {
        String::new()
    } else {
        ctx.username.clone().unwrap_or_else(|| user.clone())
    };
    ready_for_answers(ctx, &id, &f)?;
    let body = validate_answer(&f.fields, args.get("values").unwrap_or(&Value::Null))?;
    if has_answered(ctx, &id, &user)? {
        return Err(bad(
            "already_answered",
            "you have already answered this form: it can be answered only once",
        ));
    }
    insert_answer(ctx, &id, &user, &name, &body)?;
    Ok(json!({ "ok": true, "thanks": f.thanks }))
}

/// Public, read only: the form of the link as a visitor fills it in. It never says how many answers there are.
fn public_form(ctx: &Ctx, _args: Value) -> Result<Value> {
    let id = ctx
        .link_resource()
        .ok_or_else(|| bad("form_missing", "this form does not exist"))?
        .to_string();
    let f = load(ctx, &id)?;
    let full = f.open && exceeds_cap(count_answers(ctx, &id)?, f.max);
    Ok(json!({
        "title": f.title,
        "intro": f.intro,
        "thanks": f.thanks,
        "open": f.open && !full,
        "closed": !f.open,
        "full": full,
        // a form that takes no answers does not hand out its fields
        "fields": if f.open && !full { f.fields.iter().map(Field::to_json).collect::<Vec<_>>() } else { Vec::new() },
    }))
}

/// Public, writes one row: a visitor answers the form of the link. The item comes only from the link; the browser id is a
/// hint of «one answer per browser», not a proof.
fn public_submit(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = ctx
        .link_resource()
        .ok_or_else(|| bad("form_missing", "this form does not exist"))?
        .to_string();
    // the honeypot: a field no person sees, so only a program fills it
    match args.get("website") {
        None | Some(Value::Null) => {}
        Some(Value::String(s)) if s.trim().is_empty() => {}
        Some(_) => return Err(bad("answer_rejected", "this answer was not accepted")),
    }
    let browser = args
        .get("browser")
        .and_then(Value::as_str)
        .and_then(parse_uuid)
        .ok_or_else(|| {
            bad(
                "browser_invalid",
                "the browser id is not valid: reload the page",
            )
        })?;
    let f = load(ctx, &id)?;
    ready_for_answers(ctx, &id, &f)?;
    let body = validate_answer(&f.fields, args.get("values").unwrap_or(&Value::Null))?;
    if has_answered(ctx, &id, &browser)? {
        return Err(bad(
            "already_answered",
            "this browser has already answered this form",
        ));
    }
    insert_answer(ctx, &id, &browser, "visitor", &body)?;
    Ok(json!({ "ok": true, "thanks": f.thanks }))
}

/// The answers of the form `id` (write level): newest first, at most 5000, and the counts per field.
fn results(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args)?;
    let f = load(ctx, &id)?;
    if level_of(ctx, &id)? < 2 {
        return Err(bad(
            "results_forbidden",
            "only people who can edit the form can see its answers",
        ));
    }
    let rows = ctx.db().query(
        &format!(
            "select user_id::text as user_id, user_name, body, submitted_at::text as at \
             from answers where resource_id::text = $1 order by submitted_at desc limit {RESULT_ROWS}"
        ),
        &[json!(id)],
    )?;
    let total = count_answers(ctx, &id)?;
    let parse = |r: &Value| -> Map<String, Value> {
        r.get("body")
            .and_then(Value::as_str)
            .and_then(|a| serde_json::from_str::<Value>(a).ok())
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default()
    };
    let all: Vec<Map<String, Value>> = rows.iter().map(parse).collect();
    let mut order: Vec<usize> = (0..rows.len()).collect();
    if f.anonymous {
        // nothing of the order of arrival is left: the answers are listed by their content
        order.sort_by_key(|i| rows[*i].get("body").and_then(Value::as_str).unwrap_or("").to_string());
    }
    let answers: Vec<Value> = order
        .into_iter()
        .map(|i| {
            let (r, values) = (&rows[i], &all[i]);
            if f.anonymous {
                json!({ "id": Value::Null, "name": Value::Null, "at": Value::Null, "values": values })
            } else {
                json!({
                    "id": r.get("user_id"), "name": r.get("user_name"), "at": r.get("at"),
                    "values": values,
                })
            }
        })
        .collect();
    Ok(json!({
        "anonymous": f.anonymous,
        "total": total,
        "truncated": total > RESULT_ROWS,
        "fields": tally(&f.fields, &all),
        "answers": answers,
    }))
}

/// What the list needs: the forms the caller answered and the number of answers of each form the caller may edit.
fn overview(ctx: &Ctx, _args: Value) -> Result<Value> {
    let user = ctx.user.clone().unwrap_or_default();
    let mine = ctx.db().query(
        "select resource_id::text as id from answers where user_id = $1::uuid",
        &[json!(user)],
    )?;
    let counts = ctx.db().query(
        "select resource_id::text as id, count(*)::int as n from answers \
         where core.level_of(resource_id) >= 2 group by resource_id",
        &[],
    )?;
    let mut by = json!({});
    for r in &counts {
        if let (Some(id), Some(n)) = (r.get("id").and_then(Value::as_str), r.get("n")) {
            by[id] = n.clone();
        }
    }
    Ok(json!({
        "mine": mine.iter().filter_map(|r| r.get("id").cloned()).collect::<Vec<_>>(),
        "counts": by,
    }))
}

/// Removes one answer, for example spam (manage level of the form).
fn delete_answer(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args)?;
    let who = args
        .get("answer_user")
        .and_then(Value::as_str)
        .and_then(parse_uuid)
        .ok_or_else(|| bad("answer_missing", "which answer?"))?;
    if level_of(ctx, &id)? < 3 {
        return Err(bad(
            "delete_forbidden",
            "only people who manage the form can delete an answer",
        ));
    }
    if load(ctx, &id)?.anonymous {
        return Err(bad(
            "answer_anonymous",
            "the answers of an anonymous form cannot be told apart, so none can be deleted",
        ));
    }
    let n = ctx.db().exec(
        "delete from answers where resource_id::text = $1 and user_id = $2::uuid",
        &[json!(id), json!(who)],
    )?;
    Ok(json!({ "deleted": n }))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "forms.before_create" => form,
        "forms.before_update" => form,
    },
    commands: {
        "forms.submit" => submit,
        "forms.results" => results,
        "forms.overview" => overview,
        "forms.delete_answer" => delete_answer,
        "public_form" => public_form,
        "public_submit" => public_submit,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;
    use std::cell::RefCell;
    use std::rc::Rc;

    const ID: &str = "0b0e7c9e-1111-4222-8333-444455556666";
    const BROWSER: &str = "9f1c2d3e-aaaa-4bbb-8ccc-ddddeeeeffff";

    fn run(values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), "before_create", "forms", values)
    }

    fn with_fields(fs: Value) -> Value {
        json!({ "title": "F", "fields": fs.to_string() })
    }

    fn fields() -> Vec<Field> {
        parse_fields(
            &json!([
                { "id": "name", "label": "Name", "kind": "text", "required": true },
                { "id": "about", "label": "About", "kind": "longtext" },
                { "id": "size", "label": "Size", "kind": "choice", "options": ["S", "M", "L"] },
                { "id": "extras", "label": "Extras", "kind": "multi", "options": ["a", "b", "c"] },
                { "id": "age", "label": "Age", "kind": "number" },
                { "id": "day", "label": "Day", "kind": "date" },
                { "id": "mail", "label": "Mail", "kind": "email" },
            ])
            .to_string(),
        )
        .unwrap()
    }

    fn code(r: Result<String>) -> String {
        r.unwrap_err().code.unwrap_or_default()
    }

    #[test]
    fn a_form_needs_a_title_of_reasonable_length() {
        assert!(run(json!({ "title": "  " })).unwrap_err().contains("title"));
        assert!(run(json!({ "title": "x".repeat(161) }))
            .unwrap_err()
            .contains("at most"));
        let v = run(json!({ "title": "  Trip  " })).unwrap().unwrap();
        assert_eq!(v.str("title"), "Trip");
        assert_eq!(v.str("fields"), "[]");
        assert_eq!(v.str("max_answers"), "1000");
    }

    #[test]
    fn valid_fields_are_kept_and_normalised() {
        let fs = json!([
            { "id": "a", "label": " Name ", "kind": "text", "required": true, "help": " one line " },
            { "id": "b", "label": "Pick", "kind": "choice", "options": [" x ", "y"] },
            { "id": "c", "label": "Date", "kind": "date", "options": ["ignored"] },
        ]);
        let v = run(with_fields(fs)).unwrap().unwrap();
        let back: Value = serde_json::from_str(&v.str("fields")).unwrap();
        assert_eq!(back[0]["label"], "Name");
        assert_eq!(back[0]["help"], "one line");
        assert_eq!(back[0]["required"], true);
        assert_eq!(back[1]["options"], json!(["x", "y"]));
        assert_eq!(back[2]["options"], json!([]));
    }

    #[test]
    fn bad_fields_are_refused() {
        let err = |fs: Value| run(with_fields(fs)).unwrap_err();
        assert!(err(json!([{ "id": "a", "label": " ", "kind": "text" }])).contains("label"));
        assert!(err(json!([{ "id": "a", "label": "x", "kind": "rating" }])).contains("kind"));
        assert!(err(json!([{ "id": "", "label": "x", "kind": "text" }])).contains("id"));
        assert!(err(json!([
            { "id": "a", "label": "x", "kind": "text" },
            { "id": "a", "label": "y", "kind": "text" }
        ]))
        .contains("repeats"));
        assert!(
            err(json!([{ "id": "a", "label": "x".repeat(121), "kind": "text" }]))
                .contains("at most")
        );
        assert!(
            err(json!([{ "id": "a", "label": "x", "kind": "choice", "options": ["one"] }]))
                .contains("options")
        );
        assert!(
            err(json!([{ "id": "a", "label": "x", "kind": "multi", "options": ["a", "a"] }]))
                .contains("repeated")
        );
        let many: Vec<Value> = (0..13).map(|i| json!(format!("o{i}"))).collect();
        assert!(
            err(json!([{ "id": "a", "label": "x", "kind": "choice", "options": many }]))
                .contains("options")
        );
        let thirty_one: Vec<Value> = (0..31)
            .map(|i| json!({ "id": format!("f{i}"), "label": "x", "kind": "text" }))
            .collect();
        assert!(err(Value::Array(thirty_one)).contains("at most 30"));
        assert!(run(json!({ "title": "F", "fields": "not json" })).is_err());
    }

    #[test]
    fn the_cap_and_the_thanks_are_checked() {
        let ok = |m: &str| run(json!({ "title": "F", "max_answers": m }));
        assert_eq!(ok("").unwrap().unwrap().str("max_answers"), "1000");
        assert_eq!(ok(" 25 ").unwrap().unwrap().str("max_answers"), "25");
        assert_eq!(ok("5000").unwrap().unwrap().str("max_answers"), "5000");
        for bad in ["0", "5001", "-3", "1.5", "many", "1e3"] {
            assert!(ok(bad).unwrap_err().contains("most answers"), "{bad}");
        }
        let long = run(json!({ "title": "F", "thanks": "x".repeat(501) }));
        assert!(long.unwrap_err().contains("500"));
        let v = run(json!({ "title": "F", "thanks": "  Thanks!  " }))
            .unwrap()
            .unwrap();
        assert_eq!(v.str("thanks"), "Thanks!");
    }

    #[test]
    fn an_answer_is_validated_field_by_field() {
        let fs = fields();
        let body = validate_answer(
            &fs,
            &json!({
                "name": "  Anna ", "size": "M", "extras": ["c", "a", "a"], "age": 42,
                "day": "2028-02-29", "mail": "anna@example.org"
            }),
        )
        .unwrap();
        let v: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["name"], "Anna");
        assert_eq!(v["extras"], json!(["a", "c"]));
        assert_eq!(v["age"], "42");
        assert!(v.get("about").is_none());
    }

    #[test]
    fn required_unknown_and_empty_answers_are_refused() {
        let fs = fields();
        assert_eq!(
            code(validate_answer(&fs, &json!({ "size": "M" }))),
            "answer_required"
        );
        assert_eq!(
            code(validate_answer(&fs, &json!({ "name": "  " }))),
            "answer_required"
        );
        assert_eq!(
            code(validate_answer(&fs, &json!({ "name": "A", "zzz": "x" }))),
            "answer_unknown_field"
        );
        assert_eq!(code(validate_answer(&fs, &json!(["a"]))), "answer_invalid");
        let optional =
            parse_fields(&json!([{ "id": "a", "label": "A", "kind": "text" }]).to_string())
                .unwrap();
        assert_eq!(code(validate_answer(&optional, &json!({}))), "answer_empty");
    }

    #[test]
    fn every_kind_has_its_rules() {
        let fs = fields();
        let base = |k: &str, v: Value| validate_answer(&fs, &json!({ "name": "A", k: v }));
        assert_eq!(code(base("mail", json!("nope"))), "answer_email");
        assert_eq!(code(base("mail", json!("a@b"))), "answer_email");
        assert_eq!(code(base("mail", json!("a b@c.org"))), "answer_email");
        assert_eq!(code(base("mail", json!("a@@c.org"))), "answer_email");
        assert_eq!(code(base("mail", json!("a@c..org"))), "answer_email");
        assert!(base("mail", json!("a.b+c@sub.example.org")).is_ok());
        assert_eq!(code(base("age", json!("12abc"))), "answer_number");
        assert_eq!(code(base("age", json!("1e5"))), "answer_number");
        assert_eq!(code(base("age", json!("+5"))), "answer_number");
        assert_eq!(code(base("age", json!("."))), "answer_number");
        assert_eq!(code(base("age", json!(true))), "answer_number");
        assert!(base("age", json!("-3.5")).is_ok());
        assert!(base("age", json!(7)).is_ok());
        assert_eq!(code(base("day", json!("2027-02-29"))), "answer_date");
        assert_eq!(code(base("day", json!("2027-13-01"))), "answer_date");
        assert_eq!(code(base("day", json!("12/05/2027"))), "answer_date");
        assert!(base("day", json!("2028-02-29")).is_ok());
        assert_eq!(code(base("size", json!("XL"))), "answer_choice");
        assert_eq!(code(base("size", json!(1))), "answer_invalid");
        assert_eq!(code(base("extras", json!(["a", "z"]))), "answer_choice");
        assert_eq!(code(base("extras", json!("a"))), "answer_choice");
        assert_eq!(
            code(validate_answer(&fs, &json!({ "name": "x".repeat(201) }))),
            "answer_too_long"
        );
        assert_eq!(
            code(base("about", json!("x".repeat(2001)))),
            "answer_too_long"
        );
        assert!(base("about", json!("x".repeat(2000))).is_ok());
    }

    #[test]
    fn the_whole_answer_is_at_most_8_kb() {
        let many: Vec<Field> = (0..5)
            .map(|i| Field {
                id: format!("f{i}"),
                label: "L".into(),
                kind: "longtext".into(),
                options: vec![],
                required: false,
                show_if: None,
                help: String::new(),
            })
            .collect();
        let v: Map<String, Value> = (0..5)
            .map(|i| (format!("f{i}"), json!("é".repeat(1900))))
            .collect();
        assert_eq!(
            code(validate_answer(&many, &Value::Object(v))),
            "answer_too_large"
        );
    }

    #[test]
    fn open_and_cap() {
        assert!(is_open(true, "", "2026-11-12"));
        assert!(is_open(true, "2026-11-12", "2026-11-12"));
        assert!(!is_open(true, "2026-11-11", "2026-11-12"));
        assert!(!is_open(false, "", "2026-11-12"));
        assert!(!exceeds_cap(9, 10));
        assert!(exceeds_cap(10, 10));
        assert!(exceeds_cap(11, 10));
    }

    #[test]
    fn uuids_and_dates_and_numbers() {
        assert_eq!(
            parse_uuid(&BROWSER.to_uppercase()).as_deref(),
            Some(BROWSER)
        );
        assert!(parse_uuid("not-a-uuid").is_none());
        assert!(parse_uuid("9f1c2d3e-aaaa-4bbb-8ccc-ddddeeeeffgg").is_none());
        assert!(parse_uuid("9f1c2d3eaaaa4bbb8cccddddeeeeffff").is_none());
        assert!(
            is_date("2026-12-31")
                && !is_date("2026-12-32")
                && !is_date("2026-00-10")
                && !is_date("0000-01-01")
        );
        assert_eq!(number_text(" 12.50 ").as_deref(), Some("12.50"));
        assert!(
            number_text("").is_none() && number_text("-").is_none() && number_text("1.").is_none()
        );
    }

    #[test]
    fn the_tally_counts_options() {
        let fs = fields();
        let all = vec![
            json!({ "name": "a", "size": "M", "extras": ["a", "c"] }),
            json!({ "name": "b", "size": "M", "extras": ["c"] }),
            json!({ "name": "c", "size": "gone" }),
        ];
        let all: Vec<Map<String, Value>> = all
            .into_iter()
            .map(|v| v.as_object().unwrap().clone())
            .collect();
        let t = tally(&fs, &all);
        let size = t.iter().find(|x| x["id"] == "size").unwrap();
        assert_eq!(size["counts"], json!([0, 2, 0]));
        assert_eq!(size["answered"], 3);
        let extras = t.iter().find(|x| x["id"] == "extras").unwrap();
        assert_eq!(extras["counts"], json!([1, 0, 2]));
        assert!(t
            .iter()
            .find(|x| x["id"] == "name")
            .unwrap()
            .get("counts")
            .is_none());
    }

    fn form_row(open: bool, closes_on: &str, max: Value) -> Value {
        json!({
            "title": "Trip", "intro": "Come", "thanks": "See you",
            "fields": json!([
                { "id": "name", "label": "Name", "kind": "text", "required": true },
                { "id": "mail", "label": "Mail", "kind": "email" },
            ]).to_string(),
            "is_open": open, "closes_on": closes_on, "max_answers": max, "today": "2026-11-12",
        })
    }

    /// A simulated database: the form row, the number of answers, the ids that answered; inserts are recorded.
    struct Db {
        row: Value,
        count: i64,
        answered: Vec<String>,
        inserts: Rc<RefCell<Vec<Value>>>,
    }

    fn host(db: Db, public: bool) -> (MockHost, Rc<RefCell<Vec<Value>>>) {
        let inserts = db.inserts.clone();
        let mut h = MockHost::new();
        if public {
            h = h.as_public(ID);
        }
        let h = h
            .on("db.query", move |req| {
                let sql = req["sql"].as_str().unwrap_or_default();
                if sql.contains("from forms") {
                    Ok(json!([db.row.clone()]))
                } else if sql.contains("count(*)") {
                    Ok(json!([{ "n": db.count }]))
                } else if sql.contains("select 1 as x") {
                    let who = req["params"][1].as_str().unwrap_or_default();
                    Ok(if db.answered.iter().any(|a| a == who) {
                        json!([{ "x": 1 }])
                    } else {
                        json!([])
                    })
                } else {
                    Ok(json!([]))
                }
            })
            .on("db.exec", {
                let inserts = inserts.clone();
                move |req| {
                    inserts.borrow_mut().push(req["params"].clone());
                    Ok(json!({ "rows": 1 }))
                }
            });
        (h, inserts)
    }

    fn db(row: Value, count: i64, answered: &[&str]) -> Db {
        Db {
            row,
            count,
            answered: answered.iter().map(|s| s.to_string()).collect(),
            inserts: Rc::default(),
        }
    }

    fn err_code(h: &MockHost, cmd: &str, args: Value) -> String {
        h.command_err(&__msk_registry(), cmd, args)
            .unwrap_err()
            .code
            .unwrap_or_default()
    }

    #[test]
    fn a_visitor_answers_once() {
        let (h, inserts) = host(db(form_row(true, "", json!("1000")), 3, &[]), true);
        let out = h
            .command(
                &__msk_registry(),
                "public_submit",
                json!({ "browser": BROWSER, "values": { "name": "Ann", "mail": "a@b.org" }, "website": "" }),
            )
            .unwrap();
        assert_eq!(out, json!({ "ok": true, "thanks": "See you" }));
        let rows = inserts.borrow();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0][0], ID, "the item comes from the link");
        assert_eq!(rows[0][2], BROWSER);
        assert_eq!(rows[0][3], "visitor");
    }

    #[test]
    fn a_visitor_is_refused_with_a_clear_code() {
        let args = |v: Value| json!({ "browser": BROWSER, "values": v, "website": "" });
        let ok_values = json!({ "name": "Ann" });
        let open = |count, answered: &[&str]| {
            host(db(form_row(true, "", json!("5")), count, answered), true).0
        };
        // the honeypot
        let h = open(0, &[]);
        let mut a = args(ok_values.clone());
        a["website"] = json!("http://spam.example");
        assert_eq!(err_code(&h, "public_submit", a), "answer_rejected");
        // the browser id
        let mut a = args(ok_values.clone());
        a["browser"] = json!("1; drop table answers");
        assert_eq!(err_code(&h, "public_submit", a), "browser_invalid");
        // closed: switched off, past its day
        let off = host(db(form_row(false, "", json!("5")), 0, &[]), true).0;
        assert_eq!(
            err_code(&off, "public_submit", args(ok_values.clone())),
            "form_closed"
        );
        let late = host(db(form_row(true, "2026-11-01", json!("5")), 0, &[]), true).0;
        assert_eq!(
            err_code(&late, "public_submit", args(ok_values.clone())),
            "form_closed"
        );
        // the cap
        assert_eq!(
            err_code(&open(5, &[]), "public_submit", args(ok_values.clone())),
            "form_full"
        );
        // invalid and missing values
        assert_eq!(
            err_code(&h, "public_submit", args(json!({ "mail": "a@b.org" }))),
            "answer_required"
        );
        assert_eq!(
            err_code(
                &h,
                "public_submit",
                args(json!({ "name": "A", "mail": "bad" }))
            ),
            "answer_email"
        );
        // the same browser again
        assert_eq!(
            err_code(&open(1, &[BROWSER]), "public_submit", args(ok_values)),
            "already_answered"
        );
    }

    #[test]
    fn a_public_command_needs_a_link_and_takes_no_item_from_the_arguments() {
        let (h, inserts) = host(db(form_row(true, "", json!("5")), 0, &[]), false);
        let a =
            json!({ "id": "other", "browser": BROWSER, "values": { "name": "A" }, "website": "" });
        assert_eq!(err_code(&h, "public_submit", a.clone()), "form_missing");
        assert_eq!(err_code(&h, "public_form", json!({})), "form_missing");
        assert!(inserts.borrow().is_empty());
        let (h, inserts) = host(db(form_row(true, "", json!("5")), 0, &[]), true);
        h.command(&__msk_registry(), "public_submit", a).unwrap();
        assert_eq!(inserts.borrow()[0][0], ID);
    }

    #[test]
    fn the_public_form_hides_the_count_and_the_fields_of_a_closed_form() {
        let (h, _) = host(db(form_row(true, "", json!("1000")), 7, &[]), true);
        let out = h
            .command(&__msk_registry(), "public_form", json!({}))
            .unwrap();
        assert_eq!(out["title"], "Trip");
        assert_eq!(out["open"], true);
        assert_eq!(out["fields"].as_array().unwrap().len(), 2);
        assert!(out.get("count").is_none() && out.get("total").is_none());
        let (h, _) = host(db(form_row(false, "", json!("1000")), 7, &[]), true);
        let out = h
            .command(&__msk_registry(), "public_form", json!({}))
            .unwrap();
        assert_eq!(
            (out["open"].clone(), out["closed"].clone()),
            (json!(false), json!(true))
        );
        assert_eq!(out["fields"], json!([]));
        let (h, _) = host(db(form_row(true, "", json!("7")), 7, &[]), true);
        let out = h
            .command(&__msk_registry(), "public_form", json!({}))
            .unwrap();
        assert_eq!(
            (out["full"].clone(), out["open"].clone()),
            (json!(true), json!(false))
        );
    }

    #[test]
    fn a_signed_in_person_answers_as_themselves() {
        let user = "11111111-2222-4333-8444-555566667777";
        let (h, inserts) = host(db(form_row(true, "", json!("1000")), 0, &[]), false);
        let h = {
            let mut h = h;
            h.ctx.user = Some(user.into());
            h.ctx.username = Some("manager".into());
            h.ctx.tenant = Some("t-1".into());
            h
        };
        let out = h
            .command(
                &__msk_registry(),
                "forms.submit",
                json!({ "id": ID, "values": { "name": "Ann" } }),
            )
            .unwrap();
        assert_eq!(out["ok"], true);
        let rows = inserts.borrow();
        assert_eq!(
            (rows[0][2].clone(), rows[0][3].clone()),
            (json!(user), json!("manager"))
        );
        // not signed in
        let (mut h, _) = host(db(form_row(true, "", json!("1000")), 0, &[]), false);
        h.ctx.user = None;
        assert_eq!(
            err_code(&h, "forms.submit", json!({ "id": ID, "values": {} })),
            "not_signed_in"
        );
        assert_eq!(err_code(&h, "forms.submit", json!({})), "form_missing");
    }

    #[test]
    fn a_second_answer_of_a_signed_in_person_is_refused() {
        let user = "11111111-2222-4333-8444-555566667777";
        let (mut h, _) = host(db(form_row(true, "", json!("1000")), 0, &[user]), false);
        h.ctx.user = Some(user.into());
        assert_eq!(
            err_code(
                &h,
                "forms.submit",
                json!({ "id": ID, "values": { "name": "Ann" } })
            ),
            "already_answered"
        );
    }

    #[test]
    fn results_are_for_writers_and_delete_for_managers() {
        let level = |lvl: i64| {
            MockHost::new().on("db.query", move |req| {
                let sql = req["sql"].as_str().unwrap_or_default();
                Ok(if sql.contains("level_of($1") {
                    json!([{ "lvl": lvl }])
                } else if sql.contains("from forms") {
                    json!([form_row(true, "", json!("1000"))])
                } else if sql.contains("count(*)") {
                    json!([{ "n": 2 }])
                } else if sql.contains("from answers") {
                    json!([
                        { "user_id": "u2", "user_name": "visitor", "body": "{\"name\":\"B\"}", "at": "2026-11-12 10:00:00" },
                        { "user_id": "u1", "user_name": "manager", "body": "{\"name\":\"A\"}", "at": "2026-11-11 10:00:00" }
                    ])
                } else {
                    json!([])
                })
            })
            .on("db.exec", |_| Ok(json!({ "rows": 1 })))
        };
        assert_eq!(
            err_code(&level(1), "forms.results", json!({ "id": ID })),
            "results_forbidden"
        );
        let out = level(2)
            .command(&__msk_registry(), "forms.results", json!({ "id": ID }))
            .unwrap();
        assert_eq!(out["total"], 2);
        assert_eq!(out["answers"][0]["name"], "visitor");
        assert_eq!(out["answers"][0]["values"]["name"], "B");
        assert_eq!(out["fields"].as_array().unwrap().len(), 2);
        let del = json!({ "id": ID, "answer_user": BROWSER });
        assert_eq!(
            err_code(&level(2), "forms.delete_answer", del.clone()),
            "delete_forbidden"
        );
        assert_eq!(
            err_code(
                &level(3),
                "forms.delete_answer",
                json!({ "id": ID, "answer_user": "x" })
            ),
            "answer_missing"
        );
        let out = level(3)
            .command(&__msk_registry(), "forms.delete_answer", del)
            .unwrap();
        assert_eq!(out["deleted"], 1);
    }

    #[test]
    fn the_overview_counts_and_lists_my_answers() {
        let h = MockHost::new().on("db.query", |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            Ok(if sql.contains("group by") {
                json!([{ "id": "a", "n": 3 }])
            } else {
                json!([{ "id": "b" }])
            })
        });
        let out = h
            .command(&__msk_registry(), "forms.overview", json!({}))
            .unwrap();
        assert_eq!(out, json!({ "mine": ["b"], "counts": { "a": 3 } }));
    }
}

#[cfg(test)]
mod branching_tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn fields(show_b: Value) -> Result<Vec<Field>> {
        parse_fields(
            &json!([
                { "id": "a", "label": "Do you drive?", "kind": "choice", "options": ["Yes", "No", "Sometimes"] },
                { "id": "b", "label": "Which car?", "kind": "text", "required": true, "show_if": show_b },
                { "id": "c", "label": "Why not?", "kind": "text", "show_if": { "field": "a", "any_of": ["No"] } },
                { "id": "d", "label": "Anything else?", "kind": "text" },
            ])
            .to_string(),
        )
    }

    #[test]
    fn a_condition_names_an_earlier_field_with_options() {
        let ok = fields(json!({ "field": "a", "any_of": ["Sometimes", "Yes", "Yes"] })).unwrap();
        // in the order of the options, each once
        assert_eq!(ok[1].show_if.as_ref().unwrap().any_of, ["Yes", "Sometimes"]);
        let bad = |c: Value, kind: &str| {
            parse_fields(
                &json!([
                    { "id": "a", "label": "A", "kind": kind, "options": ["x", "y"] },
                    { "id": "b", "label": "B", "kind": "text", "show_if": c },
                ])
                .to_string(),
            )
            .unwrap_err()
            .to_string()
        };
        assert!(bad(json!({ "field": "z", "any_of": ["x"] }), "choice").contains("earlier"));
        assert!(bad(json!({ "field": "b", "any_of": ["x"] }), "choice").contains("earlier"));
        assert!(bad(json!({ "field": "a", "any_of": ["x"] }), "text").contains("with options"));
        assert!(bad(json!({ "field": "a", "any_of": ["q"] }), "choice").contains("does not have"));
        assert!(bad(json!({ "field": "a", "any_of": [] }), "choice").contains("at least one"));
    }

    #[test]
    fn the_condition_is_kept_when_the_form_is_saved() {
        let v = MockHost::new()
            .hook(
                &__msk_registry(),
                "before_create",
                "forms",
                json!({ "title": "T", "fields": json!([
                    { "id": "a", "label": "A", "kind": "multi", "options": ["x", "y"] },
                    { "id": "b", "label": "B", "kind": "text", "show_if": { "field": "a", "any_of": ["y"] } },
                ]).to_string() }),
            )
            .unwrap()
            .unwrap();
        assert!(v.str("fields").contains(r#""show_if":{"any_of":["y"],"field":"a"}"#));
    }

    #[test]
    fn a_field_is_asked_only_when_the_condition_is_met() {
        let f = fields(json!({ "field": "a", "any_of": ["Yes"] })).unwrap();
        // «Yes»: the car is asked and required
        assert_eq!(
            validate_answer(&f, &json!({ "a": "Yes" })).unwrap_err().to_string(),
            "field 2 (Which car?) needs an answer"
        );
        let body = validate_answer(&f, &json!({ "a": "Yes", "b": "Fiat" })).unwrap();
        assert_eq!(body, r#"{"a":"Yes","b":"Fiat"}"#);
        // «No»: the car is not asked, a stray value is dropped and the other condition applies
        let no = validate_answer(&f, &json!({ "a": "No", "b": "Fiat", "c": "Bike" })).unwrap();
        assert_eq!(no, r#"{"a":"No","c":"Bike"}"#);
    }

    #[test]
    fn a_multiple_choice_matches_any_of_its_picks() {
        let f = parse_fields(
            &json!([
                { "id": "a", "label": "A", "kind": "multi", "options": ["x", "y", "z"] },
                { "id": "b", "label": "B", "kind": "text", "required": true, "show_if": { "field": "a", "any_of": ["z"] } },
            ])
            .to_string(),
        )
        .unwrap();
        assert!(validate_answer(&f, &json!({ "a": ["x", "z"] })).is_err());
        assert!(validate_answer(&f, &json!({ "a": ["x", "z"], "b": "why" })).is_ok());
        assert!(validate_answer(&f, &json!({ "a": ["x", "y"] })).is_ok());
    }

    #[test]
    fn an_anonymous_form_cannot_be_made_named_again() {
        let h = MockHost::new();
        let v = |anon: bool| json!({ "title": "T", "anonymous": anon });
        let made = h
            .hook(&__msk_registry(), "before_create", "forms", v(true))
            .unwrap()
            .unwrap();
        assert!(made.bool("anonymous"));
        let named = h
            .hook_with_previous(&__msk_registry(), "before_update", "forms", v(false), v(true))
            .unwrap_err();
        assert!(named.contains("anonymous"));
        assert!(h
            .hook_with_previous(&__msk_registry(), "before_update", "forms", v(true), v(false))
            .is_ok());
    }

    #[test]
    fn results_of_an_anonymous_form_name_nobody_and_deleting_is_refused() {
        let row = |sql: &str| {
            if sql.contains("from answers") {
                json!([
                    { "user_id": "11111111-1111-1111-1111-111111111111", "user_name": "", "body": r#"{"d":"b"}"#, "at": "2026-11-13" },
                    { "user_id": "22222222-2222-2222-2222-222222222222", "user_name": "", "body": r#"{"d":"a"}"#, "at": "2026-11-12" },
                ])
            } else if sql.contains("count(*)") {
                json!([{ "n": 2 }])
            } else if sql.contains("level_of") {
                json!([{ "lvl": 3 }])
            } else {
                json!([{ "title": "T", "intro": "", "fields": json!([{ "id": "d", "label": "D", "kind": "text" }]).to_string(),
                    "is_open": true, "closes_on": "", "max_answers": "1000", "thanks": "", "anonymous": true, "today": "2026-11-13" }])
            }
        };
        let h = MockHost::new().on("db.query", move |req| Ok(row(req["sql"].as_str().unwrap_or_default())));
        let id = "99999999-9999-9999-9999-999999999999";
        let out = h
            .command(&__msk_registry(), "forms.results", json!({ "id": id }))
            .unwrap();
        assert_eq!(out["anonymous"], true);
        let a = out["answers"].as_array().unwrap();
        // by content, not by arrival; no identity
        assert_eq!(a[0]["values"]["d"], "a");
        assert!(a.iter().all(|x| x["id"].is_null() && x["name"].is_null() && x["at"].is_null()));
        let del = h
            .command(
                &__msk_registry(),
                "forms.delete_answer",
                json!({ "id": id, "answer_user": "11111111-1111-1111-1111-111111111111" }),
            )
            .unwrap_err();
        assert!(del.contains("anonymous"));
    }
}
