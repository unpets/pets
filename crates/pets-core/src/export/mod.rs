//! Shared export inputs, validation, dispatch, and format implementations.

mod codex;
mod images;
mod shimeji;

use crate::ExportTarget;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    error::Error,
    fmt, fs,
    path::{Path, PathBuf},
};

pub use codex::CODEX_STATES;

#[derive(Debug)]
pub enum ExportError {
    Input(String),
    Io(std::io::Error),
    Image(image::ImageError),
    Json(serde_json::Error),
}
impl fmt::Display for ExportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Input(message) => f.write_str(message),
            Self::Io(error) => error.fmt(f),
            Self::Image(error) => error.fmt(f),
            Self::Json(error) => error.fmt(f),
        }
    }
}
impl Error for ExportError {}
impl From<std::io::Error> for ExportError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}
impl From<image::ImageError> for ExportError {
    fn from(value: image::ImageError) -> Self {
        Self::Image(value)
    }
}
impl From<serde_json::Error> for ExportError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}
pub type ExportResult<T> = Result<T, ExportError>;
fn invalid(message: impl Into<String>) -> ExportError {
    ExportError::Input(message.into())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderedAnimation {
    pub frames: u32,
    pub frame_duration_ms: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// Renderer-independent input. Both sprite and model pipelines can produce frames.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderedPersona {
    pub id: String,
    pub name: String,
    pub version: String,
    pub cell: [u32; 2],
    pub animations: BTreeMap<String, RenderedAnimation>,
    #[serde(default)]
    pub provenance: BTreeMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportReport {
    pub ok: bool,
    pub target: ExportTarget,
    pub frames: u32,
    pub files: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Operation {
    Export,
    Validate,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportRequest {
    pub operation: Operation,
    pub target: ExportTarget,
    pub persona: RenderedPersona,
    pub frames: PathBuf,
    pub output: PathBuf,
    #[serde(default)]
    pub expected_files: BTreeMap<String, String>,
}

impl RenderedPersona {
    fn validate(&self) -> ExportResult<()> {
        component(&self.id)?;
        component(&self.name)?;
        if self.version.is_empty() || self.cell.contains(&0) || self.cell.iter().any(|n| *n > 8192)
        {
            return Err(invalid(
                "A version and bounded positive frame dimensions are required",
            ));
        }
        if self.animations.is_empty() {
            return Err(invalid("No rendered animations were supplied"));
        }
        for (name, clip) in &self.animations {
            component(name)?;
            if let Some(source) = &clip.source {
                component(source)?;
            }
            if clip.frames == 0 || clip.frames > 4096 || clip.frame_duration_ms == 0 {
                return Err(invalid(format!("Invalid animation timing: {name}")));
            }
        }
        Ok(())
    }
    fn clip(&self, state: &str) -> ExportResult<&RenderedAnimation> {
        self.animations
            .get(state)
            .ok_or_else(|| invalid(format!("Missing animation: {state}")))
    }
    fn frame_path(&self, frames: &Path, state: &str, index: u32) -> PathBuf {
        let source = self
            .animations
            .get(state)
            .and_then(|clip| clip.source.as_deref())
            .unwrap_or(state);
        frames.join(source).join(format!("{index:02}.png"))
    }

    /// Resolve host intent names to rendered composition directories.
    pub fn bind_project(
        &mut self,
        project: &crate::animation::AnimationProject,
        target: ExportTarget,
    ) -> ExportResult<()> {
        project
            .validate()
            .map_err(|error| invalid(error.to_string()))?;
        let target = match target {
            ExportTarget::Codex => "codex",
            ExportTarget::Shimeji => "shimeji",
        };
        let bindings = project
            .exports
            .get(target)
            .ok_or_else(|| invalid(format!("Missing export bindings: {target}")))?;
        self.animations = bindings
            .iter()
            .map(|(intent, composition)| {
                component(intent)?;
                component(composition)?;
                let mut clip = self
                    .animations
                    .get(composition)
                    .ok_or_else(|| invalid(format!("Missing rendered composition: {composition}")))?
                    .clone();
                clip.source = Some(clip.source.unwrap_or_else(|| composition.clone()));
                Ok((intent.clone(), clip))
            })
            .collect::<ExportResult<_>>()?;
        Ok(())
    }
}

fn component(value: &str) -> ExportResult<()> {
    if value.is_empty()
        || matches!(value, "." | "..")
        || value.ends_with(['.', ' '])
        || value
            .chars()
            .any(|c| c.is_control() || "\\/:*?\"<>|".contains(c))
    {
        return Err(invalid("Export names must be portable path components"));
    }
    Ok(())
}

pub fn execute(request: &ExportRequest) -> ExportResult<ExportReport> {
    request.persona.validate()?;
    let report = match (&request.operation, request.target) {
        (Operation::Export, ExportTarget::Codex) => {
            codex::export(&request.persona, &request.frames, &request.output)?
        }
        (Operation::Validate, ExportTarget::Codex) => {
            codex::validate(&request.persona, &request.frames, &request.output)?
        }
        (Operation::Export, ExportTarget::Shimeji) => {
            shimeji::export(&request.persona, &request.frames, &request.output)?
        }
        (Operation::Validate, ExportTarget::Shimeji) => {
            shimeji::validate(&request.persona, &request.frames, &request.output)?
        }
    };
    for (path, expected) in &request.expected_files {
        if report.files.get(path) != Some(expected) {
            return Err(invalid(format!("Export checksum mismatch: {path}")));
        }
    }
    Ok(report)
}

fn checksum(path: &Path) -> ExportResult<String> {
    Ok(Sha256::digest(fs::read(path)?)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn report(
    target: ExportTarget,
    persona: &RenderedPersona,
    root: &Path,
    files: &[PathBuf],
) -> ExportResult<ExportReport> {
    let mut hashes = BTreeMap::new();
    for path in files {
        let relative = path
            .strip_prefix(root)
            .map_err(|_| invalid("Export output escaped its root"))?;
        hashes.insert(
            relative.to_string_lossy().replace('\\', "/"),
            checksum(path)?,
        );
    }
    Ok(ExportReport {
        ok: true,
        target,
        frames: persona.animations.values().map(|clip| clip.frames).sum(),
        files: hashes,
    })
}
