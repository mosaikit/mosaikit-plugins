//! Chat plugin: the rules of a message. The text is trimmed, never empty and at most 4000 characters (a message also travels
//! in a real-time frame of 16 KB); a message whose text changed is marked as edited; the reactions are a small JSON object.

use mosaikit_plugin_sdk::prelude::*;

/// Longest text of a message, in characters.
const MAX_TEXT: usize = 4000;
/// Most different reactions on a message, and most people on one reaction.
const MAX_REACTIONS: usize = 24;

fn too_long() -> Error {
    Error::coded(
        "message_too_long",
        format!("a message has at most {MAX_TEXT} characters"),
    )
}

fn message(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let text = v.str("text").trim().to_string();
    if text.is_empty() {
        return Err(Error::coded("message_empty", "a message cannot be empty"));
    }
    if text.chars().count() > MAX_TEXT {
        return Err(too_long());
    }
    // a change of the text on an existing message marks it; reactions alone do not
    if let Some(prev) = &hook.previous {
        v.set("edited", prev.bool("edited") || prev.str("text") != text);
    }
    v.set("text", text);
    let reactions = v.str("reactions");
    if !reactions.is_empty() {
        let ok = reactions
            .parse::<Value>()
            .ok()
            .and_then(|r| {
                r.as_object().map(|o| {
                    o.len() <= MAX_REACTIONS
                        && o.values()
                            .all(|p| p.as_array().is_some_and(|a| a.len() <= 500))
                })
            })
            .unwrap_or(false);
        if !ok {
            return Err(Error::coded(
                "reactions_invalid",
                "the reactions are not valid",
            ));
        }
    }
    Ok(Some(v))
}

fn channel(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let name: String = v.str("name").trim().chars().take(60).collect();
    if name.is_empty() {
        return Err(Error::coded("channel_name_empty", "a channel needs a name"));
    }
    v.set("name", name);
    let topic: String = v.str("topic").trim().chars().take(200).collect();
    v.set("topic", topic);
    Ok(Some(v))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "messages.before_create" => message,
        "messages.before_update" => message,
        "channels.before_create" => channel,
        "channels.before_update" => channel,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn run(
        hook: &str,
        resource: &str,
        values: Value,
        previous: Option<Value>,
    ) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook_with_previous(&__msk_registry(), hook, resource, values, previous)
    }

    #[test]
    fn a_message_is_trimmed_and_not_empty() {
        let v = run(
            "before_create",
            "messages",
            json!({ "text": "  hello  " }),
            None,
        )
        .unwrap()
        .unwrap();
        assert_eq!(v.str("text"), "hello");
        assert!(v.get("edited").is_none());
        let e = run("before_create", "messages", json!({ "text": "   " }), None).unwrap_err();
        assert!(e.contains("empty"), "{e}");
    }

    #[test]
    fn a_message_has_a_limit() {
        let ok = "é".repeat(MAX_TEXT);
        assert!(run("before_create", "messages", json!({ "text": ok }), None).is_ok());
        let e = run(
            "before_create",
            "messages",
            json!({ "text": "x".repeat(MAX_TEXT + 1) }),
            None,
        )
        .unwrap_err();
        assert!(e.contains("at most"), "{e}");
    }

    #[test]
    fn only_a_change_of_the_text_marks_a_message_as_edited() {
        let prev = json!({ "text": "one", "edited": false });
        let same = run(
            "before_update",
            "messages",
            json!({ "text": "one", "reactions": "{\"👍\":[\"u1\"]}" }),
            Some(prev.clone()),
        )
        .unwrap()
        .unwrap();
        assert!(!same.bool("edited"));
        let changed = run(
            "before_update",
            "messages",
            json!({ "text": "two" }),
            Some(prev),
        )
        .unwrap()
        .unwrap();
        assert!(changed.bool("edited"));
        // once edited, always edited
        let again = run(
            "before_update",
            "messages",
            json!({ "text": "two" }),
            Some(json!({ "text": "two", "edited": true })),
        )
        .unwrap()
        .unwrap();
        assert!(again.bool("edited"));
    }

    #[test]
    fn reactions_must_be_a_small_object_of_lists() {
        for bad in ["nope", "[]", "{\"a\":1}"] {
            let e = run(
                "before_update",
                "messages",
                json!({ "text": "x", "reactions": bad }),
                Some(json!({ "text": "x" })),
            )
            .unwrap_err();
            assert!(e.contains("not valid"), "{bad}: {e}");
        }
    }

    #[test]
    fn a_channel_needs_a_name() {
        let v = run(
            "before_create",
            "channels",
            json!({ "name": "  general ", "topic": " Everything " }),
            None,
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            (v.str("name").as_str(), v.str("topic").as_str()),
            ("general", "Everything")
        );
        assert!(run("before_create", "channels", json!({ "name": " " }), None).is_err());
    }
}
