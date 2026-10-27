//! Notes plugin: default tag at creation, count by tag, whether a translation service is set.

use mosaikit_plugin_sdk::prelude::*;

const DEFAULT_TAG: &str = "personal";

fn before_create(ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    // the default only when the tag is not given at all: «—» chosen in the form (null) stays without a tag
    if hook.values.0.contains_key("tag") {
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

/// Whether a key of the translation service (`[[service_keys]]` of the manifest) is in use for the
/// caller: their own, the tenant's or the platform's. The key itself never leaves the logic.
fn translation_ready(ctx: &Ctx, _args: Value) -> Result<Value> {
    Ok(json!({ "ready": ctx.service_key("translate")?.is_some() }))
}

mosaikit_plugin_sdk::plugin! {
    hooks: { "notes.before_create" => before_create },
    commands: {
        "notes.count_by_tag" => count_by_tag,
        "notes.translation_ready" => translation_ready,
    },
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
        // «—» in the form: no tag, on purpose
        let none = host
            .hook(
                &__msk_registry(),
                "before_create",
                "notes",
                json!({ "title": "x", "tag": null }),
            )
            .unwrap();
        assert_eq!(none, None);
    }

    #[test]
    fn translation_ready() {
        let none = MockHost::new().on("key.get", |_| Ok(Value::Null));
        let out = none
            .command(&__msk_registry(), "notes.translation_ready", json!({}))
            .unwrap();
        assert_eq!(out, json!({ "ready": false }));
        let set = MockHost::new().on("key.get", |req| {
            assert_eq!(req["service"], "translate");
            Ok(json!("secret-key"))
        });
        let out = set
            .command(&__msk_registry(), "notes.translation_ready", json!({}))
            .unwrap();
        assert_eq!(out, json!({ "ready": true }), "the key never goes back");
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
