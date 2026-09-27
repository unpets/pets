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
        Command::Export(format) => (Operation::Export, format, None),
        Command::Validate { format, checksums } => (Operation::Validate, format, checksums),
    };
    let persona: RenderedPersona = if format.input.as_os_str() == "-" {
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
