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

#[test]
fn nested_inheritance_tracks_parent_edits_and_rejects_cycles() {
    let mut project = project();
    let child = serde_json::from_value(
        serde_json::json!({"label":"Child","parent":"greeting","bindings":{}}),
    )
    .unwrap();
    project.compositions.insert("child".into(), child);
    project.validate().unwrap();
    assert_eq!(project.resolve("child").unwrap().duration, Some(2.0));
    project.compositions.get_mut("greeting").unwrap().duration = Some(5.0);
    assert_eq!(project.resolve("child").unwrap().duration, Some(5.0));
    assert_eq!(
        project.sample("child", 2.5, 7.0).unwrap()["body"].phase,
        0.5
    );
    project.compositions.get_mut("greeting").unwrap().parent = Some("child".into());
    assert!(project.validate().is_err());
    assert!(project.sample("child", 0.0, 0.0).is_err());
}

#[test]
fn heading_and_speed_inherit_without_changing_independent_clocks() {
    let mut project = project();
    project.version = 3;
    project.compositions.get_mut("greeting").unwrap().properties = serde_json::from_value(
        serde_json::json!({"heading":30,"turnSpeed":180,"animationSpeed":2,"moveSpeed":0.4}),
    )
    .unwrap();
    project.compositions.insert("side".into(), serde_json::from_value(
        serde_json::json!({"label":"Side","parent":"greeting","properties":{"travelHeading":120},"bindings":{}})
    ).unwrap());
    project.validate().unwrap();
    let resolved = project.resolve("side").unwrap();
    assert_eq!(resolved.properties.heading, Some(30.0));
    assert_eq!(resolved.properties.travel_heading, Some(120.0));
    assert_eq!(project.playback_duration("side").unwrap(), 1.0);
    let sample = project.sample("side", 0.5, 7.0).unwrap();
    assert_eq!(sample["body"].phase, 0.5);
    assert_eq!(sample["eyes"].phase, 0.75);
}

#[cfg(feature = "export")]
#[test]
fn distinct_output_views_require_distinct_rendered_frame_sources() {
    let mut project = project();
    project.exports.get_mut("codex").unwrap().insert("idle".into(), serde_json::from_value(
        serde_json::json!({"composition":"greeting","properties":{"heading":90},"headingSpace":"view"})
    ).unwrap());
    let mut persona: pets_core::export::RenderedPersona =
        serde_json::from_value(serde_json::json!({
            "id":"test","name":"Test","version":"1","cell":[192,208],
            "animations":{"greeting":{"frames":6,"frameDurationMs":180}}
        }))
        .unwrap();
    assert!(
        persona
            .bind_project(&project, pets_core::ExportTarget::Codex)
            .is_err()
    );
    persona
        .animations
        .insert("idle".into(), persona.animations["greeting"].clone());
    persona
        .bind_project(&project, pets_core::ExportTarget::Codex)
        .unwrap();
    assert_eq!(persona.animations["idle"].source.as_deref(), Some("idle"));
}

#[test]
fn export_instance_cadence_overrides_inherited_speed() {
    use pets_core::animation::ExportBinding;
    let mut project = project();
    project
        .compositions
        .get_mut("greeting")
        .unwrap()
        .properties
        .animation_speed = Some(2.0);
    let instance: ExportBinding = serde_json::from_value(serde_json::json!({
        "composition":"greeting", "properties":{"animationSpeed":4.0}
    }))
    .unwrap();
    assert_eq!(instance.playback_duration(&project).unwrap(), 0.5);
    assert!(instance.has_placement());
    assert_eq!(
        ExportBinding::from("greeting")
            .playback_duration(&project)
            .unwrap(),
        1.0
    );
}
