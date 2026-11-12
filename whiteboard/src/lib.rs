//! Whiteboard plugin: the rules of a board. A board has a title (at most 120 characters), a background (plain, dots or
//! grid) and a snapshot: the state of the live document (Yjs) as base64, kept by the writers. The kernel does not read the
//! snapshot, it only bounds its size; the people who have the board open edit it together on a real-time channel.

use mosaikit_plugin_sdk::prelude::*;

const BACKGROUNDS: [&str; 3] = ["plain", "dots", "grid"];
/// Longest title, in characters.
const MAX_TITLE: usize = 120;
/// Longest snapshot, in characters (the kernel accepts 10 MB for a text field: this keeps a board loadable in a blink).
const MAX_SNAPSHOT: usize = 400_000;

fn board(_ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let title: String = v.str("title").trim().to_string();
    if title.is_empty() {
        return Err(Error::coded(
            "board_title_empty",
            "a whiteboard needs a title",
        ));
    }
    if title.chars().count() > MAX_TITLE {
        return Err(Error::coded(
            "board_title_long",
            format!("the title of a whiteboard has at most {MAX_TITLE} characters"),
        ));
    }
    v.set("title", title);
    let bg = v.str("bg");
    if bg.is_empty() {
        v.set("bg", "plain");
    } else if !BACKGROUNDS.contains(&bg.as_str()) {
        return Err(Error::coded(
            "board_background",
            "the background is plain, dots or grid",
        ));
    }
    if v.str("snapshot").chars().count() > MAX_SNAPSHOT {
        return Err(Error::coded(
            "board_too_big",
            "the whiteboard is too big to be saved: delete some drawings",
        ));
    }
    Ok(Some(v))
}

mosaikit_plugin_sdk::plugin! {
    hooks: {
        "whiteboards.before_create" => board,
        "whiteboards.before_update" => board,
    },
    commands: {},
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    fn run(hook: &str, values: Value) -> std::result::Result<Option<Values>, String> {
        MockHost::new().hook(&__msk_registry(), hook, "whiteboards", values)
    }

    #[test]
    fn a_board_is_trimmed_and_plain_by_default() {
        let v = run("before_create", json!({ "title": "  Retro  " }))
            .unwrap()
            .unwrap();
        assert_eq!(v.str("title"), "Retro");
        assert_eq!(v.str("bg"), "plain");
        assert!(run("before_create", json!({ "title": "   " }))
            .unwrap_err()
            .contains("title"));
    }

    #[test]
    fn the_title_has_a_limit() {
        assert!(run("before_create", json!({ "title": "x".repeat(120) })).is_ok());
        assert!(run("before_update", json!({ "title": "x".repeat(121) }))
            .unwrap_err()
            .contains("120"));
    }

    #[test]
    fn the_background_is_one_of_three() {
        for bg in ["plain", "dots", "grid"] {
            assert!(run("before_update", json!({ "title": "x", "bg": bg })).is_ok());
        }
        assert!(run("before_update", json!({ "title": "x", "bg": "lines" }))
            .unwrap_err()
            .contains("grid"));
    }

    #[test]
    fn the_snapshot_has_a_limit() {
        assert!(run(
            "before_update",
            json!({ "title": "x", "snapshot": "A".repeat(400_000) })
        )
        .is_ok());
        assert!(run(
            "before_update",
            json!({ "title": "x", "snapshot": "A".repeat(400_001) })
        )
        .unwrap_err()
        .contains("too big"));
    }

    #[test]
    fn the_hooks_are_registered() {
        let reg = __msk_registry();
        assert!(MockHost::new()
            .hook(
                &reg,
                "before_create",
                "whiteboards",
                json!({ "title": "a" })
            )
            .is_ok());
    }
}
