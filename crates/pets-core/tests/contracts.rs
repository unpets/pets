use pets_core::{Persona, Representation};

#[test]
fn bundled_default_persona_obeys_the_shared_contract() {
    let persona =
        Persona::from_json(include_str!("../../../personas/kernel/persona.json")).unwrap();
    assert_eq!(persona.id, "kernel");
    assert_eq!(persona.name, "Kernel");
    assert!(matches!(
        persona.representation,
        Representation::Model { .. }
    ));
}

#[test]
fn representation_contract_round_trips_without_renderer_dependencies() {
    let source = r#"{"schemaVersion":1,"id":"sample","name":"Sample","representation":{"kind":"2d","atlas":"sprites/atlas.png","frameSize":[192,208]},"exports":["codex","shimeji"]}"#;
    let persona = Persona::from_json(source).unwrap();
    assert_eq!(
        Persona::from_json(&serde_json::to_string(&persona).unwrap()).unwrap(),
        persona
    );
    for invalid in [
        "../atlas.png",
        "/atlas.png",
        "C:\\atlas.png",
        "https://example.com/atlas.png",
    ] {
        let mut value = serde_json::from_str::<serde_json::Value>(source).unwrap();
        value["representation"]["atlas"] = invalid.into();
        assert!(Persona::from_json(&value.to_string()).is_err());
    }
    assert!(Persona::from_json(&source.replace("[192,208]", "[0,208]")).is_err());
    assert!(Persona::from_json(&source.replace("Version\":1", "Version\":2")).is_err());
}
