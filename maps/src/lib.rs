//! Maps plugin: validates the GeoLibre project and counts its layers (for the KPIs).

use mosaikit_plugin_sdk::prelude::*;

const MAX_CONFIG_BYTES: usize = 8 * 1024 * 1024;

fn check_config(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let raw = v.str("config");
    if raw.len() > MAX_CONFIG_BYTES {
        return Err(Error::msg("configuration over 8 MB"));
    }
    let layers = if raw.trim().is_empty() {
        0
    } else {
        let project: Value = serde_json_from_str(&raw)
            .map_err(|e| Error::msg(format!("configuration is not JSON: {e}")))?;
        if !project.is_object() {
            return Err(Error::msg(
                "the configuration must be a GeoLibre project (JSON object)",
            ));
        }
        project
            .get("layers")
            .and_then(Value::as_array)
            .map_or(0, Vec::len)
    };
    v.set("layers", layers as f64);
    Ok(Some(v))
}

fn serde_json_from_str(s: &str) -> std::result::Result<Value, String> {
    s.parse::<Value>().map_err(|e| e.to_string())
}

mosaikit_plugin_sdk::plugin! {
    hooks: { "maps.before_create" => check_config, "maps.before_update" => check_config },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    #[test]
    fn counts_the_layers() {
        let cfg = json!({ "layers": [{ "id": "a" }, { "id": "b" }] }).to_string();
        let v = MockHost::new()
            .hook(
                &__msk_registry(),
                "before_update",
                "maps",
                json!({ "name": "m", "config": cfg }),
            )
            .unwrap()
            .unwrap();
        assert_eq!(v.f64("layers"), Some(2.0));
        let empty = MockHost::new()
            .hook(
                &__msk_registry(),
                "before_create",
                "maps",
                json!({ "name": "m", "config": "" }),
            )
            .unwrap()
            .unwrap();
        assert_eq!(empty.f64("layers"), Some(0.0));
    }

    #[test]
    fn invalid_configuration() {
        let e = MockHost::new()
            .hook(
                &__msk_registry(),
                "before_create",
                "maps",
                json!({ "name": "m", "config": "{broken" }),
            )
            .unwrap_err();
        assert!(e.contains("not JSON"));
    }
}
