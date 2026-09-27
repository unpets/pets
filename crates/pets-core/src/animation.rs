//! Reusable components, clips, and deterministic composition clocks.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, error::Error, fmt};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnimationProject {
    pub format: String,
    pub version: u32,
    pub components: BTreeMap<String, Component>,
    pub clips: BTreeMap<String, Clip>,
    pub compositions: BTreeMap<String, Composition>,
    #[serde(default)]
    pub exports: BTreeMap<String, BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Component {
    pub label: String,
    /// Renderer adapter identifier; the core imposes no renderer vocabulary.
    pub kind: String,
    #[serde(default)]
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Clip {
    pub label: String,
    pub component: String,
    pub duration: f64,
    pub looping: bool,
    #[serde(default)]
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Composition {
    pub label: String,
    #[serde(default)]
    pub description: String,
    pub duration: f64,
    pub bindings: BTreeMap<String, Binding>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Clock {
    #[default]
    Independent,
    Composition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub clip: String,
    #[serde(default)]
    pub clock: Clock,
    #[serde(default = "one")]
    pub speed: f64,
    #[serde(default)]
    pub offset: f64,
    #[serde(default = "enabled")]
    pub enabled: bool,
}

fn one() -> f64 {
    1.0
}
fn enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sample {
    pub clip: String,
    pub phase: f64,
}

#[derive(Debug)]
pub struct AnimationError(pub String);
impl fmt::Display for AnimationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}
impl Error for AnimationError {}

fn require(valid: bool, message: impl Into<String>) -> Result<(), AnimationError> {
    if valid {
        Ok(())
    } else {
        Err(AnimationError(message.into()))
    }
}

fn identifier(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.:/".contains(&c))
        && !matches!(id, "__proto__" | "prototype" | "constructor")
}

impl AnimationProject {
    pub fn validate(&self) -> Result<(), AnimationError> {
        require(
            self.format == "pets-animation" && self.version == 1,
            "Unsupported animation project",
        )?;
        require(
            !self.components.is_empty() && !self.compositions.is_empty(),
            "Components and compositions are required",
        )?;
        for (id, component) in &self.components {
            require(
                identifier(id)
                    && !component.label.trim().is_empty()
                    && !component.kind.trim().is_empty(),
                format!("Invalid component: {id}"),
            )?;
        }
        for (id, clip) in &self.clips {
            require(
                identifier(id)
                    && !clip.label.trim().is_empty()
                    && self.components.contains_key(&clip.component)
                    && clip.duration.is_finite()
                    && clip.duration > 0.0,
                format!("Invalid clip: {id}"),
            )?;
        }
        for (id, composition) in &self.compositions {
            require(
                identifier(id)
                    && !composition.label.trim().is_empty()
                    && composition.duration.is_finite()
                    && composition.duration > 0.0,
                format!("Invalid composition: {id}"),
            )?;
            for (component, binding) in &composition.bindings {
                let clip = self.clips.get(&binding.clip);
                require(
                    clip.is_some_and(|clip| &clip.component == component)
                        && binding.speed.is_finite()
                        && binding.speed >= 0.0
                        && binding.offset.is_finite(),
                    format!("Invalid binding: {id}/{component}"),
                )?;
            }
        }
        for bindings in self.exports.values() {
            for composition in bindings.values() {
                require(
                    self.compositions.contains_key(composition),
                    format!("Unknown export composition: {composition}"),
                )?;
            }
        }
        Ok(())
    }

    /// Independent clocks continue across composition changes. Composition clocks
    /// restart and stretch to the composition's duration for explicit coordination.
    pub fn sample(
        &self,
        composition: &str,
        seconds: f64,
        independent_seconds: f64,
    ) -> Result<BTreeMap<String, Sample>, AnimationError> {
        require(
            seconds.is_finite() && independent_seconds.is_finite(),
            "Clock values must be finite",
        )?;
        let composition = self
            .compositions
            .get(composition)
            .ok_or_else(|| AnimationError(format!("Unknown composition: {composition}")))?;
        composition
            .bindings
            .iter()
            .filter(|(_, binding)| binding.enabled)
            .map(|(component, binding)| {
                let clip = self
                    .clips
                    .get(&binding.clip)
                    .ok_or_else(|| AnimationError(format!("Unknown clip: {}", binding.clip)))?;
                let cycles = match binding.clock {
                    Clock::Independent => independent_seconds / clip.duration,
                    Clock::Composition => seconds / composition.duration,
                } * binding.speed
                    + binding.offset;
                let phase = if clip.looping {
                    cycles.rem_euclid(1.0)
                } else {
                    cycles.clamp(0.0, 1.0)
                };
                Ok((
                    component.clone(),
                    Sample {
                        clip: binding.clip.clone(),
                        phase,
                    },
                ))
            })
            .collect()
    }
}
