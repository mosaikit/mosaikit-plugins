//! Surveys plugin: series of questions answered by the people a survey is shared with. A survey keeps its questions as a
//! JSON array in the hidden field `questions`; the hook checks them. A reader answers once with `surveys.submit` (the
//! table `responses` is one a reader writes, see `[[tables]]` in the manifest); in quiz mode the answers are scored by a
//! pure function. `surveys.results` gives the per-question aggregates to people with write level and only the own
//! outcome to a plain reader; `surveys.overview` answers what the list needs in one call.

use mosaikit_plugin_sdk::prelude::*;
use mosaikit_plugin_sdk::serde_json::{self, Map};
use std::collections::{BTreeMap, BTreeSet};

const MAX_TITLE: usize = 160;
const MAX_INTRO: usize = 4000;
const MAX_QUESTIONS: usize = 40;
const MAX_QUESTION_TEXT: usize = 300;
const MAX_OPTION_TEXT: usize = 200;
const MAX_ID: usize = 40;
const MIN_OPTIONS: usize = 2;
const MAX_OPTIONS: usize = 10;
const MAX_ANSWER_TEXT: usize = 1000;
const MAX_POINTS: i64 = 100;
const KINDS: [&str; 4] = ["choice", "multi", "text", "scale"];

/// The answer key of a quiz: question id to the indexes of its correct options. It lives in the table `keys`, which only the
/// commands of the plugin reach, never in the questions a reader can read.
type Key = BTreeMap<String, Vec<usize>>;

/// One question of a survey, as stored (without the correct answers).
#[derive(Debug, Clone, PartialEq)]
struct Question {
    id: String,
    text: String,
    kind: String,
    options: Vec<String>,
    points: i64,
    required: bool,
    /// Shown only when an earlier question was answered with one of these values.
    show_if: Option<ShowIf>,
}

/// A condition of a question: the earlier question `question` (a choice, multi or scale one) has one of the values in
/// `any_of` (option indexes, or 1 to 5 for a scale) among its answers.
#[derive(Debug, Clone, PartialEq)]
struct ShowIf {
    question: String,
    any_of: Vec<i64>,
}

impl Question {
    fn has_options(&self) -> bool {
        self.kind == "choice" || self.kind == "multi"
    }

    /// Whether the question counts in a quiz: a choice or multi question with points and a correct answer in the key.
    fn scored(&self, key: &Key) -> bool {
        self.has_options() && self.points > 0 && key.get(&self.id).is_some_and(|c| !c.is_empty())
    }

    fn to_json(&self) -> Value {
        let mut o = json!({
            "id": self.id, "text": self.text, "kind": self.kind, "options": self.options,
            "points": self.points, "required": self.required,
        });
        if let Some(c) = &self.show_if {
            o["show_if"] = json!({ "question": c.question, "any_of": c.any_of });
        }
        o
    }
}

fn bad(code: &str, msg: impl Into<String>) -> Error {
    Error::coded(code, msg.into())
}

/// Parses and checks the JSON array of questions. A `correct` member is ignored: the answer key is kept apart (see `Key`).
/// An empty text is an empty list of questions.
fn parse_questions(raw: &str) -> Result<Vec<Question>> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let parsed: Value = serde_json::from_str(raw)
        .map_err(|_| bad("survey_questions_invalid", "the questions are not valid"))?;
    let list = parsed
        .as_array()
        .ok_or_else(|| bad("survey_questions_invalid", "the questions are not a list"))?;
    if list.len() > MAX_QUESTIONS {
        return Err(bad(
            "survey_too_many_questions",
            format!("a survey has at most {MAX_QUESTIONS} questions"),
        ));
    }
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for (i, q) in list.iter().enumerate() {
        let n = i + 1;
        let id = q.get("id").and_then(Value::as_str).unwrap_or("").trim();
        if id.is_empty() || id.chars().count() > MAX_ID {
            return Err(bad(
                "survey_question_id",
                format!("question {n} has no valid id"),
            ));
        }
        if !seen.insert(id.to_string()) {
            return Err(bad(
                "survey_question_id",
                format!("question {n} repeats the id of another question"),
            ));
        }
        let text: String = q
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if text.is_empty() {
            return Err(bad(
                "survey_question_text",
                format!("question {n} needs a text"),
            ));
        }
        if text.chars().count() > MAX_QUESTION_TEXT {
            return Err(bad(
                "survey_question_text",
                format!("the text of question {n} has at most {MAX_QUESTION_TEXT} characters"),
            ));
        }
        let kind = q.get("kind").and_then(Value::as_str).unwrap_or("");
        if !KINDS.contains(&kind) {
            return Err(bad(
                "survey_question_kind",
                format!("question {n}: the kind is choice, multi, text or scale"),
            ));
        }
        let has_options = kind == "choice" || kind == "multi";
        let mut options = Vec::new();
        if has_options {
            for o in q
                .get("options")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or(&[])
            {
                let s = o.as_str().unwrap_or("").trim().to_string();
                if s.is_empty() || s.chars().count() > MAX_OPTION_TEXT {
                    return Err(bad(
                        "survey_question_options",
                        format!(
                            "question {n}: every option needs a text of at most {MAX_OPTION_TEXT} characters"
                        ),
                    ));
                }
                options.push(s);
            }
            if options.len() < MIN_OPTIONS || options.len() > MAX_OPTIONS {
                return Err(bad(
                    "survey_question_options",
                    format!("question {n} needs from {MIN_OPTIONS} to {MAX_OPTIONS} options"),
                ));
            }
        }
        let points = match q.get("points") {
            None | Some(Value::Null) => 0,
            Some(v) => v
                .as_i64()
                .filter(|p| (0..=MAX_POINTS).contains(p))
                .ok_or_else(|| {
                    bad(
                        "survey_question_points",
                        format!(
                            "question {n}: the points are a whole number from 0 to {MAX_POINTS}"
                        ),
                    )
                })?,
        };
        let show_if = parse_show_if(q.get("show_if"), &out, n)?;
        out.push(Question {
            id: id.to_string(),
            text,
            kind: kind.to_string(),
            options,
            points,
            required: q.get("required").and_then(Value::as_bool).unwrap_or(false),
            show_if,
        });
    }
    Ok(out)
}

/// Reads the condition of question `n` against the questions before it: it must name one of them, a choice, multi or
/// scale question, and list at least one value that question can have.
fn parse_show_if(raw: Option<&Value>, before: &[Question], n: usize) -> Result<Option<ShowIf>> {
    let Some(c) = raw.filter(|c| !c.is_null()) else {
        return Ok(None);
    };
    let wrong = |m: &str| bad("survey_question_branch", format!("question {n}: {m}"));
    let source = c.get("question").and_then(Value::as_str).unwrap_or("");
    let Some(src) = before.iter().find(|q| q.id == source) else {
        return Err(wrong("the condition must use an earlier question"));
    };
    let max = match src.kind.as_str() {
        "choice" | "multi" => src.options.len() as i64,
        "scale" => 6,
        _ => {
            return Err(wrong(
                "the condition needs a question with options or a scale",
            ))
        }
    };
    let min = if src.kind == "scale" { 1 } else { 0 };
    let list = c
        .get("any_of")
        .and_then(Value::as_array)
        .ok_or_else(|| wrong("the condition needs at least one value"))?;
    let mut any_of: Vec<i64> = Vec::new();
    for v in list {
        let i = v
            .as_i64()
            .filter(|i| (min..max).contains(i))
            .ok_or_else(|| wrong("the condition has a value the question cannot have"))?;
        if !any_of.contains(&i) {
            any_of.push(i);
        }
    }
    if any_of.is_empty() {
        return Err(wrong("the condition needs at least one value"));
    }
    any_of.sort_unstable();
    Ok(Some(ShowIf {
        question: source.to_string(),
        any_of,
    }))
}

/// Whether the answers meet the condition `c`: the source question has one of the listed values among its answers.
fn condition_met(c: &ShowIf, answers: &Map<String, Value>) -> bool {
    answers.get(&c.question).is_some_and(|a| match a {
        Value::Array(l) => l
            .iter()
            .filter_map(Value::as_i64)
            .any(|i| c.any_of.contains(&i)),
        other => other.as_i64().is_some_and(|i| c.any_of.contains(&i)),
    })
}

/// The ids of the questions a person sees, given the (checked) answers: a question with no condition, or whose source
/// is shown and was answered with one of the listed values. The order of the survey is the order of the evaluation.
fn shown_ids(questions: &[Question], answers: &Map<String, Value>) -> BTreeSet<String> {
    let mut shown = BTreeSet::new();
    for q in questions {
        let on = q
            .show_if
            .as_ref()
            .is_none_or(|c| shown.contains(&c.question) && condition_met(c, answers));
        if on {
            shown.insert(q.id.clone());
        }
    }
    shown
}

/// A pass mark is empty or a whole number from 0 to 100.
fn pass_percent(raw: &str) -> Result<Option<i64>> {
    let s = raw.trim();
    if s.is_empty() {
        return Ok(None);
    }
    s.parse::<i64>()
        .ok()
        .filter(|p| (0..=100).contains(p) && s.chars().all(|c| c.is_ascii_digit()))
        .map(Some)
        .ok_or_else(|| {
            bad(
                "survey_pass_percent",
                "the pass mark is a whole number from 0 to 100",
            )
        })
}

/// Checks an answer key against the questions of a survey and returns it in order. Every id must be a question with options,
/// the indexes are in range and not repeated, a single-answer question has at most one, a question with points in a quiz
/// needs a correct answer, and a survey that is not a quiz has no key.
fn validate_key(questions: &[Question], quiz: bool, raw: &Value) -> Result<Key> {
    let map = match raw {
        Value::Null => return Ok(Key::new()),
        Value::Object(m) => m,
        _ => return Err(bad("survey_key_invalid", "the answer key is not valid")),
    };
    let mut key = Key::new();
    for (id, v) in map {
        let (i, q) = questions
            .iter()
            .enumerate()
            .find(|(_, q)| &q.id == id)
            .ok_or_else(|| {
                bad(
                    "survey_key_invalid",
                    "the answer key has a question that does not exist",
                )
            })?;
        let n = i + 1;
        let list = v.as_array().ok_or_else(|| {
            bad(
                "survey_key_invalid",
                format!("question {n}: the correct answers are a list"),
            )
        })?;
        let mut idx = Vec::new();
        for x in list {
            let k = x
                .as_u64()
                .filter(|k| q.has_options() && (*k as usize) < q.options.len())
                .ok_or_else(|| {
                    bad(
                        "survey_key_invalid",
                        format!("question {n}: a correct answer is not one of the options"),
                    )
                })? as usize;
            if idx.contains(&k) {
                return Err(bad(
                    "survey_key_invalid",
                    format!("question {n}: a correct answer is repeated"),
                ));
            }
            idx.push(k);
        }
        idx.sort_unstable();
        if q.kind == "choice" && idx.len() > 1 {
            return Err(bad(
                "survey_key_invalid",
                format!("question {n} has one answer, so only one can be correct"),
            ));
        }
        if !idx.is_empty() {
            key.insert(id.clone(), idx);
        }
    }
    if !quiz && !key.is_empty() {
        return Err(bad(
            "survey_key_invalid",
            "correct answers are only for a quiz",
        ));
    }
    if quiz {
        for (i, q) in questions.iter().enumerate() {
            if q.has_options() && q.points > 0 && !key.contains_key(&q.id) {
                return Err(bad(
                    "survey_key_invalid",
                    format!("question {} gives points: mark the correct answer", i + 1),
                ));
            }
        }
    }
    Ok(key)
}

/// The key as stored (a JSON object), forgiving: whatever is not a list of indexes is dropped.
fn parse_key(raw: &str) -> Key {
    let mut key = Key::new();
    if let Some(m) = serde_json::from_str::<Value>(raw)
        .ok()
        .and_then(|v| v.as_object().cloned())
    {
        for (id, v) in m {
            let idx: Vec<usize> = v
                .as_array()
                .map(|l| {
                    l.iter()
                        .filter_map(|x| x.as_u64().map(|k| k as usize))
                        .collect()
                })
                .unwrap_or_default();
            if !idx.is_empty() {
                key.insert(id, idx);
            }
        }
    }
    key
}

fn survey(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let title: String = v.str("title").trim().to_string();
    if title.is_empty() {
        return Err(bad("survey_title_empty", "a survey needs a title"));
    }
    if title.chars().count() > MAX_TITLE {
        return Err(bad(
            "survey_title_long",
            format!("the title of a survey has at most {MAX_TITLE} characters"),
        ));
    }
    v.set("title", title);
    if v.str("intro").chars().count() > MAX_INTRO {
        return Err(bad(
            "survey_intro_long",
            format!("the introduction has at most {MAX_INTRO} characters"),
        ));
    }
    let questions = parse_questions(&v.str("questions"))?;
    let normal: Vec<Value> = questions.iter().map(Question::to_json).collect();
    v.set("questions", Value::Array(normal).to_string());
    match pass_percent(&v.str("pass_percent"))? {
        Some(p) => v.set("pass_percent", p.to_string()),
        None => v.set("pass_percent", ""),
    }
    // an anonymous survey stays anonymous: the people who answered it were promised not to be known
    if hook.previous.as_ref().is_some_and(|p| p.bool("anonymous")) && !v.bool("anonymous") {
        return Err(bad(
            "survey_anonymous_fixed",
            "an anonymous survey cannot be made named again",
        ));
    }
    v.set("anonymous", v.bool("anonymous"));
    Ok(Some(v))
}

/// What a person answered to one question, checked against it. `Ok(None)` is an unanswered question.
fn check_answer(q: &Question, raw: Option<&Value>, n: usize) -> Result<Option<Value>> {
    let empty = match raw {
        None | Some(Value::Null) => true,
        Some(Value::String(s)) => s.trim().is_empty(),
        Some(Value::Array(a)) => a.is_empty(),
        _ => false,
    };
    if empty {
        if q.required {
            return Err(bad(
                "answer_required",
                format!("question {n} needs an answer"),
            ));
        }
        return Ok(None);
    }
    let raw = raw.unwrap();
    let invalid = || {
        bad(
            "answer_invalid",
            format!("question {n}: the answer is not valid"),
        )
    };
    match q.kind.as_str() {
        "choice" => {
            let i = raw.as_u64().ok_or_else(invalid)? as usize;
            if i >= q.options.len() {
                return Err(invalid());
            }
            Ok(Some(json!(i)))
        }
        "multi" => {
            let mut set = BTreeSet::new();
            for x in raw.as_array().ok_or_else(invalid)? {
                let i = x.as_u64().ok_or_else(invalid)? as usize;
                if i >= q.options.len() {
                    return Err(invalid());
                }
                set.insert(i);
            }
            Ok(Some(json!(set.into_iter().collect::<Vec<_>>())))
        }
        "scale" => {
            let i = raw
                .as_i64()
                .filter(|x| (1..=5).contains(x))
                .ok_or_else(invalid)?;
            Ok(Some(json!(i)))
        }
        _ => {
            let s = raw.as_str().ok_or_else(invalid)?.trim().to_string();
            if s.chars().count() > MAX_ANSWER_TEXT {
                return Err(bad(
                    "answer_too_long",
                    format!("question {n}: a text answer has at most {MAX_ANSWER_TEXT} characters"),
                ));
            }
            Ok(Some(json!(s)))
        }
    }
}

/// Checks the answers of a person (a map of question id to value) against the survey and returns the normalised map.
fn check_answers(questions: &[Question], answers: &Value) -> Result<Map<String, Value>> {
    let map = answers
        .as_object()
        .ok_or_else(|| bad("answer_invalid", "the answers are not valid"))?;
    if let Some(k) = map.keys().find(|k| !questions.iter().any(|q| &q.id == *k)) {
        return Err(bad(
            "answer_invalid",
            format!("there is no question {k} in this survey"),
        ));
    }
    let mut out = Map::new();
    let mut shown: BTreeSet<String> = BTreeSet::new();
    for (i, q) in questions.iter().enumerate() {
        // a question whose condition is not met is not asked: nothing is required and a stray answer is dropped
        let on = q
            .show_if
            .as_ref()
            .is_none_or(|c| shown.contains(&c.question) && condition_met(c, &out));
        if !on {
            continue;
        }
        shown.insert(q.id.clone());
        if let Some(a) = check_answer(q, map.get(&q.id), i + 1)? {
            out.insert(q.id.clone(), a);
        }
    }
    Ok(out)
}

/// The score of a set of (already checked) answers: `(score, max_score, right or wrong per question)`. A choice question
/// gives all its points when the answer is the correct one, a multi question only when the set is exactly the correct
/// set; text and scale are not scored. `None` in the review is a question that is not scored.
fn score(
    questions: &[Question],
    key: &Key,
    answers: &Map<String, Value>,
) -> (i64, i64, Vec<Option<bool>>) {
    let (mut got, mut max) = (0, 0);
    let mut review = Vec::new();
    for q in questions {
        let correct = key.get(&q.id).cloned().unwrap_or_default();
        if !q.scored(key) {
            review.push(None);
            continue;
        }
        max += q.points;
        let right = match (q.kind.as_str(), answers.get(&q.id)) {
            ("choice", Some(a)) => a.as_u64().map(|i| vec![i as usize]) == Some(correct.clone()),
            ("multi", Some(a)) => {
                let mut given: Vec<usize> = a
                    .as_array()
                    .map(|l| {
                        l.iter()
                            .filter_map(|x| x.as_u64().map(|i| i as usize))
                            .collect()
                    })
                    .unwrap_or_default();
                given.sort_unstable();
                given.dedup();
                given == correct
            }
            _ => false,
        };
        if right {
            got += q.points;
        }
        review.push(Some(right));
    }
    (got, max, review)
}

fn percent(score: i64, max: i64) -> i64 {
    if max <= 0 {
        0
    } else {
        (score * 100 + max / 2) / max
    }
}

/// Whether a score passes: `None` when the survey has no pass mark.
fn passed(percent: i64, mark: Option<i64>) -> Option<bool> {
    mark.map(|m| percent >= m)
}

/// Per question aggregates of the answers of every respondent: counts per option, the average of a scale, the text answers.
fn aggregate(questions: &[Question], all: &[Map<String, Value>]) -> Vec<Value> {
    questions
        .iter()
        .map(|q| {
            let given: Vec<&Value> = all.iter().filter_map(|a| a.get(&q.id)).collect();
            let mut o = json!({ "id": q.id, "kind": q.kind, "answered": given.len() });
            match q.kind.as_str() {
                "choice" | "multi" => {
                    let mut counts = vec![0u64; q.options.len()];
                    for a in &given {
                        let picks: Vec<u64> = match a {
                            Value::Array(l) => l.iter().filter_map(Value::as_u64).collect(),
                            other => other.as_u64().into_iter().collect(),
                        };
                        for i in picks {
                            if let Some(c) = counts.get_mut(i as usize) {
                                *c += 1;
                            }
                        }
                    }
                    o["counts"] = json!(counts);
                }
                "scale" => {
                    let mut counts = vec![0u64; 5];
                    let mut sum = 0;
                    for a in &given {
                        if let Some(i) = a.as_i64().filter(|x| (1..=5).contains(x)) {
                            counts[(i - 1) as usize] += 1;
                            sum += i;
                        }
                    }
                    let n: u64 = counts.iter().sum();
                    o["counts"] = json!(counts);
                    o["average"] = if n == 0 {
                        Value::Null
                    } else {
                        json!((sum as f64 / n as f64 * 100.0).round() / 100.0)
                    };
                }
                _ => {
                    o["texts"] = json!(given.iter().filter_map(|a| a.as_str()).collect::<Vec<_>>());
                }
            }
            o
        })
        .collect()
}

fn arg_id(args: &Value) -> Result<String> {
    let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
    if id.is_empty() {
        return Err(bad("survey_missing", "which survey?"));
    }
    Ok(id.to_string())
}

/// A survey as the commands need it.
struct Loaded {
    questions: Vec<Question>,
    key: Key,
    quiz: bool,
    mark: Option<i64>,
    closed: bool,
    anonymous: bool,
}

fn load(ctx: &Ctx, id: &str) -> Result<Loaded> {
    let row = ctx
        .db()
        .query_one(
            "select questions, coalesce(quiz, false) as quiz, coalesce(anonymous, false) as anonymous, pass_percent, \
             (coalesce(closed, false) or (closes_on is not null and closes_on < current_date)) as closed \
             from surveys where resource_id::text = $1",
            &[json!(id)],
        )?
        .ok_or_else(|| bad("survey_missing", "this survey does not exist or is not shared with you"))?;
    let quiz = row.get("quiz").and_then(Value::as_bool).unwrap_or(false);
    let raw = row.get("questions").and_then(Value::as_str).unwrap_or("");
    // the answer key lives apart from the questions; a quiz without a key row scores 0 of 0
    let key = ctx
        .db()
        .query_one(
            "select correct from keys where resource_id::text = $1",
            &[json!(id)],
        )?
        .and_then(|r| r.get("correct").and_then(Value::as_str).map(parse_key))
        .unwrap_or_default();
    Ok(Loaded {
        questions: parse_questions(raw)?,
        key,
        quiz,
        mark: pass_percent(
            row.get("pass_percent")
                .and_then(Value::as_str)
                .unwrap_or(""),
        )?,
        closed: row.get("closed").and_then(Value::as_bool).unwrap_or(false),
        anonymous: flag(row.get("anonymous")),
    })
}

fn level_of(ctx: &Ctx, id: &str) -> Result<i64> {
    let row = ctx
        .db()
        .query_one("select core.level_of($1::uuid)::int as lvl", &[json!(id)])?;
    Ok(row
        .and_then(|r| r.get("lvl").and_then(Value::as_i64))
        .unwrap_or(0))
}

fn outcome(s: i64, max: i64, mark: Option<i64>) -> Value {
    let p = percent(s, max);
    json!({ "score": s, "max_score": max, "percent": p, "passed": passed(p, mark) })
}

/// The caller answers the survey `id` (once).
fn submit(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args)?;
    let user = ctx
        .user
        .clone()
        .ok_or_else(|| bad("not_signed_in", "sign in to answer a survey"))?;
    let tenant = ctx.tenant.clone().unwrap_or_default();
    let s = load(ctx, &id)?;
    // an anonymous survey keeps no name with the answers (the person is still known once, to answer only once)
    let name = if s.anonymous {
        String::new()
    } else {
        ctx.username.clone().unwrap_or_else(|| user.clone())
    };
    if s.closed {
        return Err(bad("survey_closed", "this survey is closed"));
    }
    if s.questions.is_empty() {
        return Err(bad("survey_empty", "this survey has no questions yet"));
    }
    let answers = check_answers(&s.questions, args.get("answers").unwrap_or(&Value::Null))?;
    let already = ctx.db().query_one(
        "select 1 as x from responses where resource_id::text = $1 and user_id = $2::uuid",
        &[json!(id), json!(user)],
    )?;
    if already.is_some() {
        return Err(bad(
            "survey_already_answered",
            "you have already answered this survey: it can be answered only once",
        ));
    }
    // only the questions that were shown count for the score
    let shown = shown_ids(&s.questions, &answers);
    let asked: Vec<Question> = s
        .questions
        .iter()
        .filter(|q| shown.contains(&q.id))
        .cloned()
        .collect();
    let (got, max, asked_review) = score(&asked, &s.key, &answers);
    let mut it = asked_review.into_iter();
    let review: Vec<Option<bool>> = s
        .questions
        .iter()
        .map(|q| {
            if shown.contains(&q.id) {
                it.next().flatten()
            } else {
                None
            }
        })
        .collect();
    let (sc, mx) = if s.quiz {
        (json!(got), json!(max))
    } else {
        (Value::Null, Value::Null)
    };
    ctx.db().exec(
        "insert into responses (resource_id, tenant_id, user_id, user_name, answers, score, max_score) \
         values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::int, $7::int)",
        &[json!(id), json!(tenant), json!(user), json!(name), json!(Value::Object(answers).to_string()), sc, mx],
    )?;
    if !s.quiz {
        return Ok(json!({ "submitted": true, "quiz": false }));
    }
    let mut out = outcome(got, max, s.mark);
    out["submitted"] = json!(true);
    out["quiz"] = json!(true);
    // right and wrong are told only now, after the answers are stored
    out["review"] = json!(s
        .questions
        .iter()
        .zip(review)
        .map(|(q, r)| json!({ "id": q.id, "right": r, "correct": if r.is_some() { json!(s.key.get(&q.id)) } else { Value::Null } }))
        .collect::<Vec<_>>());
    Ok(out)
}

/// Results of the survey `id`: everything for a person with write level, only the own outcome for a reader.
fn results(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args)?;
    let user = ctx.user.clone().unwrap_or_default();
    let s = load(ctx, &id)?;
    let rows = ctx.db().query(
        "select user_id::text as user_id, user_name, answers, score, max_score, submitted_at::text as at \
         from responses where resource_id::text = $1 order by submitted_at",
        &[json!(id)],
    )?;
    let parse = |r: &Value| -> Map<String, Value> {
        r.get("answers")
            .and_then(Value::as_str)
            .and_then(|a| serde_json::from_str::<Value>(a).ok())
            .and_then(|v| v.as_object().cloned())
            .unwrap_or_default()
    };
    let mine = rows
        .iter()
        .find(|r| r.get("user_id").and_then(Value::as_str) == Some(user.as_str()));
    let mine_json = mine.map(|r| {
        let mut o = json!({ "at": r.get("at") });
        if let (Some(sc), Some(mx)) = (
            r.get("score").and_then(Value::as_i64),
            r.get("max_score").and_then(Value::as_i64),
        ) {
            o = json!({ "at": r.get("at"), "score": sc, "max_score": mx, "percent": percent(sc, mx), "passed": passed(percent(sc, mx), s.mark) });
        }
        o
    });
    if level_of(ctx, &id)? < 2 {
        return Ok(
            json!({ "full": false, "responded": mine.is_some(), "mine": mine_json, "anonymous": s.anonymous }),
        );
    }
    let all: Vec<Map<String, Value>> = rows.iter().map(parse).collect();
    let mut order: Vec<&Value> = rows.iter().collect();
    if s.anonymous {
        // nothing of the order of arrival is left: the answers are listed by their content
        order.sort_by_key(|r| {
            r.get("answers")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string()
        });
    }
    let respondents: Vec<Value> = order
        .into_iter()
        .map(|r| {
            let (sc, mx) = (r.get("score").and_then(Value::as_i64), r.get("max_score").and_then(Value::as_i64));
            let (who, name, at) = if s.anonymous {
                (Value::Null, Value::Null, Value::Null)
            } else {
                (r.get("user_id").cloned().unwrap_or(Value::Null), r.get("user_name").cloned().unwrap_or(Value::Null), r.get("at").cloned().unwrap_or(Value::Null))
            };
            json!({
                "id": who, "name": name, "at": at,
                "score": sc, "max_score": mx,
                "percent": match (sc, mx) { (Some(a), Some(b)) => json!(percent(a, b)), _ => Value::Null },
                "passed": match (sc, mx) { (Some(a), Some(b)) => json!(passed(percent(a, b), s.mark)), _ => Value::Null },
                "answers": parse(r),
            })
        })
        .collect();
    Ok(json!({
        "full": true,
        "anonymous": s.anonymous,
        "responded": mine.is_some(),
        "mine": mine_json,
        "total": rows.len(),
        "questions": aggregate(&s.questions, &all),
        "key": s.key,
        "respondents": respondents,
    }))
}

/// What the list needs: the surveys the caller answered and the number of responses of each survey the caller may manage.
fn overview(ctx: &Ctx, _args: Value) -> Result<Value> {
    let user = ctx.user.clone().unwrap_or_default();
    let mine = ctx.db().query(
        "select resource_id::text as id from responses where user_id = $1::uuid",
        &[json!(user)],
    )?;
    let counts = ctx.db().query(
        "select resource_id::text as id, count(*)::int as n from responses \
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

/// The survey `id` for a command that needs write level: the questions, whether it is a quiz.
fn writable(ctx: &Ctx, id: &str) -> Result<(Vec<Question>, bool)> {
    let row = ctx.db().query_one(
        "select core.level_of($1::uuid)::int as lv from surveys where resource_id = $1::uuid",
        &[json!(id)],
    )?;
    let lv = row
        .ok_or_else(|| {
            bad(
                "survey_missing",
                "this survey does not exist or is not shared with you",
            )
        })?
        .get("lv")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    if lv < 2 {
        return Err(bad(
            "survey_key_forbidden",
            "only people who can edit the survey can see or change its correct answers",
        ));
    }
    let s = load(ctx, id)?;
    Ok((s.questions, s.quiz))
}

/// Stores the answer key of the survey `id` (write level). An empty key removes it.
fn set_key(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args)?;
    let (questions, quiz) = writable(ctx, &id)?;
    let key = validate_key(
        &questions,
        quiz,
        args.get("correct").unwrap_or(&Value::Null),
    )?;
    let tenant = ctx.tenant.clone().unwrap_or_default();
    ctx.db().exec(
        "delete from keys where resource_id::text = $1",
        &[json!(id)],
    )?;
    if !key.is_empty() {
        ctx.db().exec(
            "insert into keys (resource_id, tenant_id, correct) values ($1::uuid, $2::uuid, $3)",
            &[json!(id), json!(tenant), json!(json!(key).to_string())],
        )?;
    }
    Ok(json!({ "saved": true, "questions": key.len() }))
}

/// The answer key of the survey `id`, for the builder (write level only).
fn get_key(ctx: &Ctx, args: Value) -> Result<Value> {
    let id = arg_id(&args)?;
    writable(ctx, &id)?;
    let key = ctx
        .db()
        .query_one(
            "select correct from keys where resource_id::text = $1",
            &[json!(id)],
        )?
        .and_then(|r| r.get("correct").and_then(Value::as_str).map(parse_key))
        .unwrap_or_default();
    Ok(json!({ "correct": key }))
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

/// Counts for the widget: (open surveys the caller has not answered, open surveys in all). `rows` carry `id`,
/// `closed` and `closes_on` (YYYY-MM-DD, compared as text); `answered` are the ids the caller answered.
fn open_counts(rows: &[Value], answered: &[String], today: &str) -> (i64, i64) {
    let mut open = 0;
    let mut waiting = 0;
    for r in rows {
        let closes_on = r
            .get("closes_on")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if flag(r.get("closed")) || (!closes_on.is_empty() && closes_on < today) {
            continue;
        }
        open += 1;
        let id = r.get("id").and_then(Value::as_str).unwrap_or_default();
        if !answered.iter().any(|a| a == id) {
            waiting += 1;
        }
    }
    (waiting, open)
}

/// Widget `open-surveys`: the open surveys the caller has not answered, and how many are open in all.
fn widget_open(ctx: &Ctx, _args: Value) -> Result<Value> {
    let user = ctx.user.clone().unwrap_or_default();
    let today = ctx
        .db()
        .query_one("select current_date::text as d", &[])?
        .and_then(|r| {
            r.get("d")
                .and_then(Value::as_str)
                .map(|d| d.chars().take(10).collect::<String>())
        })
        .unwrap_or_default();
    let rows = ctx.db().query(
        "select resource_id::text as id, closed, closes_on::text as closes_on from surveys",
        &[],
    )?;
    let answered: Vec<String> = ctx
        .db()
        .query(
            "select resource_id::text as id from responses where user_id = $1::uuid",
            &[json!(user)],
        )?
        .iter()
        .filter_map(|r| r.get("id").and_then(Value::as_str).map(str::to_string))
        .collect();
    let (waiting, open) = open_counts(&rows, &answered, &today);
    Ok(json!({ "value": waiting, "secondary": open, "tone": "" }))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "surveys.before_create" => survey,
        "surveys.before_update" => survey,
    },
    commands: {
        "surveys.submit" => submit,
        "surveys.results" => results,
        "surveys.overview" => overview,
        "surveys.set_key" => set_key,
        "surveys.get_key" => get_key,
        "surveys.widget_open" => widget_open,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn run(values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), "before_create", "surveys", values)
    }

    fn with_questions(qs: Value, quiz: bool) -> Value {
        json!({ "title": "S", "quiz": quiz, "questions": qs.to_string() })
    }

    fn quiz_questions() -> Vec<Question> {
        parse_questions(
            &json!([
                { "id": "a", "text": "One?", "kind": "choice", "options": ["x", "y", "z"], "points": 2 },
                { "id": "b", "text": "Many?", "kind": "multi", "options": ["x", "y", "z"], "points": 3 },
                { "id": "c", "text": "Why?", "kind": "text" },
                { "id": "d", "text": "How much?", "kind": "scale", "points": 5 },
            ])
            .to_string(),
        )
        .unwrap()
    }

    fn quiz_key() -> Key {
        parse_key(r#"{ "a": [1], "b": [0, 2] }"#)
    }

    fn map(v: Value) -> Map<String, Value> {
        v.as_object().unwrap().clone()
    }

    #[test]
    fn a_survey_needs_a_title_of_reasonable_length() {
        assert!(run(json!({ "title": "  " })).unwrap_err().contains("title"));
        assert!(run(json!({ "title": "x".repeat(161) }))
            .unwrap_err()
            .contains("at most"));
        let v = run(json!({ "title": "  Climate  " })).unwrap().unwrap();
        assert_eq!(v.str("title"), "Climate");
        assert_eq!(v.str("questions"), "[]");
    }

    #[test]
    fn a_valid_list_of_questions_is_kept_and_normalised() {
        let q = json!([
            { "id": "a", "text": " Mood? ", "kind": "scale" },
            { "id": "b", "text": "Pick", "kind": "choice", "options": ["x", "y"], "required": true },
        ]);
        let v = run(with_questions(q, false)).unwrap().unwrap();
        let back: Value = serde_json::from_str(&v.str("questions")).unwrap();
        assert_eq!(back[0]["text"], "Mood?");
        assert_eq!(back[1]["required"], true);
        assert_eq!(back[0]["points"], 0);
    }

    #[test]
    fn a_question_without_text_is_refused() {
        let q = json!([{ "id": "a", "text": "  ", "kind": "text" }]);
        assert!(run(with_questions(q, false))
            .unwrap_err()
            .contains("needs a text"));
    }

    #[test]
    fn ids_must_be_unique_and_kinds_known() {
        let q = json!([{ "id": "a", "text": "1", "kind": "text" }, { "id": "a", "text": "2", "kind": "text" }]);
        assert!(run(with_questions(q, false))
            .unwrap_err()
            .contains("repeats"));
        let q = json!([{ "id": "a", "text": "1", "kind": "essay" }]);
        assert!(run(with_questions(q, false)).unwrap_err().contains("kind"));
        assert!(run(json!({ "title": "S", "questions": "{not json" }))
            .unwrap_err()
            .contains("not valid"));
    }

    #[test]
    fn the_number_of_questions_and_options_is_limited() {
        let many: Vec<Value> = (0..41)
            .map(|i| json!({ "id": format!("q{i}"), "text": "t", "kind": "text" }))
            .collect();
        assert!(run(with_questions(Value::Array(many), false))
            .unwrap_err()
            .contains("at most 40"));
        let one = json!([{ "id": "a", "text": "t", "kind": "choice", "options": ["x"] }]);
        assert!(run(with_questions(one, false))
            .unwrap_err()
            .contains("options"));
        let eleven: Vec<String> = (0..11).map(|i| i.to_string()).collect();
        let too = json!([{ "id": "a", "text": "t", "kind": "multi", "options": eleven }]);
        assert!(run(with_questions(too, false))
            .unwrap_err()
            .contains("options"));
        let ten: Vec<String> = (0..10).map(|i| i.to_string()).collect();
        let ok = json!([{ "id": "a", "text": "t", "kind": "multi", "options": ten }]);
        assert!(run(with_questions(ok, false)).is_ok());
    }

    #[test]
    fn the_hook_strips_the_correct_answers_from_the_stored_questions() {
        let q = json!([{ "id": "a", "text": "t", "kind": "choice", "options": ["x", "y"], "correct": [1], "points": 1 }]);
        let v = run(with_questions(q, true)).unwrap().unwrap();
        let back: Value = serde_json::from_str(&v.str("questions")).unwrap();
        assert!(back[0].get("correct").is_none());
        assert!(!v.str("questions").contains("correct"));
        assert_eq!(back[0]["points"], 1);
        let pts = json!([{ "id": "a", "text": "t", "kind": "text", "points": 101 }]);
        assert!(run(with_questions(pts, true))
            .unwrap_err()
            .contains("points"));
    }

    #[test]
    fn the_answer_key_is_checked_against_the_questions() {
        let qs = quiz_questions();
        let ok = validate_key(&qs, true, &json!({ "a": [1], "b": [2, 0] })).unwrap();
        assert_eq!(ok["b"], vec![0, 2]);
        let err = |v: Value, quiz: bool| validate_key(&qs, quiz, &v).unwrap_err().to_string();
        assert!(err(json!({ "a": [1], "b": [3] }), true).contains("not one of the options"));
        assert!(err(json!({ "a": [0, 1], "b": [0] }), true).contains("only one"));
        assert!(err(json!({ "a": [1], "b": [0, 0] }), true).contains("repeated"));
        assert!(err(json!({ "zz": [0] }), true).contains("does not exist"));
        assert!(err(json!({ "c": [0] }), true).contains("not one of the options"));
        assert!(err(json!({ "a": [1] }), true).contains("mark the correct"));
        assert!(err(json!({ "a": [1], "b": [0] }), false).contains("only for a quiz"));
        assert!(err(json!([1]), true).contains("not valid"));
        assert!(validate_key(&qs, false, &json!({})).unwrap().is_empty());
        assert!(validate_key(&qs, false, &Value::Null).unwrap().is_empty());
    }

    #[test]
    fn a_quiz_without_a_key_scores_nothing() {
        let qs = quiz_questions();
        let (s, max, review) = score(&qs, &Key::new(), &map(json!({ "a": 1, "b": [0, 2] })));
        assert_eq!((s, max), (0, 0));
        assert_eq!(review, vec![None, None, None, None]);
    }

    #[test]
    fn the_key_is_read_forgivingly() {
        assert!(parse_key("").is_empty());
        assert!(parse_key("[1]").is_empty());
        assert_eq!(parse_key(r#"{"a":[1],"b":"x","c":[]}"#).len(), 1);
    }

    #[test]
    fn the_pass_mark_is_empty_or_zero_to_hundred() {
        assert_eq!(
            run(json!({ "title": "S", "pass_percent": " 60 " }))
                .unwrap()
                .unwrap()
                .str("pass_percent"),
            "60"
        );
        assert_eq!(
            run(json!({ "title": "S", "pass_percent": "" }))
                .unwrap()
                .unwrap()
                .str("pass_percent"),
            ""
        );
        for bad in ["101", "-1", "abc", "5.5"] {
            assert!(
                run(json!({ "title": "S", "pass_percent": bad }))
                    .unwrap_err()
                    .contains("pass mark"),
                "{bad}"
            );
        }
    }

    #[test]
    fn a_choice_scores_all_its_points_or_none() {
        let qs = quiz_questions();
        let (s, max, review) = score(&qs, &quiz_key(), &map(json!({ "a": 1 })));
        assert_eq!((s, max), (2, 5));
        assert_eq!(review, vec![Some(true), Some(false), None, None]);
        assert_eq!(score(&qs, &quiz_key(), &map(json!({ "a": 0 }))).0, 0);
    }

    #[test]
    fn a_multi_scores_only_for_exactly_the_correct_set() {
        let qs = quiz_questions();
        assert_eq!(score(&qs, &quiz_key(), &map(json!({ "b": [2, 0] }))).0, 3);
        assert_eq!(score(&qs, &quiz_key(), &map(json!({ "b": [0] }))).0, 0);
        assert_eq!(
            score(&qs, &quiz_key(), &map(json!({ "b": [0, 1, 2] }))).0,
            0
        );
        assert_eq!(
            score(
                &qs,
                &quiz_key(),
                &map(json!({ "a": 1, "b": [0, 2], "c": "text", "d": 5 }))
            ),
            (5, 5, vec![Some(true), Some(true), None, None])
        );
    }

    #[test]
    fn percent_and_pass_mark() {
        assert_eq!(percent(1, 3), 33);
        assert_eq!(percent(2, 3), 67);
        assert_eq!(percent(0, 0), 0);
        assert_eq!(passed(60, Some(60)), Some(true));
        assert_eq!(passed(59, Some(60)), Some(false));
        assert_eq!(passed(10, None), None);
    }

    #[test]
    fn the_answers_are_checked_against_the_survey() {
        let mut qs = quiz_questions();
        qs[0].required = true;
        assert!(check_answers(&qs, &json!({}))
            .unwrap_err()
            .to_string()
            .contains("needs an answer"));
        assert!(check_answers(&qs, &json!({ "a": 3 })).is_err());
        assert!(check_answers(&qs, &json!({ "a": 1, "zz": 1 })).is_err());
        assert!(check_answers(&qs, &json!({ "a": 1, "d": 6 })).is_err());
        assert!(check_answers(&qs, &json!({ "a": 1, "d": 0 })).is_err());
        assert!(check_answers(&qs, &json!({ "a": 1, "b": [5] })).is_err());
        assert!(check_answers(&qs, &json!({ "a": 1, "c": "é".repeat(1001) })).is_err());
        let ok = check_answers(
            &qs,
            &json!({ "a": 1, "b": [2, 2, 0], "c": "  fine  ", "d": 3 }),
        )
        .unwrap();
        assert_eq!(ok["b"], json!([0, 2]));
        assert_eq!(ok["c"], "fine");
        // an unanswered optional question is simply not stored
        assert_eq!(
            check_answers(&qs, &json!({ "a": 0, "c": "" }))
                .unwrap()
                .len(),
            1
        );
        assert!(check_answers(&qs, &json!("x")).is_err());
    }

    #[test]
    fn the_results_are_aggregated_per_question() {
        let qs = quiz_questions();
        let all = vec![
            map(json!({ "a": 1, "b": [0, 2], "c": "good", "d": 4 })),
            map(json!({ "a": 1, "b": [0], "d": 5 })),
            map(json!({ "a": 2, "c": "bad" })),
        ];
        let agg = aggregate(&qs, &all);
        assert_eq!(agg[0]["counts"], json!([0, 2, 1]));
        assert_eq!(agg[1]["counts"], json!([2, 0, 1]));
        assert_eq!(agg[1]["answered"], 2);
        assert_eq!(agg[2]["texts"], json!(["good", "bad"]));
        assert_eq!(agg[3]["average"], json!(4.5));
        assert_eq!(agg[3]["counts"], json!([0, 0, 0, 1, 1]));
        assert_eq!(aggregate(&qs, &[])[3]["average"], Value::Null);
    }

    #[test]
    fn the_commands_are_registered() {
        let names = __msk_registry().command_names();
        for c in [
            "surveys.submit",
            "surveys.results",
            "surveys.overview",
            "surveys.widget_open",
        ] {
            assert!(names.contains(&c), "{c}");
        }
    }

    #[test]
    fn open_surveys_are_counted_for_the_caller() {
        let rows = vec![
            json!({ "id": "a", "closed": false, "closes_on": null }),
            json!({ "id": "b", "closed": false, "closes_on": "2026-10-20" }),
            json!({ "id": "c", "closed": true, "closes_on": null }),
            json!({ "id": "d", "closed": false, "closes_on": "2026-10-19" }),
            json!({ "id": "e", "closed": 0, "closes_on": "" }),
        ];
        // a, b and e are open (b closes today); the caller answered b
        let answered = vec!["b".to_string(), "c".to_string()];
        assert_eq!(open_counts(&rows, &answered, "2026-10-20"), (2, 3));
        assert_eq!(open_counts(&[], &[], "2026-10-20"), (0, 0));
    }

    #[test]
    fn the_widget_answers() {
        let host = MockHost::new().on("db.query", |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            if sql.contains("current_date") {
                Ok(json!([{ "d": "2026-10-20" }]))
            } else if sql.contains("from responses") {
                Ok(json!([{ "id": "a" }]))
            } else {
                Ok(json!([
                    { "id": "a", "closed": false, "closes_on": null },
                    { "id": "b", "closed": false, "closes_on": null }
                ]))
            }
        });
        let out = host
            .command(&__msk_registry(), "surveys.widget_open", json!({}))
            .unwrap();
        assert_eq!(out, json!({ "value": 1, "secondary": 2, "tone": "" }));
    }
}

#[cfg(test)]
mod branching_tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn qs(show_b: Value) -> Vec<Question> {
        parse_questions(
            &json!([
                { "id": "a", "text": "Do you drive?", "kind": "choice", "options": ["yes", "no", "sometimes"] },
                { "id": "b", "text": "What car?", "kind": "text", "required": true, "show_if": show_b },
                { "id": "c", "text": "Rate it", "kind": "scale", "show_if": { "question": "a", "any_of": [0] } },
                { "id": "d", "text": "Anything else?", "kind": "text" },
            ])
            .to_string(),
        )
        .unwrap_or_default()
    }

    fn map(v: Value) -> Map<String, Value> {
        v.as_object().unwrap().clone()
    }

    #[test]
    fn a_condition_names_an_earlier_question_with_options_or_a_scale() {
        let ok = qs(json!({ "question": "a", "any_of": [0, 2] }));
        assert_eq!(ok.len(), 4);
        assert_eq!(ok[1].show_if.as_ref().unwrap().any_of, vec![0, 2]);
        let bad = |c: Value, kind: &str| {
            let raw = json!([
                { "id": "a", "text": "A", "kind": kind, "options": ["x", "y"] },
                { "id": "b", "text": "B", "kind": "text", "show_if": c },
            ])
            .to_string();
            parse_questions(&raw).unwrap_err().to_string()
        };
        // a later or unknown question, a text source, a value the source cannot have, no value
        assert!(bad(json!({ "question": "z", "any_of": [0] }), "choice").contains("earlier"));
        assert!(bad(json!({ "question": "b", "any_of": [0] }), "choice").contains("earlier"));
        assert!(
            bad(json!({ "question": "a", "any_of": [0] }), "text").contains("options or a scale")
        );
        assert!(bad(json!({ "question": "a", "any_of": [2] }), "choice").contains("cannot have"));
        assert!(bad(json!({ "question": "a", "any_of": [0] }), "scale").contains("cannot have"));
        assert!(bad(json!({ "question": "a", "any_of": [] }), "choice").contains("at least one"));
    }

    #[test]
    fn the_condition_is_kept_when_the_survey_is_saved() {
        let v = MockHost::new()
            .hook(
                &__msk_registry(),
                "before_create",
                "surveys",
                json!({ "title": "T", "questions": json!([
                    { "id": "a", "text": "A", "kind": "choice", "options": ["x", "y"] },
                    { "id": "b", "text": "B", "kind": "text", "show_if": { "question": "a", "any_of": [1, 1] } },
                ]).to_string() }),
            )
            .unwrap()
            .unwrap();
        assert!(v
            .str("questions")
            .contains(r#""show_if":{"any_of":[1],"question":"a"}"#));
    }

    #[test]
    fn a_question_is_asked_only_when_the_condition_is_met() {
        let q = qs(json!({ "question": "a", "any_of": [0] }));
        // answered "yes": the car is asked (and required) and so is the rating (not required)
        assert!(check_answers(&q, &json!({ "a": 0 }))
            .unwrap_err()
            .to_string()
            .contains("question 2"));
        let ok = check_answers(&q, &json!({ "a": 0, "b": "Fiat" })).unwrap();
        assert_eq!(ok.len(), 2);
        // answered "no": the car is not asked, a stray answer is dropped
        let no = check_answers(&q, &json!({ "a": 1, "b": "Fiat", "d": "hi" })).unwrap();
        assert_eq!(no.keys().cloned().collect::<Vec<_>>(), ["a", "d"]);
    }

    #[test]
    fn a_chain_of_conditions_follows_the_shown_questions() {
        let raw = json!([
            { "id": "a", "text": "A", "kind": "multi", "options": ["x", "y", "z"] },
            { "id": "b", "text": "B", "kind": "scale", "show_if": { "question": "a", "any_of": [1] } },
            { "id": "c", "text": "C", "kind": "text", "required": true, "show_if": { "question": "b", "any_of": [4, 5] } },
        ])
        .to_string();
        let q = parse_questions(&raw).unwrap();
        // the scale is shown when y is among the picks; the text when the scale is 4 or 5
        assert!(check_answers(&q, &json!({ "a": [0, 1], "b": 5 })).is_err());
        assert!(check_answers(&q, &json!({ "a": [0, 1], "b": 5, "c": "why" })).is_ok());
        assert!(check_answers(&q, &json!({ "a": [0, 1], "b": 2 })).is_ok());
        // b hidden (no y): c hidden too, even if its own condition value was sent
        let m = check_answers(&q, &json!({ "a": [0], "b": 5, "c": "stray" })).unwrap();
        assert_eq!(m.keys().cloned().collect::<Vec<_>>(), ["a"]);
        let shown = shown_ids(&q, &map(json!({ "a": [1], "b": 4 })));
        assert_eq!(shown.len(), 3);
        assert_eq!(shown_ids(&q, &map(json!({ "a": [2] }))).len(), 1);
    }

    #[test]
    fn an_anonymous_survey_cannot_be_made_named_again() {
        let h = MockHost::new();
        let v = |anon: bool| json!({ "title": "T", "anonymous": anon });
        let make = h
            .hook(&__msk_registry(), "before_create", "surveys", v(true))
            .unwrap()
            .unwrap();
        assert!(make.bool("anonymous"));
        let named = h
            .hook_with_previous(
                &__msk_registry(),
                "before_update",
                "surveys",
                v(false),
                v(true),
            )
            .unwrap_err();
        assert!(named.contains("anonymous"));
        assert!(h
            .hook_with_previous(
                &__msk_registry(),
                "before_update",
                "surveys",
                v(true),
                v(false)
            )
            .is_ok());
    }
}
