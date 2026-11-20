//! What the chat logic decides without the database: the validation of a message, the preview of the last message, the
//! mentions found in a text, the key of a one-to-one chat and the notifications of a new message. Everything here is a
//! pure function so that it can be tested without a host.

use mosaikit_plugin_sdk::prelude::*;

/// Longest text of a message, in characters.
pub const MAX_TEXT: usize = 4000;
/// Most files attached to one message.
pub const MAX_ATTACHMENTS: usize = 10;
/// Most people in one chat.
pub const MAX_MEMBERS: usize = 250;
/// Longest preview of a message in the list of chats, in characters.
pub const PREVIEW: usize = 100;

pub const IMPORTANCE: [&str; 3] = ["normal", "important", "urgent"];

/// A person of a chat as the commands need them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Person {
    pub id: String,
    pub name: String,
    pub muted: bool,
}

pub fn too_long() -> Error {
    Error::coded(
        "message_too_long",
        format!("a message has at most {MAX_TEXT} characters"),
    )
}

/// `true` for the text of an id (a UUID): 36 characters of hex digits and dashes.
pub fn is_id(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, b)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}

/// A name for the screen: trimmed, no control characters, at most `max` characters.
pub fn clean_name(s: &str, max: usize) -> String {
    s.chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(max)
        .collect()
}

/// The key of the one-to-one chat of two people: their ids in order, so both find the same chat.
pub fn pair_key(a: &str, b: &str) -> String {
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    if a <= b {
        format!("{a}:{b}")
    } else {
        format!("{b}:{a}")
    }
}

/// The text of a new or edited message: trimmed, at most [`MAX_TEXT`] characters. Empty is refused unless `allow_empty`
/// (a message made of files only).
pub fn clean_text(text: &str, allow_empty: bool) -> Result<String> {
    let t = text.replace("\r\n", "\n");
    let t = t.trim();
    if t.is_empty() && !allow_empty {
        return Err(Error::coded("message_empty", "a message cannot be empty"));
    }
    if t.chars().count() > MAX_TEXT {
        return Err(too_long());
    }
    Ok(t.to_string())
}

pub fn clean_importance(s: &str) -> Result<&'static str> {
    let s = s.trim();
    if s.is_empty() {
        return Ok("normal");
    }
    IMPORTANCE
        .iter()
        .find(|i| **i == s)
        .copied()
        .ok_or_else(|| {
            Error::coded(
                "importance_invalid",
                "the importance is normal, important or urgent",
            )
        })
}

/// The files attached to a message, as the page sends them: `[{ id, name, size?, mime? }]`; at most [`MAX_ATTACHMENTS`],
/// only these four keys are kept.
pub fn clean_attachments(v: &Value) -> Result<Vec<Value>> {
    let Some(list) = v.as_array() else {
        return Ok(Vec::new());
    };
    if list.len() > MAX_ATTACHMENTS {
        return Err(Error::coded(
            "too_many_files",
            format!("a message has at most {MAX_ATTACHMENTS} files"),
        ));
    }
    let mut out = Vec::new();
    for a in list {
        let id = a.get("id").and_then(Value::as_str).unwrap_or_default();
        let name = clean_name(
            a.get("name").and_then(Value::as_str).unwrap_or_default(),
            200,
        );
        if !is_id(id) || name.is_empty() {
            return Err(Error::coded(
                "attachment_invalid",
                "a file needs an id and a name",
            ));
        }
        out.push(json!({
            "id": id,
            "name": name,
            "size": a.get("size").and_then(Value::as_u64).unwrap_or(0),
            "mime": clean_name(a.get("mime").and_then(Value::as_str).unwrap_or_default(), 100),
        }));
    }
    Ok(out)
}

/// An emoji of a reaction: one to sixteen characters, no spaces and no letters or digits of the alphabet.
pub fn clean_emoji(s: &str) -> Result<String> {
    let e = s.trim();
    if e.is_empty()
        || e.chars().count() > 16
        || e.chars()
            .any(|c| c.is_whitespace() || c.is_control() || c.is_ascii_alphanumeric())
    {
        return Err(Error::coded("emoji_invalid", "a reaction is one emoji"));
    }
    Ok(e.to_string())
}

/// A short plain version of a text for the list of chats: marks of Markdown taken out, lines joined.
pub fn plain(text: &str) -> String {
    let mut out = String::new();
    for line in text.lines() {
        let l = line
            .trim_start_matches(['>', '#', ' '])
            .trim_start_matches("- ")
            .trim_start_matches("* ");
        if !out.is_empty() {
            out.push(' ');
        }
        out.push_str(l.trim());
    }
    for mark in ["**", "~~", "++", "__", "`", "*"] {
        out = out.replace(mark, "");
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn cut(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let mut t: String = s.chars().take(n.saturating_sub(1)).collect();
        t.push('…');
        t
    }
}

/// The preview of a message in the list of chats: the text, or the first file, or the sign of a call.
pub fn preview(kind: &str, text: &str, files: &[Value]) -> String {
    if kind == "call" {
        return "📞".to_string();
    }
    let p = plain(text);
    if !p.is_empty() {
        return cut(&p, PREVIEW);
    }
    match files
        .first()
        .and_then(|f| f.get("name"))
        .and_then(Value::as_str)
    {
        Some(name) => cut(&format!("📎 {name}"), PREVIEW),
        None => String::new(),
    }
}

fn boundary_after(rest: &str) -> bool {
    rest.chars().next().is_none_or(|c| !c.is_alphanumeric())
}

/// The ids of the people a text mentions with `@Name` (case does not matter; the name must end there, so «@Ann» is not
/// «@Anna»), or all of them with `@everyone`. The author is never in the list.
pub fn mentions(text: &str, people: &[Person], author: &str) -> Vec<String> {
    let low = text.to_lowercase();
    let at = |name: &str| -> bool {
        let needle = format!("@{}", name.to_lowercase());
        low.match_indices(&needle)
            .any(|(i, _)| boundary_after(&low[i + needle.len()..]))
    };
    if at("everyone") {
        return people
            .iter()
            .filter(|p| p.id != author)
            .map(|p| p.id.clone())
            .collect();
    }
    people
        .iter()
        .filter(|p| p.id != author && !p.name.trim().is_empty() && at(p.name.trim()))
        .map(|p| p.id.clone())
        .collect()
}

/// A notification of a message before it is handed to the kernel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    pub title: String,
    pub body: String,
    pub to: Vec<String>,
    pub mention: bool,
}

/// Who is told about a message: the people mentioned (also when they muted the chat) get one notice, the others who did
/// not mute the chat another. The author is left out; a notice without recipients is not made.
pub fn plan_notices(
    author: &Person,
    chat_name: &str,
    group: bool,
    preview: &str,
    importance: &str,
    people: &[Person],
    mentioned: &[String],
) -> Vec<Plan> {
    let flag = match importance {
        "urgent" => "❗❗ ",
        "important" => "❗ ",
        _ => "",
    };
    let place = if group && !chat_name.trim().is_empty() {
        format!(" · {}", chat_name.trim())
    } else {
        String::new()
    };
    let mut out = Vec::new();
    let named: Vec<String> = mentioned
        .iter()
        .filter(|m| **m != author.id)
        .cloned()
        .collect();
    if !named.is_empty() {
        out.push(Plan {
            title: format!("{flag}{} mentioned you{place}", author.name),
            body: preview.to_string(),
            to: named.clone(),
            mention: true,
        });
    }
    let others: Vec<String> = people
        .iter()
        .filter(|p| p.id != author.id && !p.muted && !named.contains(&p.id))
        .map(|p| p.id.clone())
        .collect();
    if !others.is_empty() {
        out.push(Plan {
            title: format!("{flag}{}{place}", author.name),
            body: preview.to_string(),
            to: others,
            mention: false,
        });
    }
    out
}

/// A JSON column read as text: the list or object it holds, or `empty` when it is not valid.
pub fn parse_json(s: &str, empty: Value) -> Value {
    if s.trim().is_empty() {
        return empty;
    }
    s.parse::<Value>().unwrap_or(empty)
}

/// A boolean column: PostgreSQL gives `true`, SQLite `1`.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        Some(Value::String(s)) => matches!(s.as_str(), "t" | "true" | "1"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(id: &str, name: &str, muted: bool) -> Person {
        Person {
            id: id.into(),
            name: name.into(),
            muted,
        }
    }

    #[test]
    fn ids_are_uuids() {
        assert!(is_id("0b8e6f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b"));
        for bad in [
            "",
            "abc",
            "0b8e6f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5",
            "0b8e6f5a_1c2d_4e3f_8a9b_0c1d2e3f4a5b",
            "0b8e6f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5z",
        ] {
            assert!(!is_id(bad), "{bad}");
        }
    }

    #[test]
    fn the_key_of_a_pair_does_not_depend_on_the_order() {
        assert_eq!(pair_key("B", "a"), pair_key("a", "B"));
        assert_eq!(pair_key("b", "a"), "a:b");
        assert_eq!(pair_key("a", "a"), "a:a");
    }

    #[test]
    fn a_text_is_trimmed_and_limited() {
        assert_eq!(
            clean_text("  hi \r\n there ", false).unwrap(),
            "hi \n there"
        );
        assert_eq!(
            clean_text("  ", false).unwrap_err().code.as_deref(),
            Some("message_empty")
        );
        assert_eq!(clean_text("  ", true).unwrap(), "");
        assert!(clean_text(&"é".repeat(MAX_TEXT), false).is_ok());
        assert_eq!(
            clean_text(&"x".repeat(MAX_TEXT + 1), false)
                .unwrap_err()
                .code
                .as_deref(),
            Some("message_too_long")
        );
    }

    #[test]
    fn importance_and_emoji_are_checked() {
        assert_eq!(clean_importance("").unwrap(), "normal");
        assert_eq!(clean_importance("urgent").unwrap(), "urgent");
        assert!(clean_importance("loud").is_err());
        assert_eq!(clean_emoji(" 👍 ").unwrap(), "👍");
        for bad in ["", "ab", "👍 👍", "👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍👍"]
        {
            assert!(clean_emoji(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn attachments_keep_four_keys_and_are_limited() {
        let id = "0b8e6f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
        let ok = clean_attachments(&json!([{ "id": id, "name": " a.pdf ", "size": 12, "mime": "application/pdf", "path": "/etc" }])).unwrap();
        assert_eq!(
            ok,
            vec![json!({ "id": id, "name": "a.pdf", "size": 12, "mime": "application/pdf" })]
        );
        assert!(clean_attachments(&json!([{ "id": "x", "name": "a" }])).is_err());
        assert!(clean_attachments(&json!([{ "id": id, "name": "" }])).is_err());
        let many: Vec<Value> = (0..=MAX_ATTACHMENTS)
            .map(|_| json!({ "id": id, "name": "a" }))
            .collect();
        assert_eq!(
            clean_attachments(&Value::Array(many))
                .unwrap_err()
                .code
                .as_deref(),
            Some("too_many_files")
        );
        assert!(clean_attachments(&Value::Null).unwrap().is_empty());
    }

    #[test]
    fn the_preview_is_plain_and_short() {
        assert_eq!(
            preview("message", "**Hello** there\n> quote\n- item", &[]),
            "Hello there quote item"
        );
        assert_eq!(
            preview("message", "", &[json!({ "name": "plan.pdf" })]),
            "📎 plan.pdf"
        );
        assert_eq!(preview("call", "", &[]), "📞");
        assert_eq!(
            preview("message", &"a".repeat(300), &[]).chars().count(),
            PREVIEW
        );
        assert!(preview("message", &"a".repeat(300), &[]).ends_with('…'));
    }

    #[test]
    fn mentions_need_the_whole_name() {
        let people = [
            p("1", "Ann", false),
            p("2", "Anna Rossi", false),
            p("3", "Bob", false),
        ];
        assert_eq!(
            mentions("hi @Anna Rossi and @bob!", &people, "9"),
            ["2", "3"]
        );
        // «@Ann» is not «@Anna»
        assert_eq!(mentions("hi @Anna", &people, "9"), Vec::<String>::new());
        assert_eq!(mentions("hi @ann.", &people, "9"), ["1"]);
        // never the author; @everyone is all the others
        assert_eq!(mentions("@Bob", &people, "3"), Vec::<String>::new());
        assert_eq!(mentions("@everyone look", &people, "3"), ["1", "2"]);
        assert_eq!(mentions("no one here", &people, "9"), Vec::<String>::new());
    }

    #[test]
    fn mentioned_people_hear_it_even_when_muted() {
        let people = [
            p("1", "Ann", false),
            p("2", "Bob", true),
            p("3", "Cy", false),
            p("4", "Di", true),
        ];
        let plans = plan_notices(
            &p("1", "Ann", false),
            "Team",
            true,
            "see this",
            "normal",
            &people,
            &["4".into()],
        );
        assert_eq!(plans.len(), 2);
        assert!(plans[0].mention);
        assert_eq!(plans[0].to, ["4"]);
        assert_eq!(plans[0].title, "Ann mentioned you · Team");
        // the others who did not mute: Cy only (Bob muted, Di already told, Ann is the author)
        assert_eq!(plans[1].to, ["3"]);
        assert_eq!(plans[1].title, "Ann · Team");
        // a one-to-one chat has no place; importance shows in the title
        let one = plan_notices(
            &p("1", "Ann", false),
            "",
            false,
            "now",
            "urgent",
            &[p("1", "Ann", false), p("2", "Bob", false)],
            &[],
        );
        assert_eq!(one.len(), 1);
        assert_eq!(one[0].title, "❗❗ Ann");
        // nobody to tell: nothing made
        assert!(plan_notices(
            &p("1", "Ann", false),
            "",
            false,
            "x",
            "normal",
            &[p("1", "Ann", false)],
            &[]
        )
        .is_empty());
    }

    #[test]
    fn columns_are_read_whatever_the_database() {
        assert!(truthy(Some(&json!(true))) && truthy(Some(&json!(1))) && truthy(Some(&json!("t"))));
        assert!(
            !truthy(Some(&json!(0)))
                && !truthy(Some(&json!(false)))
                && !truthy(None)
                && !truthy(Some(&Value::Null))
        );
        assert_eq!(parse_json("[1]", json!([])), json!([1]));
        assert_eq!(parse_json("nope", json!([])), json!([]));
        assert_eq!(parse_json("", json!({})), json!({}));
    }
}
