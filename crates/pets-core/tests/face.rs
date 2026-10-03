use pets_core::animation::AnimationProject;
use serde_json::{Value, json};

fn project() -> Value {
    let mut value: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/animation-project.json"
    ))
    .unwrap();
    value["components"]["mesh-eye"] = json!({"label": "Mesh eye", "kind": "face-mesh", "data": {"geometry": {"type": "sphere"}, "color": "#55e9eb"}});
    value["clips"]["mesh-eye"] = json!({"label": "Mesh eye", "component": "mesh-eye", "duration": 1, "looping": true, "data": {"keyframes": [{"time": 0, "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1], "opacity": 1}]}});
    value["screens"] = json!({"mixed": {"label": "Mixed", "data": {}, "surface": {"canvas": false, "placements": {"mesh-eye": {"position": [0.2,0,0.1], "rotation": [0,0,0], "scale": [1,1,1]}}}, "bindings": {"mesh-eye": {"clip": "mesh-eye"}}}});
    value["compositions"]["greeting"]["screen"] = json!("mixed");
    value
}

#[test]
fn mixed_faces_round_trip_through_the_core() {
    let value: AnimationProject = serde_json::from_value(project()).unwrap();
    value.validate().unwrap();
    let restored: AnimationProject =
        serde_json::from_slice(&serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(!restored.screens["mixed"].surface.as_ref().unwrap().canvas);
    assert_eq!(
        restored.screens["mixed"]
            .surface
            .as_ref()
            .unwrap()
            .placements["mesh-eye"]
            .position,
        [0.2, 0.0, 0.1]
    );
    assert!(
        restored
            .resolve("greeting")
            .unwrap()
            .bindings
            .contains_key("mesh-eye")
    );
}

#[test]
fn invalid_mesh_and_frame_data_are_rejected() {
    for invalid in [
        json!({"type": "mesh", "positions": [0,0,0,1,0,0,0,1,0], "indices": [0,1,4]}),
        json!({"type": "unknown"}),
    ] {
        let mut value = project();
        value["components"]["mesh-eye"]["data"]["geometry"] = invalid;
        let parsed: AnimationProject = serde_json::from_value(value).unwrap();
        assert!(parsed.validate().is_err());
    }
    let mut value = project();
    value["clips"]["mesh-eye"]["data"]["keyframes"][0]["scale"] = json!([1, 0, 1]);
    assert!(
        serde_json::from_value::<AnimationProject>(value)
            .unwrap()
            .validate()
            .is_err()
    );
}
