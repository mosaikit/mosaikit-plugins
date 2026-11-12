//! Dashboard plugin: boards of widgets. A board is a person's arrangement (name, ordered widget keys, columns); the
//! widgets are contributions of the other plugins to the point `com.mosaikit.dashboard.widget`. The command
//! `dashboard.widgets` lists the contributions, asks each one for its data (as the caller, so every plugin applies its
//! own access rules) and never lets one failing widget fail the others.
//!
//! The contract of a contribution, `data` of `[[contributes]]`: `command` (command of the contributor, called with `{}`),
//! `kind` (`number` or `list`), `size` (`s`, `m`, `l`) and `texts` (per language: `label`, `secondary`, `empty`). A
//! `number` command answers `{ value, secondary, tone }`; a `list` command `{ items: [{ id, title, meta, tone }], more }`.

use mosaikit_plugin_sdk::prelude::*;

const POINT: &str = "com.mosaikit.dashboard.widget";
const MAX_NAME: usize = 80;
const MAX_WIDGETS: usize = 24;
const MAX_ITEMS: usize = 6;
const COLUMNS: [&str; 3] = ["auto", "2", "3"];
const TONES: [&str; 4] = ["", "ok", "warn", "err"];
const SIZES: [&str; 3] = ["s", "m", "l"];

// ------------------------------------------------------------------------------------------------ the rules of a board

/// A widget key is `<plugin>:<id>`: both parts not empty.
fn is_widget_key(k: &str) -> bool {
    match k.split_once(':') {
        Some((p, i)) => !p.is_empty() && !i.is_empty() && !i.contains(':') && k.len() <= 200,
        None => false,
    }
}

/// The widget keys of a board: a JSON array of strings, at most 24, no repeats, each `<plugin>:<id>`. An empty value is
/// an empty board.
fn check_widgets(raw: &str) -> std::result::Result<Vec<String>, &'static str> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let v: Value = mosaikit_plugin_sdk::serde_json::from_str(raw)
        .map_err(|_| "the widgets of a board are a list")?;
    let arr = v.as_array().ok_or("the widgets of a board are a list")?;
    if arr.len() > MAX_WIDGETS {
        return Err("a board has at most 24 widgets");
    }
    let mut keys: Vec<String> = Vec::new();
    for x in arr {
        let k = x.as_str().ok_or("every widget is a key like plugin:id")?;
        if !is_widget_key(k) {
            return Err("every widget is a key like plugin:id");
        }
        if keys.iter().any(|y| y == k) {
            return Err("a widget appears twice on the board");
        }
        keys.push(k.to_string());
    }
    Ok(keys)
}

fn board(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let name: String = v.str("name").trim().to_string();
    if name.is_empty() {
        return Err(Error::coded("board_name_empty", "a board needs a name"));
    }
    if name.chars().count() > MAX_NAME {
        return Err(Error::coded(
            "board_name_long",
            format!("the name of a board has at most {MAX_NAME} characters"),
        ));
    }
    v.set("name", name);
    let keys = check_widgets(&v.str("widgets")).map_err(|m| Error::coded("board_widgets", m))?;
    v.set("widgets", Value::String(Value::from(keys).to_string()));
    let columns = v.str("columns");
    if columns.is_empty() {
        v.set("columns", "auto");
    } else if !COLUMNS.contains(&columns.as_str()) {
        return Err(Error::coded(
            "board_columns",
            "the columns are auto, 2 or 3",
        ));
    }
    Ok(Some(v))
}

// ---------------------------------------------------------------------------------------------- the widgets (pure part)

/// Whether the `data` of a contribution follows the contract; otherwise why not.
fn check_data(data: &Value) -> std::result::Result<(), &'static str> {
    let command = data
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if command.is_empty() {
        return Err("the widget names no command");
    }
    let kind = data.get("kind").and_then(Value::as_str).unwrap_or_default();
    if kind != "number" && kind != "list" {
        return Err("the kind of the widget is number or list");
    }
    let size = data.get("size").and_then(Value::as_str).unwrap_or("m");
    if !SIZES.contains(&size) {
        return Err("the size of the widget is s, m or l");
    }
    Ok(())
}

fn tone_of(v: Option<&Value>) -> &'static str {
    let t = v.and_then(Value::as_str).unwrap_or_default();
    TONES.iter().copied().find(|x| *x == t).unwrap_or("")
}

fn short(v: Option<&Value>, max: usize) -> String {
    v.and_then(Value::as_str)
        .unwrap_or_default()
        .chars()
        .take(max)
        .collect()
}

/// Keeps what the contract allows of the answer of a widget command and drops the rest (a contributor cannot send
/// the page anything else). `Err` when the shape is wrong.
fn check_result(kind: &str, r: &Value) -> std::result::Result<Value, &'static str> {
    match kind {
        "number" => {
            let value = r
                .get("value")
                .and_then(Value::as_i64)
                .ok_or("the widget answered without a number")?;
            let secondary = r.get("secondary").and_then(Value::as_i64);
            Ok(json!({ "value": value, "secondary": secondary, "tone": tone_of(r.get("tone")) }))
        }
        "list" => {
            let items = r
                .get("items")
                .and_then(Value::as_array)
                .ok_or("the widget answered without a list")?;
            let mut out = Vec::new();
            let mut extra = 0i64;
            for it in items {
                if out.len() == MAX_ITEMS {
                    extra += 1;
                    continue;
                }
                let id = it.get("id").and_then(Value::as_str).map(|s| s.to_string());
                out.push(json!({
                    "id": id,
                    "title": short(it.get("title"), 200),
                    "meta": short(it.get("meta"), 200),
                    "tone": tone_of(it.get("tone")),
                }));
            }
            let more = r.get("more").and_then(Value::as_i64).unwrap_or(0).max(0) + extra;
            Ok(json!({ "items": out, "more": more }))
        }
        _ => Err("the kind of the widget is number or list"),
    }
}

/// Plugin and id order, the one the host already gives; kept here so the answer does not depend on it.
fn order(list: &mut [Value]) {
    list.sort_by(|a, b| {
        let key = |v: &Value| (short(v.get("plugin"), 200), short(v.get("id"), 200));
        key(a).cmp(&key(b))
    });
}

// -------------------------------------------------------------------------------------------------------- the commands

/// The widgets the caller can have: every contribution, with its data asked now. A widget that fails has `error`.
fn widgets(ctx: &Ctx, _args: Value) -> Result<Value> {
    let listed = ctx.resources().contributions(POINT)?;
    let mut list: Vec<Value> = listed.as_array().cloned().unwrap_or_default();
    order(&mut list);
    let mut out = Vec::new();
    for c in &list {
        let plugin = short(c.get("plugin"), 200);
        let id = short(c.get("id"), 200);
        let data = c.get("data").cloned().unwrap_or(Value::Null);
        let mut item = json!({
            "plugin": plugin,
            "id": id,
            "label": c.get("label").cloned().unwrap_or(Value::Null),
            "data": data,
        });
        let outcome = match check_data(&data) {
            Err(m) => Err(m.to_string()),
            Ok(()) => {
                let command = short(data.get("command"), 200);
                let kind = short(data.get("kind"), 20);
                match ctx.call_plugin(&plugin, &command, json!({})) {
                    Ok(r) => check_result(&kind, &r).map_err(|m| m.to_string()),
                    Err(e) => Err(e.to_string().chars().take(160).collect()),
                }
            }
        };
        match outcome {
            Ok(r) => item["result"] = r,
            Err(m) => item["error"] = Value::String(m),
        }
        out.push(item);
    }
    Ok(Value::Array(out))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "boards.before_create" => board,
        "boards.before_update" => board,
    },
    commands: {
        "dashboard.widgets" => widgets,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn run(values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), "before_create", "boards", values)
    }

    #[test]
    fn a_board_needs_a_trimmed_name_of_at_most_80() {
        let v = run(json!({ "name": "  Morning  " })).unwrap().unwrap();
        assert_eq!(v.str("name"), "Morning");
        assert_eq!(v.str("columns"), "auto");
        assert_eq!(v.str("widgets"), "[]");
        assert!(run(json!({ "name": "  " })).unwrap_err().contains("name"));
        assert!(run(json!({ "name": "x".repeat(80) })).is_ok());
        assert!(run(json!({ "name": "x".repeat(81) }))
            .unwrap_err()
            .contains("at most"));
    }

    #[test]
    fn the_widgets_are_a_list_without_repeats() {
        let ok =
            run(json!({ "name": "a", "widgets": "[\"com.x.tasks:open\",\"com.x.notes:recent\"]" }))
                .unwrap()
                .unwrap();
        assert_eq!(
            ok.str("widgets"),
            "[\"com.x.tasks:open\",\"com.x.notes:recent\"]"
        );
        for bad in [
            "not json",
            "{\"a\":1}",
            "[1]",
            "[\"nocolon\"]",
            "[\"a:\"]",
            "[\":b\"]",
            "[\"a:b\",\"a:b\"]",
        ] {
            assert!(
                run(json!({ "name": "a", "widgets": bad })).is_err(),
                "{bad}"
            );
        }
        let many: Vec<String> = (0..25).map(|i| format!("p:{i}")).collect();
        assert!(
            run(json!({ "name": "a", "widgets": Value::from(many).to_string() }))
                .unwrap_err()
                .contains("at most 24")
        );
        let max: Vec<String> = (0..24).map(|i| format!("p:{i}")).collect();
        assert!(run(json!({ "name": "a", "widgets": Value::from(max).to_string() })).is_ok());
    }

    #[test]
    fn the_columns_are_auto_2_or_3() {
        for c in ["auto", "2", "3"] {
            assert!(run(json!({ "name": "a", "columns": c })).is_ok(), "{c}");
        }
        assert!(run(json!({ "name": "a", "columns": "4" }))
            .unwrap_err()
            .contains("columns"));
    }

    #[test]
    fn data_follows_the_contract_or_is_refused() {
        assert!(
            check_data(&json!({ "command": "tasks.widget", "kind": "number", "size": "s" }))
                .is_ok()
        );
        assert!(check_data(&json!({ "command": "tasks.widget", "kind": "list" })).is_ok());
        assert!(check_data(&json!({ "kind": "list" })).is_err());
        assert!(check_data(&json!({ "command": "x", "kind": "chart" })).is_err());
        assert!(check_data(&json!({ "command": "x", "kind": "list", "size": "xl" })).is_err());
        assert!(check_data(&Value::Null).is_err());
    }

    #[test]
    fn a_number_result_keeps_only_what_the_contract_allows() {
        let r = check_result(
            "number",
            &json!({ "value": 4, "secondary": 1, "tone": "warn", "html": "<b>" }),
        )
        .unwrap();
        assert_eq!(r, json!({ "value": 4, "secondary": 1, "tone": "warn" }));
        let r = check_result(
            "number",
            &json!({ "value": 0, "secondary": null, "tone": "loud" }),
        )
        .unwrap();
        assert_eq!(r, json!({ "value": 0, "secondary": null, "tone": "" }));
        assert!(check_result("number", &json!({ "value": "4" })).is_err());
        assert!(check_result("number", &json!({ "items": [] })).is_err());
    }

    #[test]
    fn a_list_result_has_six_items_and_counts_the_rest() {
        let items: Vec<Value> = (0..8)
            .map(|i| json!({ "id": format!("r{i}"), "title": format!("T{i}"), "meta": "m", "tone": "err" }))
            .collect();
        let r = check_result("list", &json!({ "items": items, "more": 5 })).unwrap();
        assert_eq!(r["items"].as_array().unwrap().len(), 6);
        assert_eq!(r["more"], 7);
        let r = check_result("list", &json!({ "items": [{ "id": null, "title": "x" }] })).unwrap();
        assert_eq!(
            r["items"][0],
            json!({ "id": null, "title": "x", "meta": "", "tone": "" })
        );
        assert_eq!(r["more"], 0);
        assert!(check_result("list", &json!({ "value": 1 })).is_err());
        assert!(check_result("other", &json!({})).is_err());
    }

    #[test]
    fn contributions_are_ordered_by_plugin_and_id() {
        let mut l = vec![
            json!({ "plugin": "b", "id": "x" }),
            json!({ "plugin": "a", "id": "z" }),
            json!({ "plugin": "a", "id": "y" }),
        ];
        order(&mut l);
        let ids: Vec<String> = l
            .iter()
            .map(|v| {
                format!(
                    "{}:{}",
                    v["plugin"].as_str().unwrap(),
                    v["id"].as_str().unwrap()
                )
            })
            .collect();
        assert_eq!(ids, ["a:y", "a:z", "b:x"]);
    }

    #[test]
    fn a_failing_widget_does_not_fail_the_others() {
        let host = MockHost::new()
            .on("contributions.list", |_| {
                Ok(json!([
                    { "plugin": "com.x.notes", "id": "recent", "label": "Recent notes",
                      "data": { "command": "notes.widget", "kind": "list", "size": "m" } },
                    { "plugin": "com.x.tasks", "id": "open", "label": "Open tasks",
                      "data": { "command": "tasks.widget", "kind": "number", "size": "s" } },
                    { "plugin": "com.x.tasks", "id": "bad", "label": "Bad",
                      "data": { "kind": "number" } },
                ]))
            })
            .with_plugin_command("com.x.tasks", "tasks.widget", |_| {
                Ok(json!({ "value": 3, "secondary": 1, "tone": "warn" }))
            })
            .with_plugin_command("com.x.notes", "notes.widget", |_| Err("boom".to_string()));
        let out = host
            .command(&__msk_registry(), "dashboard.widgets", json!({}))
            .unwrap();
        let a = out.as_array().unwrap();
        assert_eq!(a.len(), 3);
        // ordered by plugin then id: notes:recent, tasks:bad, tasks:open
        assert_eq!(a[0]["id"], "recent");
        assert!(a[0]["error"].as_str().unwrap().contains("boom"));
        assert!(a[0].get("result").is_none());
        assert_eq!(a[1]["id"], "bad");
        assert!(a[1]["error"].is_string());
        assert_eq!(a[2]["id"], "open");
        assert_eq!(a[2]["result"]["value"], 3);
        assert_eq!(a[2]["label"], "Open tasks");
    }

    #[test]
    fn the_commands_are_registered() {
        assert!(__msk_registry()
            .command_names()
            .contains(&"dashboard.widgets"));
    }
}
