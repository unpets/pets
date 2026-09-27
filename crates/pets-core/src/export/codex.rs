use super::{ExportReport, ExportResult, RenderedPersona, images, invalid, report};
use crate::ExportTarget;
use image::{GenericImage, RgbaImage};
use std::{fs, path::Path};

pub const CODEX_STATES: [(&str, u32); 10] = [
    ("idle", 6),
    ("running-right", 8),
    ("running-left", 8),
    ("waving", 4),
    ("jumping", 5),
    ("failed", 8),
    ("waiting", 6),
    ("running", 6),
    ("review", 6),
    ("look", 16),
];
const CELL: [u32; 2] = [192, 208];
const SIZE: [u32; 2] = [1536, 2288];

fn assemble(persona: &RenderedPersona, frames: &Path) -> ExportResult<RgbaImage> {
    if persona.cell != CELL || persona.animations.len() != CODEX_STATES.len() {
        return Err(invalid(
            "Codex v2 requires its ten states and 192 by 208 cells",
        ));
    }
    let mut atlas = RgbaImage::new(SIZE[0], SIZE[1]);
    for (state_row, (state, count)) in CODEX_STATES.iter().enumerate() {
        if persona.clip(state)?.frames != *count {
            return Err(invalid(format!("Wrong Codex frame count: {state}")));
        }
        for index in 0..*count {
            let frame = images::load(&persona.frame_path(frames, state, index), CELL)?;
            let bounds = images::bounds(&frame)
                .ok_or_else(|| invalid(format!("Empty frame: {state}/{index}")))?;
            if bounds[0] == 0 || bounds[1] == 0 || bounds[2] == CELL[0] || bounds[3] == CELL[1] {
                return Err(invalid(format!("Clipped frame: {state}/{index}")));
            }
            let (row, column) = if *state == "look" {
                (9 + index / 8, index % 8)
            } else {
                (state_row as u32, index)
            };
            atlas.copy_from(&frame, column * CELL[0], row * CELL[1])?;
        }
    }
    Ok(atlas)
}

pub fn export(
    persona: &RenderedPersona,
    frames: &Path,
    output: &Path,
) -> ExportResult<ExportReport> {
    let atlas = assemble(persona, frames)?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    images::save(output, &atlas)?;
    report(
        ExportTarget::Codex,
        persona,
        output.parent().unwrap_or(Path::new(".")),
        &[output.to_path_buf()],
    )
}

pub fn validate(
    persona: &RenderedPersona,
    frames: &Path,
    output: &Path,
) -> ExportResult<ExportReport> {
    if images::load(output, SIZE)? != assemble(persona, frames)? {
        return Err(invalid(
            "Codex atlas pixels do not match the input frames and empty cells",
        ));
    }
    report(
        ExportTarget::Codex,
        persona,
        output.parent().unwrap_or(Path::new(".")),
        &[output.to_path_buf()],
    )
}
