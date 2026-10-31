//! Contacts plugin: lower-case, validated emails and cleaned-up phone numbers.

use mosaikit_plugin_sdk::prelude::*;

fn valid_email(e: &str) -> bool {
    let Some((user, domain)) = e.split_once('@') else {
        return false;
    };
    !user.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !e.chars().any(char::is_whitespace)
        && e.matches('@').count() == 1
}

fn normalize(ctx: &Ctx, hook: &Hook) -> Result<Option<Values>> {
    let mut v = hook.values.clone();
    let email = v.str("email").trim().to_lowercase();
    if !email.is_empty() {
        if !valid_email(&email) {
            return Err(Error::coded(
                "email_invalid",
                format!("invalid email: {email}"),
            ));
        }
        if email != v.str("email") {
            ctx.log("contacts: email normalized");
        }
        v.set("email", email);
    }
    let phone: String = v
        .str("phone")
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '+')
        .collect();
    if !v.str("phone").is_empty() {
        v.set("phone", phone);
    }
    Ok(Some(v))
}

mosaikit_plugin_sdk::plugin! {
    hooks: { "contacts.before_create" => normalize, "contacts.before_update" => normalize },
}

#[cfg(test)]
mod tests {
    use super::*;
    use mosaikit_plugin_sdk::testing::MockHost;

    #[test]
    fn email_normalized_and_phone_cleaned() {
        let v = MockHost::new()
            .hook(
                &__msk_registry(),
                "before_create",
                "contacts",
                json!({ "name": "A", "email": " Mario.Rossi@Example.COM ", "phone": "+39 333-123 456" }),
            )
            .unwrap()
            .unwrap();
        assert_eq!(v.str("email"), "mario.rossi@example.com");
        assert_eq!(v.str("phone"), "+39333123456");
    }

    #[test]
    fn invalid_email_refused() {
        let e = MockHost::new()
            .hook(
                &__msk_registry(),
                "before_create",
                "contacts",
                json!({ "name": "A", "email": "notvalid" }),
            )
            .unwrap_err();
        assert!(e.contains("invalid email"));
    }
}
