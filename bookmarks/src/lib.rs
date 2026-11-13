//! Bookmarks plugin: the rules of a saved link. The address is http or https (https is assumed when no scheme is written),
//! the title falls back to the host name, the tags are a short list of lower-case words kept as a JSON array in the hidden
//! field `tags`, the note is short.

use mosaikit_plugin_sdk::prelude::*;
use mosaikit_plugin_sdk::serde_json;

/// Limits, in characters (tags: in number and in characters each).
const MAX_URL: usize = 2000;
const MAX_TITLE: usize = 160;
const MAX_NOTE: usize = 2000;
const MAX_TAGS: usize = 12;
const MAX_TAG: usize = 30;

/// The scheme written at the start of `url` (lower-case), if any. `host:8080/path` is a host with a port, not a scheme.
fn scheme_of(url: &str) -> Option<String> {
    let (before, after) = url.split_once(':')?;
    let mut chars = before.chars();
    if !chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        || !chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
    {
        return None;
    }
    let digits = after.chars().take_while(char::is_ascii_digit).count();
    let is_port = digits > 0
        && after[digits..]
            .chars()
            .next()
            .is_none_or(|c| matches!(c, '/' | '?' | '#'));
    if is_port {
        return None;
    }
    Some(before.to_ascii_lowercase())
}

/// The host name of an address that already has its scheme: no user, no port, lower-case.
fn host_of(url: &str) -> String {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    let host = authority.rsplit('@').next().unwrap_or_default();
    let host = if host.starts_with('[') {
        host.split_inclusive(']').next().unwrap_or(host)
    } else {
        host.split(':').next().unwrap_or(host)
    };
    host.to_lowercase()
}

/// The address ready to store: trimmed, with its scheme, or a coded error.
fn clean_url(raw: &str) -> Result<String> {
    let url = raw.trim();
    if url.is_empty() {
        return Err(Error::coded(
            "bookmark_url_empty",
            "a bookmark needs an address",
        ));
    }
    if url.chars().count() > MAX_URL {
        return Err(Error::coded(
            "bookmark_url_long",
            format!("an address has at most {MAX_URL} characters"),
        ));
    }
    if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(Error::coded(
            "bookmark_url_invalid",
            "the address cannot contain spaces",
        ));
    }
    let full = match scheme_of(url) {
        Some(s) if s == "http" || s == "https" => {
            if !url.contains("://") {
                return Err(Error::coded(
                    "bookmark_url_invalid",
                    "write the address as https://host/path",
                ));
            }
            url.to_string()
        }
        Some(s) => {
            return Err(Error::coded(
                "bookmark_url_scheme",
                format!("only http and https addresses are allowed, not {s}:"),
            ))
        }
        None => format!("https://{}", url.trim_start_matches('/')),
    };
    if host_of(&full).is_empty() {
        return Err(Error::coded(
            "bookmark_url_invalid",
            "the address has no host name",
        ));
    }
    Ok(full)
}

/// The tags as a clean list: trimmed, lower-case, without empty ones and duplicates.
fn clean_tags(raw: &str) -> Result<Vec<String>> {
    if raw.trim().is_empty() {
        return Ok(vec![]);
    }
    let bad = || Error::coded("bookmark_tags", "the tags are a list of words");
    let parsed: Value = serde_json::from_str(raw).map_err(|_| bad())?;
    let items = parsed.as_array().ok_or_else(bad)?;
    let mut tags: Vec<String> = vec![];
    for item in items {
        let tag = item.as_str().ok_or_else(bad)?.trim().to_lowercase();
        if tag.is_empty() || tags.contains(&tag) {
            continue;
        }
        if tag.chars().count() > MAX_TAG {
            return Err(Error::coded(
                "bookmark_tag_long",
                format!("a tag has at most {MAX_TAG} characters"),
            ));
        }
        tags.push(tag);
    }
    if tags.len() > MAX_TAGS {
        return Err(Error::coded(
            "bookmark_tags_many",
            format!("a bookmark has at most {MAX_TAGS} tags"),
        ));
    }
    Ok(tags)
}

fn bookmark(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let url = clean_url(&v.str("url"))?;
    let mut title: String = v.str("title").trim().chars().take(MAX_TITLE).collect();
    if title.is_empty() {
        title = host_of(&url);
    }
    let note = v.str("note").trim().to_string();
    if note.chars().count() > MAX_NOTE {
        return Err(Error::coded(
            "bookmark_note_long",
            format!("a note has at most {MAX_NOTE} characters"),
        ));
    }
    let tags = clean_tags(&v.str("tags"))?;
    v.set("url", url);
    v.set("title", title);
    v.set("note", note);
    v.set(
        "tags",
        Value::Array(tags.into_iter().map(Value::String).collect::<Vec<_>>()).to_string(),
    );
    Ok(Some(v))
}

/// Most items a list widget shows; the rest is reported as `more`.
const WIDGET_ITEMS: usize = 6;

/// The body of a list widget: at most six items and how many were left out.
fn list_body(items: Vec<Value>) -> Value {
    let more = items.len().saturating_sub(WIDGET_ITEMS);
    json!({ "items": items.into_iter().take(WIDGET_ITEMS).collect::<Vec<_>>(), "more": more })
}

/// Widget `favorites`: the bookmarks marked as favourite that the caller sees, the newest first, with the site of each.
fn widget_favorites(ctx: &Ctx, _args: Value) -> Result<Value> {
    let rows = ctx.db().query(
        "select b.resource_id::text as id, b.title, b.url from bookmarks b join core.visible_resources v on v.id = b.resource_id where v.kind = 'bookmarks' and coalesce(b.favorite, false) order by v.created_at desc limit 500",
        &[],
    )?;
    let items = rows
        .iter()
        .map(|r| {
            let s = |k: &str| r.get(k).and_then(Value::as_str).unwrap_or_default();
            json!({ "id": s("id"), "title": s("title"), "meta": host_of(s("url")), "tone": "" })
        })
        .collect();
    Ok(list_body(items))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "bookmarks.before_create" => bookmark,
        "bookmarks.before_update" => bookmark,
    },
    commands: {
        "bookmarks.widget_favorites" => widget_favorites,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn run(values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), "before_create", "bookmarks", values)
    }

    fn ok(values: Value) -> Values {
        run(values).unwrap().unwrap()
    }

    #[test]
    fn the_fields_are_trimmed() {
        let v = ok(
            json!({ "title": "  Rust  ", "url": "  https://www.rust-lang.org/  ", "note": "  the book  " }),
        );
        assert_eq!(v.str("title"), "Rust");
        assert_eq!(v.str("url"), "https://www.rust-lang.org/");
        assert_eq!(v.str("note"), "the book");
    }

    #[test]
    fn an_address_without_a_scheme_gets_https() {
        assert_eq!(
            ok(json!({ "title": "x", "url": "example.org/a?b=1" })).str("url"),
            "https://example.org/a?b=1"
        );
        assert_eq!(
            ok(json!({ "title": "x", "url": "localhost:8080/app" })).str("url"),
            "https://localhost:8080/app"
        );
        assert_eq!(
            ok(json!({ "title": "x", "url": "http://example.org" })).str("url"),
            "http://example.org"
        );
        assert_eq!(
            ok(json!({ "title": "x", "url": "HTTPS://Example.org" })).str("url"),
            "HTTPS://Example.org"
        );
    }

    #[test]
    fn only_http_and_https_are_allowed() {
        for bad in [
            "javascript:alert(1)",
            "JavaScript:alert(1)",
            "data:text/html,hi",
            "file:///etc/passwd",
            "ftp://example.org",
            "mailto:a@b.c",
            "vbscript:x",
        ] {
            let e = run(json!({ "title": "x", "url": bad })).unwrap_err();
            assert!(e.contains("only http and https"), "{bad}: {e}");
        }
    }

    #[test]
    fn an_address_needs_a_host_and_no_spaces() {
        assert!(run(json!({ "title": "x" }))
            .unwrap_err()
            .contains("needs an address"));
        assert!(run(json!({ "title": "x", "url": "   " }))
            .unwrap_err()
            .contains("needs an address"));
        assert!(run(json!({ "title": "x", "url": "https://" }))
            .unwrap_err()
            .contains("no host"));
        assert!(run(json!({ "title": "x", "url": "https://exa mple.org" }))
            .unwrap_err()
            .contains("spaces"));
    }

    #[test]
    fn the_address_has_a_limit() {
        let long = |n: usize| {
            format!(
                "https://example.org/{}",
                "a".repeat(n - "https://example.org/".len())
            )
        };
        assert!(run(json!({ "title": "x", "url": long(MAX_URL) })).is_ok());
        assert!(run(json!({ "title": "x", "url": long(MAX_URL + 1) }))
            .unwrap_err()
            .contains("at most"));
    }

    #[test]
    fn an_empty_title_becomes_the_host() {
        assert_eq!(
            ok(json!({ "url": "https://User:pw@Docs.Example.org:8443/a/b?c#d" })).str("title"),
            "docs.example.org"
        );
        assert_eq!(
            ok(json!({ "title": "  ", "url": "example.org" })).str("title"),
            "example.org"
        );
        assert_eq!(
            ok(json!({ "title": "Mine", "url": "example.org" })).str("title"),
            "Mine"
        );
    }

    #[test]
    fn tags_are_clean_lower_case_and_unique() {
        let v = ok(
            json!({ "title": "x", "url": "example.org", "tags": "[\" Rust \",\"rust\",\"\",\"Docs\"]" }),
        );
        assert_eq!(v.str("tags"), "[\"rust\",\"docs\"]");
        assert_eq!(
            ok(json!({ "title": "x", "url": "example.org" })).str("tags"),
            "[]"
        );
    }

    #[test]
    fn tags_have_limits_and_a_shape() {
        let many = |n: usize| {
            serde_json::to_string(&(0..n).map(|i| format!("t{i}")).collect::<Vec<_>>()).unwrap()
        };
        assert!(run(json!({ "title": "x", "url": "example.org", "tags": many(MAX_TAGS) })).is_ok());
        assert!(
            run(json!({ "title": "x", "url": "example.org", "tags": many(MAX_TAGS + 1) }))
                .unwrap_err()
                .contains("at most 12 tags")
        );
        let tag = |n: usize| format!("[\"{}\"]", "é".repeat(n));
        assert!(run(json!({ "title": "x", "url": "example.org", "tags": tag(MAX_TAG) })).is_ok());
        assert!(
            run(json!({ "title": "x", "url": "example.org", "tags": tag(MAX_TAG + 1) }))
                .unwrap_err()
                .contains("at most 30")
        );
        for bad in ["not json", "{\"a\":1}", "[1, 2]"] {
            assert!(
                run(json!({ "title": "x", "url": "example.org", "tags": bad }))
                    .unwrap_err()
                    .contains("list of words"),
                "{bad}"
            );
        }
    }

    #[test]
    fn the_note_has_a_limit() {
        assert!(
            run(json!({ "title": "x", "url": "example.org", "note": "é".repeat(MAX_NOTE) }))
                .is_ok()
        );
        assert!(run(
            json!({ "title": "x", "url": "example.org", "note": "é".repeat(MAX_NOTE + 1) })
        )
        .unwrap_err()
        .contains("at most"));
    }

    #[test]
    fn the_favorites_widget_lists_six_and_counts_the_rest() {
        let rows: Vec<Value> = (0..8)
            .map(|i| json!({ "id": format!("id{i}"), "title": format!("T{i}"), "url": format!("https://www.site{i}.org/x") }))
            .collect();
        let host = MockHost::new().on("db.query", move |_| Ok(Value::Array(rows.clone())));
        let out = host
            .command(&__msk_registry(), "bookmarks.widget_favorites", json!({}))
            .unwrap();
        assert_eq!(out["items"].as_array().unwrap().len(), 6);
        assert_eq!(out["more"], 2);
        assert_eq!(
            out["items"][0],
            json!({ "id": "id0", "title": "T0", "meta": "www.site0.org", "tone": "" })
        );
        let none = MockHost::new()
            .on("db.query", |_| Ok(json!([])))
            .command(&__msk_registry(), "bookmarks.widget_favorites", json!({}))
            .unwrap();
        assert_eq!(none, json!({ "items": [], "more": 0 }));
    }
}
