//! Portable mesh layers shared by faces and articulated accessories.
use crate::animation::AnimationError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Transform {
    pub position: [f64; 3],
    pub rotation: [f64; 3],
    pub scale: [f64; 3],
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Surface {
    pub canvas: bool,
    pub placements: BTreeMap<String, Transform>,
}
impl Transform {
    pub fn validate(&self) -> Result<(), AnimationError> {
        if self
            .position
            .iter()
            .chain(&self.rotation)
            .chain(&self.scale)
            .all(|v| v.is_finite())
            && self.scale.iter().all(|v| *v != 0.0)
        {
            Ok(())
        } else {
            Err(AnimationError("Invalid mesh transform".into()))
        }
    }
}
pub fn validate_mesh(data: &Value) -> Result<(), AnimationError> {
    let invalid = || AnimationError("Invalid portable mesh geometry".into());
    let color = data["color"].as_str().ok_or_else(invalid)?;
    if color.len() != 7
        || !color.starts_with('#')
        || !color[1..].bytes().all(|v| v.is_ascii_hexdigit())
    {
        return Err(invalid());
    }
    let geometry = &data["geometry"];
    match geometry["type"].as_str() {
        Some("sphere" | "box" | "plane") => Ok(()),
        Some("mesh") => {
            let positions = geometry["positions"].as_array().ok_or_else(invalid)?;
            let indices = geometry["indices"].as_array().ok_or_else(invalid)?;
            if positions.len() < 9
                || positions.len() > 300_000
                || positions.len() % 3 != 0
                || !positions
                    .iter()
                    .all(|v| v.as_f64().is_some_and(f64::is_finite))
                || indices.is_empty()
                || indices.len() > 900_000
                || indices.len() % 3 != 0
                || !indices
                    .iter()
                    .all(|v| v.as_u64().is_some_and(|i| i < (positions.len() / 3) as u64))
            {
                Err(invalid())
            } else {
                Ok(())
            }
        }
        _ => Err(invalid()),
    }
}
pub fn validate_frames(data: &Value, duration: f64) -> Result<(), AnimationError> {
    let invalid = || AnimationError("Invalid mesh keyframes".into());
    let frames = data["keyframes"].as_array().ok_or_else(invalid)?;
    if frames.is_empty() || frames.len() > 2048 {
        return Err(invalid());
    }
    let mut previous = -1.0;
    for frame in frames {
        let time = frame["time"].as_f64().ok_or_else(invalid)?;
        let opacity = frame["opacity"].as_f64().ok_or_else(invalid)?;
        let transform = Transform {
            position: serde_json::from_value(frame["position"].clone()).map_err(|_| invalid())?,
            rotation: serde_json::from_value(frame["rotation"].clone()).map_err(|_| invalid())?,
            scale: serde_json::from_value(frame["scale"].clone()).map_err(|_| invalid())?,
        };
        transform.validate()?;
        if !time.is_finite()
            || time < 0.0
            || time > duration
            || time <= previous
            || !opacity.is_finite()
            || !(0.0..=1.0).contains(&opacity)
        {
            return Err(invalid());
        }
        previous = time;
    }
    Ok(())
}
