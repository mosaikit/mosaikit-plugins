//! Notes plugin: default tag at creation and count by tag.

use mosaikit_plugin_sdk::prelude::*;

const DEFAULT_TAG: &str = "personal";

fn before_create(ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    if !hook.values.str("tag").is_empty() {
        return Ok(None);
    }
    let mut v = hook.values.clone();
    v.set("tag", DEFAULT_TAG);
    ctx.log("notes: default tag applied");
    Ok(Some(v))
}

/// Notes visible to the user, grouped by tag (RLS filters the rows).
fn count_by_tag(ctx: &Ctx, _args: Value) -> Result<Value> {
    let rows = ctx.db().query(
        "select coalesce(tag, '(none)') as tag, count(*)::int as n from notes group by 1 order by 2 desc",
        &[],
    )?;
    Ok(Value::Array(rows))
}

mosaikit_plugin_sdk::plugin! {
    hooks: { "notes.before_create" => before_create },
    commands: { "notes.count_by_tag" => count_by_tag },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    #[test]
    fn default_tag() {
        let host = MockHost::new();
        let v = host
            .hook(
                &__msk_registry(),
                "before_create",
                "notes",
                json!({ "title": "x" }),
            )
            .unwrap();
        assert_eq!(v.unwrap().str("tag"), DEFAULT_TAG);
        let keep = host
            .hook(
                &__msk_registry(),
                "before_create",
                "notes",
                json!({ "tag": "work" }),
            )
            .unwrap();
        assert_eq!(keep, None);
    }

    #[test]
    fn count() {
        let host = MockHost::new().on("db.query", |_| Ok(json!([{ "tag": "work", "n": 2 }])));
        let out = host
            .command(&__msk_registry(), "notes.count_by_tag", json!({}))
            .unwrap();
        assert_eq!(out, json!([{ "tag": "work", "n": 2 }]));
    }
}
