//! Platform-independent persona contracts, companion behavior, and exports.

pub mod behavior;
#[cfg(feature = "export")]
pub mod export;
pub mod persona;

pub use behavior::{Animation, DesktopFrame, DesktopStep, Wander};
pub use persona::{ExportTarget, Persona, PersonaError, Representation};
