use pets_core::animation::{AnimationProject, Clock};
fn project() -> AnimationProject {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/animation-project.json"
    ))
    .unwrap()
}
#[test]
fn independent_clocks_survive_composition_switches() {
    let project = project();
    project.validate().unwrap();
    let first = project.sample("greeting", 0.5, 7.0).unwrap();
    let second = project.sample("thinking", 0.0, 7.0).unwrap();
    assert_eq!(first["body"].phase, 0.25);
    assert_eq!(first["eyes"].phase, 0.75);
    assert_eq!(second["eyes"].phase, 0.75);
}
#[test]
fn offsets_speed_hold_and_non_looping_endpoints_are_deterministic() {
    let mut project = project();
    let binding = project
        .compositions
        .get_mut("greeting")
        .unwrap()
        .bindings
        .get_mut("eyes")
        .unwrap();
    binding.speed = 0.5;
    binding.offset = -0.25;
    assert_eq!(
        project.sample("greeting", 0.0, 0.0).unwrap()["eyes"].phase,
        0.75
    );
    project.clips.get_mut("blink").unwrap().looping = false;
    assert_eq!(
        project.sample("greeting", 0.0, 100.0).unwrap()["eyes"].phase,
        1.0
    );
    assert!(project.sample("greeting", f64::NAN, 0.0).is_err());
    let binding = project
        .compositions
        .get_mut("greeting")
        .unwrap()
        .bindings
        .get_mut("eyes")
        .unwrap();
    binding.clock = Clock::Composition;
    binding.speed = 0.0;
    binding.offset = 0.3;
    assert_eq!(
        project.sample("greeting", 300.0, 100.0).unwrap()["eyes"].phase,
        0.3
    );
}
#[test]
fn incompatible_bindings_and_missing_export_compositions_are_rejected() {
    let mut value = project();
    value
        .compositions
        .get_mut("greeting")
        .unwrap()
        .bindings
        .get_mut("body")
        .unwrap()
        .clip = "blink".into();
    assert!(value.validate().is_err());
    let mut value = project();
    value
        .exports
        .get_mut("codex")
        .unwrap()
        .insert("idle".into(), "missing".into());
    assert!(value.validate().is_err());
}
#[test]
fn desktop_accepts_custom_composition_names() {
    let name: pets_core::Animation = serde_json::from_str("\"a-new-dance\"").unwrap();
    assert_eq!(serde_json::to_string(&name).unwrap(), "\"a-new-dance\"");
}

#[cfg(feature = "export")]
#[test]
fn export_bindings_resolve_custom_compositions_without_renaming_source_frames() {
    let mut persona: pets_core::export::RenderedPersona =
        serde_json::from_value(serde_json::json!({
            "id":"test", "name":"Test", "version":"1", "cell":[192,208],
            "animations":{"greeting":{"frames":6,"frameDurationMs":180}}
        }))
        .unwrap();
    persona
        .bind_project(&project(), pets_core::ExportTarget::Codex)
        .unwrap();
    assert_eq!(
        persona.animations["idle"].source.as_deref(),
        Some("greeting")
    );
    assert_eq!(persona.animations.len(), 1);
}
