//! Independent, portable environment assets and scene placement.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Environment {
    pub format: String,
    pub version: u32,
    pub assets: BTreeMap<String, Asset>,
    pub objects: BTreeMap<String, Object>,
    pub bindings: BTreeMap<String, Binding>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Asset {
    pub label: String,
    pub parts: Vec<Part>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Part {
    pub shape: Shape,
    pub size: [f64; 3],
    pub position: [f64; 3],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<[f64; 3]>,
    pub color: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
    Box,
    Cylinder,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Object {
    pub label: String,
    pub asset: String,
    pub position: [f64; 3],
    pub rotation: [f64; 3],
    pub scale: [f64; 3],
    pub enabled: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub object: String,
    pub origin: [f64; 3],
}
impl Environment {
    pub fn validate(&self) -> Result<(), &'static str> {
        let finite = |v: &[f64; 3]| v.iter().all(|n| n.is_finite());
        let positive = |v: &[f64; 3]| finite(v) && v.iter().all(|n| *n > 0.0);
        if self.format != "pets-environment" || self.version != 1 {
            return Err("Unsupported environment document");
        }
        for asset in self.assets.values() {
            if asset.parts.len() > 1000 {
                return Err("Environment asset exceeds 1000 parts");
            }
            for part in &asset.parts {
                if !positive(&part.size)
                    || !finite(&part.position)
                    || part.rotation.as_ref().is_some_and(|v| !finite(v))
                    || part.color.len() != 7
                    || !part.color.starts_with('#')
                    || !part.color[1..].bytes().all(|c| c.is_ascii_hexdigit())
                {
                    return Err("Invalid environment geometry");
                }
            }
        }
        for object in self.objects.values() {
            if !self.assets.contains_key(&object.asset)
                || !finite(&object.position)
                || !finite(&object.rotation)
                || !positive(&object.scale)
            {
                return Err("Invalid environment object");
            }
        }
        for binding in self.bindings.values() {
            if !self.objects.contains_key(&binding.object) || !finite(&binding.origin) {
                return Err("Invalid environment binding");
            }
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn independent_assets_round_trip_and_reject_missing_references() {
        let source = include_str!("../../../resources/environment.json");
        let mut document: Environment = serde_json::from_str(source).unwrap();
        document.validate().unwrap();
        let restored: Environment =
            serde_json::from_str(&serde_json::to_string(&document).unwrap()).unwrap();
        restored.validate().unwrap();
        document.assets.remove("rope");
        assert!(document.validate().is_err());
    }
}
