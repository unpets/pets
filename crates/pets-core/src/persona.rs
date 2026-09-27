use serde::{Deserialize, Serialize};
use std::{error::Error, fmt};

/// Declarative persona identity, independent of its renderer and export host.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Persona {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub representation: Representation,
    pub exports: Vec<ExportTarget>,
}

/// Asset paths are relative to the persona's generated asset directory.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum Representation {
    #[serde(rename = "2d", rename_all = "camelCase")]
    Sprite { atlas: String, frame_size: [u32; 2] },
    #[serde(rename = "3d")]
    Model { model: String, animations: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExportTarget {
    Codex,
    Shimeji,
}

#[derive(Debug)]
pub enum PersonaError {
    Json(serde_json::Error),
    Invalid(&'static str),
}

impl fmt::Display for PersonaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Json(error) => error.fmt(f),
            Self::Invalid(message) => f.write_str(message),
        }
    }
}

impl Error for PersonaError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Json(error) => Some(error),
            Self::Invalid(_) => None,
        }
    }
}

impl Persona {
    pub fn from_json(source: &str) -> Result<Self, PersonaError> {
        let persona: Self = serde_json::from_str(source).map_err(PersonaError::Json)?;
        persona.validate()?;
        Ok(persona)
    }

    pub fn validate(&self) -> Result<(), PersonaError> {
        if self.schema_version != 1 {
            return Err(PersonaError::Invalid("Unsupported persona schema version"));
        }
        if self.id.is_empty()
            || !self
                .id
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        {
            return Err(PersonaError::Invalid("Invalid persona identifier"));
        }
        if self.name.trim().is_empty() {
            return Err(PersonaError::Invalid("Persona name is required"));
        }
        match &self.representation {
            Representation::Sprite { atlas, frame_size } => {
                asset_path(atlas)?;
                if frame_size.contains(&0) {
                    return Err(PersonaError::Invalid(
                        "Sprite frame dimensions must be positive",
                    ));
                }
            }
            Representation::Model { model, animations } => {
                asset_path(model)?;
                asset_path(animations)?;
            }
        }
        for (index, target) in self.exports.iter().enumerate() {
            if self.exports[..index].contains(target) {
                return Err(PersonaError::Invalid("Duplicate export target"));
            }
        }
        Ok(())
    }
}

fn asset_path(path: &str) -> Result<(), PersonaError> {
    // Check the portable path syntax rather than host-specific path semantics.
    if path.is_empty()
        || path.contains(['\\', ':', '\0'])
        || path.split('/').any(|part| matches!(part, "" | "." | ".."))
    {
        return Err(PersonaError::Invalid(
            "Assets must use relative portable paths",
        ));
    }
    Ok(())
}
