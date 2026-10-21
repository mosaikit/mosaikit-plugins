//! Plugin Attività: data di completamento automatica e priorità di default.

use mosaikit_plugin_sdk::prelude::*;

/// La data arriva dal kernel nel contesto? No: il guest non ha orologio. La
/// data di completamento si calcola in SQL (`current_date`) via `db.query`.
fn today(ctx: &Ctx) -> Result<String> {
    let row = ctx.db().query_one("select current_date::text as d", &[])?;
    Ok(row
        .and_then(|r| r.get("d").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_default())
}

fn normalize(ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    if v.str("priority").is_empty() {
        v.set("priority", "media");
    }
    let was_done = hook.previous.as_ref().is_some_and(|p| p.bool("done"));
    match (v.bool("done"), was_done) {
        (true, false) => {
            v.set("completed_on", today(ctx)?);
            if v.str("priority") == "alta" {
                ctx.log("tasks: completata un'attività ad alta priorità");
            }
        }
        (false, _) => v.set("completed_on", Value::Null),
        (true, true) => {
            if let Some(prev) = &hook.previous {
                v.set(
                    "completed_on",
                    prev.get("completed_on").cloned().unwrap_or(Value::Null),
                );
            }
        }
    }
    Ok(Some(v))
}

/// Attività aperte con scadenza passata, visibili all'utente.
fn overdue(ctx: &Ctx, _args: Value) -> Result<Value> {
    let rows = ctx.db().query(
        "select resource_id::text as id, title, due::text as due, priority from tasks
         where not coalesce(done, false) and due < current_date order by due",
        &[],
    )?;
    Ok(Value::Array(rows))
}

mosaikit_plugin_sdk::plugin! {
    hooks: { "tasks.before_create" => normalize, "tasks.before_update" => normalize },
    commands: { "tasks.overdue" => overdue },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn host() -> MockHost {
        MockHost::new().on("db.query", |_| Ok(json!([{ "d": "2026-10-20" }])))
    }

    #[test]
    fn completamento_imposta_la_data() {
        let v = host()
            .hook(
                &__msk_registry(),
                "before_create",
                "tasks",
                json!({ "title": "x", "done": true }),
            )
            .unwrap()
            .unwrap();
        assert_eq!(v.str("completed_on"), "2026-10-20");
        assert_eq!(v.str("priority"), "media");
    }

    #[test]
    fn riapertura_azzera_la_data() {
        let v = host()
            .hook(
                &__msk_registry(),
                "before_create",
                "tasks",
                json!({ "title": "x", "done": false, "completed_on": "2026-01-01" }),
            )
            .unwrap()
            .unwrap();
        assert!(v.get("completed_on").is_none());
    }
}
