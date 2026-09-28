//! Small JSON ABI for the browser host. Export formats stay in the Rust core.
use crate::{
    animation::AnimationProject,
    export::{ExportRequest, MemoryStore, execute_with_store},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "kebab-case", deny_unknown_fields)]
enum Request {
    Project {
        project: AnimationProject,
    },
    Plan {
        project: AnimationProject,
        target: crate::ExportTarget,
        id: String,
        name: String,
        version: String,
    },
    Export {
        request: ExportRequest,
        files: BTreeMap<String, Vec<u8>>,
    },
}
fn dispatch(input: &[u8]) -> Result<Value, Box<dyn std::error::Error>> {
    match serde_json::from_slice::<Request>(input)? {
        Request::Project { project } => {
            project.validate()?;
            Ok(serde_json::to_value(project)?)
        }
        Request::Plan {
            project,
            target,
            id,
            name,
            version,
        } => {
            project.validate()?;
            let target_name = match target {
                crate::ExportTarget::Codex => "codex",
                crate::ExportTarget::Shimeji => "shimeji",
            };
            let mappings = project
                .exports
                .get(target_name)
                .ok_or("Missing export mappings")?;
            let mut animations = BTreeMap::new();
            for (state, frames) in crate::export::CODEX_STATES {
                let composition = mappings
                    .get(state)
                    .ok_or_else(|| format!("Map the {state} export intent"))?;
                let duration = composition.playback_duration(&project)?;
                animations.insert(
                    state.to_string(),
                    crate::export::RenderedAnimation {
                        frames,
                        frame_duration_ms: ((duration * 1000.0 / f64::from(frames)).round() as u32)
                            .max(1),
                        source: None,
                    },
                );
            }
            let persona = crate::export::RenderedPersona {
                id,
                name,
                version,
                cell: [192, 208],
                animations,
                provenance: BTreeMap::new(),
            };
            Ok(json!({"persona": persona, "compositions": mappings}))
        }
        Request::Export { request, files } => {
            let mut store = MemoryStore { files };
            let report = execute_with_store(&request, &mut store)?;
            let files: BTreeMap<_, _> = store
                .files
                .into_iter()
                .filter_map(|(path, bytes)| {
                    path.strip_prefix("output/")
                        .map(|name| (name.to_string(), bytes))
                })
                .collect();
            Ok(json!({"report": report, "files": files}))
        }
    }
}
#[unsafe(no_mangle)]
pub extern "C" fn pets_alloc(length: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; length].into_boxed_slice()) as *mut u8
}
/// The host supplies a live allocation returned by pets_alloc.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pets_free(pointer: *mut u8, length: usize) {
    unsafe {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
            pointer, length,
        )));
    }
}
/// The returned packed value contains pointer in the low half and length in the high half.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn pets_process(pointer: *const u8, length: usize) -> u64 {
    let input = unsafe { std::slice::from_raw_parts(pointer, length) };
    let result = match dispatch(input) {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(error) => json!({"ok":false,"error":error.to_string()}),
    };
    let bytes = serde_json::to_vec(&result).unwrap().into_boxed_slice();
    let length = bytes.len();
    let pointer = Box::into_raw(bytes) as *mut u8;
    ((length as u64) << 32) | pointer as u64
}
