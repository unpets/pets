//! Reusable components, clips, and deterministic composition clocks.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
    fmt,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnimationProject {
    pub format: String,
    pub version: u32,
    pub components: BTreeMap<String, Component>,
    pub clips: BTreeMap<String, Clip>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub screens: BTreeMap<String, ScreenAsset>,
    pub compositions: BTreeMap<String, Composition>,
    #[serde(default)]
    pub exports: BTreeMap<String, BTreeMap<String, ExportBinding>>,
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

/// Placement is independent of joint animation. Angles are degrees about up.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompositionProperties {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heading: Option<f64>,
    #[serde(default, rename = "turnSpeed", skip_serializing_if = "Option::is_none")]
    pub turn_speed: Option<f64>,
    #[serde(
        default,
        rename = "travelHeading",
        skip_serializing_if = "Option::is_none"
    )]
    pub travel_heading: Option<f64>,
    #[serde(
        default,
        rename = "animationSpeed",
        skip_serializing_if = "Option::is_none"
    )]
    pub animation_speed: Option<f64>,
    #[serde(default, rename = "moveSpeed", skip_serializing_if = "Option::is_none")]
    pub move_speed: Option<f64>,
}
impl CompositionProperties {
    fn validate(&self) -> Result<(), AnimationError> {
        require(
            self.heading.is_none_or(f64::is_finite)
                && self.turn_speed.is_none_or(|v| v.is_finite() && v > 0.0)
                && self.travel_heading.is_none_or(f64::is_finite)
                && self
                    .animation_speed
                    .is_none_or(|v| v.is_finite() && v > 0.0)
                && self.move_speed.is_none_or(|v| v.is_finite() && v >= 0.0),
            "Heading must be finite and turn speed positive",
        )
    }
    pub fn inherit(&mut self, source: &Self) {
        self.heading = source.heading.or(self.heading);
        self.turn_speed = source.turn_speed.or(self.turn_speed);
        self.travel_heading = source.travel_heading.or(self.travel_heading);
        self.animation_speed = source.animation_speed.or(self.animation_speed);
        self.move_speed = source.move_speed.or(self.move_speed);
    }
}
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HeadingSpace {
    #[default]
    World,
    View,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompositionInstance {
    pub composition: String,
    #[serde(default)]
    pub properties: CompositionProperties,
    #[serde(default)]
    pub heading_space: HeadingSpace,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ExportBinding {
    Name(String),
    Instance(CompositionInstance),
}
impl ExportBinding {
    pub fn composition(&self) -> &str {
        match self {
            Self::Name(name) => name,
            Self::Instance(value) => &value.composition,
        }
    }
    pub fn has_placement(&self) -> bool {
        matches!(self, Self::Instance(value) if value.properties.heading.is_some()
            || value.properties.travel_heading.is_some()
            || value.properties.animation_speed.is_some())
    }
    pub fn playback_duration(&self, project: &AnimationProject) -> Result<f64, AnimationError> {
        let mut composition = project.resolve(self.composition())?;
        require(
            composition.enabled,
            "Cannot export an unsupported composition",
        )?;
        if let Self::Instance(instance) = self {
            composition.properties.inherit(&instance.properties);
        }
        Ok(composition.duration.unwrap() / composition.properties.animation_speed.unwrap_or(1.0))
    }
}
impl From<&str> for ExportBinding {
    fn from(value: &str) -> Self {
        Self::Name(value.to_owned())
    }
}
impl From<String> for ExportBinding {
    fn from(value: String) -> Self {
        Self::Name(value)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Composition {
    pub label: String,
    #[serde(default = "enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub screen: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(default)]
    pub properties: CompositionProperties,
    pub bindings: BTreeMap<String, Binding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScreenAsset {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface: Option<crate::face::Surface>,
    pub label: String,
    pub data: Value,
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
            self.format == "pets-animation" && matches!(self.version, 1 | 2 | 3),
            "Unsupported animation project",
        )?;
        require(
            (!self.components.is_empty() || !self.screens.is_empty())
                && !self.compositions.is_empty(),
            "Components and compositions are required",
        )?;
        for (id, component) in &self.components {
            require(
                identifier(id)
                    && !component.label.trim().is_empty()
                    && !component.kind.trim().is_empty(),
                format!("Invalid component: {id}"),
            )?;
            if matches!(component.kind.as_str(), "face-mesh" | "attachment") {
                crate::face::validate_mesh(&component.data)?;
                if component.kind == "attachment" {
                    require(
                        component.data["node"].as_str().is_some_and(identifier)
                            && component.data["hides"].as_array().is_some_and(|parts| {
                                parts.iter().all(|v| v.as_str().is_some_and(identifier))
                            }),
                        "Invalid attachment anchor",
                    )?;
                }
            }
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
            if matches!(
                self.components[&clip.component].kind.as_str(),
                "face-mesh" | "attachment"
            ) {
                crate::face::validate_frames(&clip.data, clip.duration)?;
            }
        }
        for (id, screen) in &self.screens {
            require(
                identifier(id) && !screen.label.trim().is_empty() && screen.data.is_object(),
                format!("Invalid screen: {id}"),
            )?;
            if let Some(surface) = &screen.surface {
                for (component, placement) in &surface.placements {
                    require(
                        self.components
                            .get(component)
                            .is_some_and(|v| v.kind == "face-mesh"),
                        "Unknown mesh face placement",
                    )?;
                    placement.validate()?;
                }
            }
            for (component, binding) in &screen.bindings {
                require(
                    self.components
                        .get(component)
                        .is_some_and(|value| matches!(value.kind.as_str(), "screen" | "face-mesh")),
                    format!("Invalid screen component: {component}"),
                )?;
                self.validate_binding(id, component, binding)?;
            }
        }
        for (id, composition) in &self.compositions {
            require(
                identifier(id)
                    && !composition.label.trim().is_empty()
                    && composition
                        .duration
                        .is_none_or(|duration| duration.is_finite() && duration > 0.0),
                format!("Invalid composition: {id}"),
            )?;
            composition.properties.validate()?;
            self.resolve(id)?;
            for (component, binding) in &composition.bindings {
                self.validate_binding(id, component, binding)?;
            }
        }
        for bindings in self.exports.values() {
            for binding in bindings.values() {
                let composition = binding.composition();
                if let ExportBinding::Instance(value) = binding {
                    value.properties.validate()?;
                }
                require(
                    self.compositions.contains_key(composition),
                    format!("Unknown export composition: {composition}"),
                )?;
            }
        }
        Ok(())
    }

    fn validate_binding(
        &self,
        id: &str,
        component: &str,
        binding: &Binding,
    ) -> Result<(), AnimationError> {
        let clip = self.clips.get(&binding.clip);
        require(
            clip.is_some_and(|clip| {
                clip.component == component
                    || self
                        .components
                        .get(component)
                        .is_some_and(|target| target.kind == "screen")
                        && self.components.get(&clip.component).is_some_and(|source| {
                            source.kind == "screen" && {
                                let target = &self.components[component];
                                target
                                    .data
                                    .get("family")
                                    .or_else(|| target.data.get("layer"))
                                    == source
                                        .data
                                        .get("family")
                                        .or_else(|| source.data.get("layer"))
                            }
                        })
            }) && binding.speed.is_finite()
                && binding.speed >= 0.0
                && binding.offset.is_finite(),
            format!("Invalid binding: {id}/{component}"),
        )
    }

    /// Resolve inherited bindings without flattening the editable project.
    pub fn resolve(&self, id: &str) -> Result<Composition, AnimationError> {
        let mut chain = Vec::new();
        let mut seen = BTreeSet::new();
        let mut cursor = Some(id);
        while let Some(name) = cursor {
            require(seen.insert(name), format!("Composition cycle: {name}"))?;
            let composition = self
                .compositions
                .get(name)
                .ok_or_else(|| AnimationError(format!("Unknown parent composition: {name}")))?;
            chain.push(composition);
            cursor = composition.parent.as_deref();
        }
        let mut result = chain[0].clone();
        result.bindings.clear();
        result.duration = None;
        result.screen = None;
        result.properties = CompositionProperties::default();
        for composition in chain.into_iter().rev() {
            if let Some(id) = &composition.screen {
                let screen = self
                    .screens
                    .get(id)
                    .ok_or_else(|| AnimationError(format!("Unknown screen: {id}")))?;
                result.bindings.retain(|component, _| {
                    self.components
                        .get(component)
                        .is_none_or(|value| !matches!(value.kind.as_str(), "screen" | "face-mesh"))
                });
                result.bindings.extend(screen.bindings.clone());
                result.screen = Some(id.clone());
            }
            result.bindings.extend(composition.bindings.clone());
            result.properties.inherit(&composition.properties);
            result.duration = composition.duration.or(result.duration);
        }
        require(
            result.duration.is_some_and(|v| v.is_finite() && v > 0.0),
            format!("Composition needs a duration: {id}"),
        )?;
        Ok(result)
    }

    pub fn playback_duration(&self, id: &str) -> Result<f64, AnimationError> {
        let composition = self.resolve(id)?;
        Ok(composition.duration.unwrap() / composition.properties.animation_speed.unwrap_or(1.0))
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
        let composition = self.resolve(composition)?;
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
                    Clock::Composition => {
                        seconds * composition.properties.animation_speed.unwrap_or(1.0)
                            / composition.duration.unwrap()
                    }
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
