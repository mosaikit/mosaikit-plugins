//! Plugin Contatti: email in minuscolo e validate, telefono ripulito.

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
            return Err(Error::msg(format!("email non valida: {email}")));
        }
        if email != v.str("email") {
            ctx.log("contacts: email normalizzata");
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
    fn email_normalizzata_e_telefono_ripulito() {
        let v = MockHost::new()
            .hook(
                &__msk_registry(),
                "before_create",
                "contacts",
                json!({ "name": "A", "email": " Mario.Rossi@Esempio.IT ", "phone": "+39 333-123 456" }),
            )
            .unwrap()
            .unwrap();
        assert_eq!(v.str("email"), "mario.rossi@esempio.it");
        assert_eq!(v.str("phone"), "+39333123456");
    }

    #[test]
    fn email_non_valida_rifiutata() {
        let e = MockHost::new()
            .hook(
                &__msk_registry(),
                "before_create",
                "contacts",
                json!({ "name": "A", "email": "nonvalida" }),
            )
            .unwrap_err();
        assert!(e.contains("email non valida"));
    }
}
