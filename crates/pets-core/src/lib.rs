//! Platform-independent persona contracts and companion behavior.

pub mod behavior;
pub mod persona;

pub use behavior::{Animation, DesktopFrame, DesktopStep, Wander};
pub use persona::{ExportTarget, Persona, PersonaError, Representation};
