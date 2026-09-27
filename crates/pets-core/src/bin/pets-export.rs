use clap::{Args, Parser, Subcommand, ValueEnum};
use pets_core::{
    ExportTarget,
    export::{ExportRequest, Operation, RenderedPersona, execute},
};
use std::{collections::BTreeMap, fs::File, io, path::PathBuf};

/// Export and validate rendered personas through the Pets core.
#[derive(Parser)]
#[command(name = "pets-export", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Validate or sample an independent animation project.
    Project {
        #[arg(long, default_value = "-")]
        input: PathBuf,
        /// Composition to sample; omit to validate the project.
        #[arg(long)]
        composition: Option<String>,
        #[arg(long, default_value_t = 0.0)]
        seconds: f64,
        #[arg(long, default_value_t = 0.0)]
        independent_seconds: f64,
    },
    /// Create an export from rendered persona frames.
    Export(FormatArgs),
    /// Validate an export against its source frames and optional checksums.
    Validate {
        #[command(flatten)]
        format: FormatArgs,
        /// JSON map of output paths to expected SHA-256 checksums.
        #[arg(long)]
        checksums: Option<PathBuf>,
    },
}

#[derive(Args)]
struct FormatArgs {
    /// Animation project whose export bindings map host intents to rendered clips.
    #[arg(long)]
    project: Option<PathBuf>,
    /// Target application format.
    #[arg(long, value_enum)]
    target: Target,
    /// Rendered persona JSON descriptor, or - for standard input.
    #[arg(long, default_value = "-")]
    input: PathBuf,
    /// Directory containing animation frame subdirectories.
    #[arg(long)]
    frames: PathBuf,
    /// Atlas file for Codex, or package directory for Shimeji.
    #[arg(long)]
    output: PathBuf,
}

#[derive(Clone, ValueEnum)]
enum Target {
    Codex,
    Shimeji,
}

fn run(cli: Cli) -> Result<(), Box<dyn std::error::Error>> {
    let (operation, format, checksums) = match cli.command {
        Command::Project {
            input,
            composition,
            seconds,
            independent_seconds,
        } => {
            let document: serde_json::Value = if input.as_os_str() == "-" {
                serde_json::from_reader(io::stdin().lock())?
            } else {
                serde_json::from_reader(File::open(input)?)?
            };
            let project: pets_core::animation::AnimationProject = serde_json::from_value(
                if document.get("format").and_then(|value| value.as_str()) == Some("pets-studio") {
                    document
                        .get("animations")
                        .cloned()
                        .ok_or("Studio project has no animations")?
                } else {
                    document
                },
            )?;
            project.validate()?;
            if let Some(composition) = composition {
                serde_json::to_writer(
                    io::stdout().lock(),
                    &project.sample(&composition, seconds, independent_seconds)?,
                )?;
            } else {
                serde_json::to_writer(io::stdout().lock(), &project)?;
            }
            return Ok(());
        }
        Command::Export(format) => (Operation::Export, format, None),
        Command::Validate { format, checksums } => (Operation::Validate, format, checksums),
    };
    let mut persona: RenderedPersona = if format.input.as_os_str() == "-" {
        serde_json::from_reader(io::stdin().lock())?
    } else {
        serde_json::from_reader(File::open(format.input)?)?
    };
    let expected_files = match checksums {
        Some(path) => serde_json::from_reader(File::open(path)?)?,
        None => BTreeMap::new(),
    };
    let target = match format.target {
        Target::Codex => ExportTarget::Codex,
        Target::Shimeji => ExportTarget::Shimeji,
    };
    if let Some(path) = format.project {
        let project = serde_json::from_reader(File::open(path)?)?;
        persona.bind_project(&project, target)?;
    }
    let report = execute(&ExportRequest {
        operation,
        target,
        persona,
        frames: format.frames,
        output: format.output,
        expected_files,
    })?;
    serde_json::to_writer(io::stdout().lock(), &report)?;
    Ok(())
}

fn main() {
    if let Err(error) = run(Cli::parse()) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cli_requires_known_formats_and_accepts_both_commands() {
        assert!(
            Cli::try_parse_from([
                "pets-export",
                "export",
                "--target",
                "unknown",
                "--frames",
                "frames",
                "--output",
                "out"
            ])
            .is_err()
        );
        assert!(Cli::try_parse_from(["pets-export", "export", "--target", "codex"]).is_err());
        for command in ["export", "validate"] {
            assert!(
                Cli::try_parse_from([
                    "pets-export",
                    command,
                    "--target",
                    "codex",
                    "--frames",
                    "frames",
                    "--output",
                    "atlas.png"
                ])
                .is_ok()
            );
        }
    }
}
