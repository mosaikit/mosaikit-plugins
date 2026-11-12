//! Snippets plugin: the rules of a snippet, a reusable text or piece of code. A snippet has a title, a body kept exactly
//! as written (only the trailing line breaks go), a kind (plain text by default) and tags (a JSON array of short,
//! lower-case words, with no repetition).

use mosaikit_plugin_sdk::prelude::*;
use mosaikit_plugin_sdk::serde_json;

const KINDS: [&str; 9] = [
    "text",
    "shell",
    "sql",
    "json",
    "javascript",
    "python",
    "rust",
    "markdown",
    "other",
];
/// Limits, in characters.
const MAX_TITLE: usize = 120;
const MAX_BODY: usize = 20000;
const MAX_TAGS: usize = 12;
const MAX_TAG: usize = 30;

/// The tags as written in the field (a JSON array of strings; empty text is no tag): trimmed, lower-cased, without repeats.
fn tags_of(raw: &str) -> Result<Vec<String>> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let items = match serde_json::from_str::<Value>(raw) {
        Ok(Value::Array(a)) => a,
        _ => return Err(Error::coded("snippet_tags", "the tags are a list of words")),
    };
    let mut tags: Vec<String> = Vec::new();
    for item in items {
        let Value::String(s) = item else {
            return Err(Error::coded("snippet_tags", "the tags are a list of words"));
        };
        let tag = s.trim().to_lowercase();
        if tag.is_empty() || tags.contains(&tag) {
            continue;
        }
        if tag.chars().count() > MAX_TAG {
            return Err(Error::coded(
                "snippet_tag_long",
                format!("a tag has at most {MAX_TAG} characters"),
            ));
        }
        tags.push(tag);
    }
    if tags.len() > MAX_TAGS {
        return Err(Error::coded(
            "snippet_tags_many",
            format!("a snippet has at most {MAX_TAGS} tags"),
        ));
    }
    Ok(tags)
}

fn snippet(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let title = v.str("title").trim().to_string();
    if title.is_empty() {
        return Err(Error::coded(
            "snippet_title_empty",
            "a snippet needs a title",
        ));
    }
    if title.chars().count() > MAX_TITLE {
        return Err(Error::coded(
            "snippet_title_long",
            format!("the title of a snippet has at most {MAX_TITLE} characters"),
        ));
    }
    v.set("title", title);

    // the inside of the body is the snippet: only the line breaks at the very end are dropped
    let body = v.str("body");
    if body.trim().is_empty() {
        return Err(Error::coded(
            "snippet_body_empty",
            "a snippet needs a content",
        ));
    }
    let body = body.trim_end_matches(['\n', '\r']).to_string();
    if body.chars().count() > MAX_BODY {
        return Err(Error::coded(
            "snippet_body_long",
            format!("the content of a snippet has at most {MAX_BODY} characters"),
        ));
    }
    v.set("body", body);

    let kind = v.str("kind");
    if kind.is_empty() {
        v.set("kind", "text");
    } else if !KINDS.contains(&kind.as_str()) {
        return Err(Error::coded(
            "snippet_kind",
            "the kind is text, shell, sql, json, javascript, python, rust, markdown or other",
        ));
    }

    let tags = tags_of(&v.str("tags"))?;
    v.set(
        "tags",
        serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string()),
    );
    Ok(Some(v))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "snippets.before_create" => snippet,
        "snippets.before_update" => snippet,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn run(values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), "before_create", "snippets", values)
    }

    #[test]
    fn the_title_is_trimmed_required_and_limited() {
        let v = run(json!({ "title": "  Deploy  ", "body": "x" }))
            .unwrap()
            .unwrap();
        assert_eq!(v.str("title"), "Deploy");
        assert!(run(json!({ "title": "   ", "body": "x" }))
            .unwrap_err()
            .contains("title"));
        assert!(run(json!({ "body": "x" })).unwrap_err().contains("title"));
        assert!(run(json!({ "title": "é".repeat(MAX_TITLE), "body": "x" })).is_ok());
        assert!(
            run(json!({ "title": "é".repeat(MAX_TITLE + 1), "body": "x" }))
                .unwrap_err()
                .contains("at most")
        );
    }

    #[test]
    fn the_body_is_required_and_limited() {
        assert!(run(json!({ "title": "x" }))
            .unwrap_err()
            .contains("content"));
        assert!(run(json!({ "title": "x", "body": " \n\t " }))
            .unwrap_err()
            .contains("content"));
        assert!(run(json!({ "title": "x", "body": "é".repeat(MAX_BODY) })).is_ok());
        assert!(
            run(json!({ "title": "x", "body": "é".repeat(MAX_BODY + 1) }))
                .unwrap_err()
                .contains("at most")
        );
    }

    #[test]
    fn the_body_is_kept_as_written_but_for_the_final_line_breaks() {
        let v = run(json!({ "title": "x", "body": "  if x:\n\tgo()\n\n  done  \n\r\n\n" }))
            .unwrap()
            .unwrap();
        assert_eq!(v.str("body"), "  if x:\n\tgo()\n\n  done  ");
    }

    #[test]
    fn the_kind_is_text_by_default_and_one_of_the_list() {
        assert_eq!(
            run(json!({ "title": "x", "body": "y" }))
                .unwrap()
                .unwrap()
                .str("kind"),
            "text"
        );
        for k in KINDS {
            assert_eq!(
                run(json!({ "title": "x", "body": "y", "kind": k }))
                    .unwrap()
                    .unwrap()
                    .str("kind"),
                k
            );
        }
        assert!(run(json!({ "title": "x", "body": "y", "kind": "cobol" }))
            .unwrap_err()
            .contains("kind"));
    }

    #[test]
    fn tags_are_trimmed_lower_cased_and_without_repeats() {
        let v = run(
            json!({ "title": "x", "body": "y", "tags": "[\" Ops \",\"SQL\",\"ops\",\"\",\"  \"]" }),
        )
        .unwrap()
        .unwrap();
        assert_eq!(v.str("tags"), "[\"ops\",\"sql\"]");
        let none = run(json!({ "title": "x", "body": "y" })).unwrap().unwrap();
        assert_eq!(none.str("tags"), "[]");
    }

    #[test]
    fn tags_are_a_json_array_of_words() {
        assert!(
            run(json!({ "title": "x", "body": "y", "tags": "ops, sql" }))
                .unwrap_err()
                .contains("list of words")
        );
        assert!(
            run(json!({ "title": "x", "body": "y", "tags": "{\"a\":1}" }))
                .unwrap_err()
                .contains("list of words")
        );
        assert!(run(json!({ "title": "x", "body": "y", "tags": "[1,2]" }))
            .unwrap_err()
            .contains("list of words"));
    }

    #[test]
    fn tags_have_limits() {
        let long = "a".repeat(MAX_TAG);
        assert!(
            run(json!({ "title": "x", "body": "y", "tags": json!([long]).to_string() })).is_ok()
        );
        let too_long = "a".repeat(MAX_TAG + 1);
        assert!(
            run(json!({ "title": "x", "body": "y", "tags": json!([too_long]).to_string() }))
                .unwrap_err()
                .contains("at most")
        );
        let twelve: Vec<String> = (0..MAX_TAGS).map(|i| format!("t{i}")).collect();
        assert!(
            run(json!({ "title": "x", "body": "y", "tags": json!(twelve).to_string() })).is_ok()
        );
        let thirteen: Vec<String> = (0..=MAX_TAGS).map(|i| format!("t{i}")).collect();
        assert!(
            run(json!({ "title": "x", "body": "y", "tags": json!(thirteen).to_string() }))
                .unwrap_err()
                .contains("at most")
        );
    }

    #[test]
    fn the_update_hook_applies_the_same_rules() {
        let r = MockHost::new().hook(
            &__msk_registry(),
            "before_update",
            "snippets",
            json!({ "title": "x", "body": "y", "kind": "cobol" }),
        );
        assert!(r.unwrap_err().contains("kind"));
    }
}
