//! Filesystem and in-memory transports share the same export implementations.
use super::{ExportResult, invalid};
use std::{
    collections::BTreeMap,
    fs,
    path::{Component, Path},
};

pub trait AssetStore {
    fn read(&self, path: &Path) -> ExportResult<Vec<u8>>;
    fn write(&mut self, path: &Path, bytes: &[u8]) -> ExportResult<()>;
    fn create_dir_all(&mut self, path: &Path) -> ExportResult<()>;
}

pub struct FileStore;
impl AssetStore for FileStore {
    fn read(&self, path: &Path) -> ExportResult<Vec<u8>> {
        Ok(fs::read(path)?)
    }
    fn write(&mut self, path: &Path, bytes: &[u8]) -> ExportResult<()> {
        Ok(fs::write(path, bytes)?)
    }
    fn create_dir_all(&mut self, path: &Path) -> ExportResult<()> {
        Ok(fs::create_dir_all(path)?)
    }
}

#[derive(Default)]
pub struct MemoryStore {
    pub files: BTreeMap<String, Vec<u8>>,
}
fn key(path: &Path) -> ExportResult<String> {
    if path
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(invalid("Asset paths must be relative and traversal-free"));
    }
    Ok(path.to_string_lossy().replace('\\', "/"))
}
impl AssetStore for MemoryStore {
    fn read(&self, path: &Path) -> ExportResult<Vec<u8>> {
        self.files
            .get(&key(path)?)
            .cloned()
            .ok_or_else(|| invalid(format!("Missing asset: {}", path.display())))
    }
    fn write(&mut self, path: &Path, bytes: &[u8]) -> ExportResult<()> {
        self.files.insert(key(path)?, bytes.to_vec());
        Ok(())
    }
    fn create_dir_all(&mut self, path: &Path) -> ExportResult<()> {
        key(path)?;
        Ok(())
    }
}
