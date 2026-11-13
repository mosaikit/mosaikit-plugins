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

/// Most items a list widget shows; the rest is reported as `more`.
const WIDGET_ITEMS: usize = 6;

/// The body of a list widget: at most six items and how many were left out.
fn list_body(items: Vec<Value>) -> Value {
    let more = items.len().saturating_sub(WIDGET_ITEMS);
    json!({ "items": items.into_iter().take(WIDGET_ITEMS).collect::<Vec<_>>(), "more": more })
}

/// The channels with the number of messages in the last day, busiest first; a channel with none is left out.
fn busy(channels: &[Value], counts: &[Value]) -> Vec<Value> {
    let n_of = |id: &str| {
        counts
            .iter()
            .find(|c| c.get("pid").and_then(Value::as_str) == Some(id))
            .and_then(|c| c.get("n").and_then(Value::as_i64))
            .unwrap_or(0)
    };
    let mut list: Vec<(i64, String, String)> = channels
        .iter()
        .filter_map(|c| {
            let id = c.get("id").and_then(Value::as_str)?;
            let n = n_of(id);
            (n > 0).then(|| (n, c.get("name").and_then(Value::as_str).unwrap_or_default().to_string(), id.to_string()))
        })
        .collect();
    list.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    list.into_iter()
        .map(|(n, name, id)| json!({ "id": id, "title": name, "meta": n.to_string(), "tone": "" }))
        .collect()
}

/// Widget `busy-channels`: the channels the caller sees that had messages in the last day, with how many.
fn widget_busy(ctx: &Ctx, _args: Value) -> Result<Value> {
    let channels = ctx.db().query(
        "select v.id::text as id, v.title as name from core.visible_resources v where v.kind = 'channels'",
        &[],
    )?;
    let counts = ctx.db().query(
        "select v.parent_id::text as pid, count(*)::int as n from core.visible_resources v where v.kind = 'messages' and v.created_at >= now() - interval '1 day' group by v.parent_id",
        &[],
    )?;
    Ok(list_body(busy(&channels, &counts)))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "messages.before_create" => message,
        "messages.before_update" => message,
        "channels.before_create" => channel,
        "channels.before_update" => channel,
    },
    commands: {
        "channels.widget_busy" => widget_busy,
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

    #[test]
    fn the_busiest_channels_come_first_and_quiet_ones_are_left_out() {
        let channels = vec![
            json!({ "id": "a", "name": "general" }),
            json!({ "id": "b", "name": "random" }),
            json!({ "id": "c", "name": "quiet" }),
            json!({ "id": "d", "name": "alpha" }),
        ];
        let counts = vec![json!({ "pid": "a", "n": 3 }), json!({ "pid": "b", "n": 9 }), json!({ "pid": "d", "n": 3 })];
        let items = busy(&channels, &counts);
        let names: Vec<&str> = items.iter().map(|i| i["title"].as_str().unwrap()).collect();
        // ties by name
        assert_eq!(names, ["random", "alpha", "general"]);
        assert_eq!(items[0]["meta"], "9");
        assert_eq!(list_body(vec![]), json!({ "items": [], "more": 0 }));
    }

    #[test]
    fn the_busy_widget_asks_for_channels_and_the_messages_of_the_last_day() {
        let host = MockHost::new().on("db.query", |req| {
            let sql = req["sql"].as_str().unwrap_or_default();
            if sql.contains("'messages'") {
                Ok(json!([{ "pid": "a", "n": 2 }]))
            } else {
                Ok(json!([{ "id": "a", "name": "general" }, { "id": "b", "name": "other" }]))
            }
        });
        let out = host
            .command(&__msk_registry(), "channels.widget_busy", json!({}))
            .unwrap();
        assert_eq!(out["items"], json!([{ "id": "a", "title": "general", "meta": "2", "tone": "" }]));
        assert_eq!(out["more"], 0);
    }
}
