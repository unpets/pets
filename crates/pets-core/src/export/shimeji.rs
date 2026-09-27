use super::{ExportReport, ExportResult, RenderedPersona, images, invalid, report};
use crate::ExportTarget;
use quick_xml::{
    Writer,
    events::{BytesDecl, BytesEnd, BytesStart, Event},
};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
};

const TICK_MS: f64 = 40.0;
const ACTIONS: [(&str, &str); 8] = [
    ("Idle", "idle"),
    ("Wave", "waving"),
    ("Jump", "jumping"),
    ("Failure", "failed"),
    ("Waiting", "waiting"),
    ("Work", "running"),
    ("Review", "review"),
    ("LookAround", "look"),
];

struct Configuration {
    actions: Vec<u8>,
    behaviors: Vec<u8>,
    action_count: usize,
    pose_count: u32,
}

struct Element {
    name: String,
    attributes: Vec<(String, String)>,
    children: Vec<Element>,
}
impl Element {
    fn new(name: &str, attributes: &[(&str, &str)]) -> Self {
        Self {
            name: name.into(),
            attributes: attributes
                .iter()
                .map(|(k, v)| ((*k).into(), (*v).into()))
                .collect(),
            children: vec![],
        }
    }
    fn write(&self, writer: &mut Writer<Vec<u8>>) -> ExportResult<()> {
        let mut start = BytesStart::new(self.name.as_str());
        for (key, value) in &self.attributes {
            start.push_attribute((key.as_str(), value.as_str()));
        }
        if self.children.is_empty() {
            writer.write_event(Event::Empty(start))?;
        } else {
            writer.write_event(Event::Start(start))?;
            for child in &self.children {
                child.write(writer)?;
            }
            writer.write_event(Event::End(BytesEnd::new(self.name.as_str())))?;
        }
        Ok(())
    }
    fn document(self) -> ExportResult<Vec<u8>> {
        let mut root = Self::new("Mascot", &[("xmlns", "http://www.group-finity.com/Mascot")]);
        root.children.push(self);
        let mut writer = Writer::new_with_indent(Vec::new(), b' ', 2);
        writer.write_event(Event::Decl(BytesDecl::new("1.0", Some("utf-8"), None)))?;
        root.write(&mut writer)?;
        Ok(writer.into_inner())
    }
}

fn pose(
    persona: &RenderedPersona,
    state: &str,
    index: u32,
    velocity: &str,
    right: &str,
    duration: Option<u32>,
    anchor: u32,
) -> ExportResult<Element> {
    let ms = f64::from(persona.clip(state)?.frame_duration_ms);
    let ticks = duration.unwrap_or_else(|| {
        (((f64::from(index + 1) * ms / TICK_MS).round_ties_even()
            - (f64::from(index) * ms / TICK_MS).round_ties_even()) as u32)
            .max(1)
    });
    Ok(Element::new(
        "Pose",
        &[
            ("Image", &format!("/{state}-{index:02}.png")),
            ("ImageRight", &format!("/{right}-{index:02}.png")),
            (
                "ImageAnchor",
                &format!("{},{}", persona.cell[0] / 2, anchor),
            ),
            ("Velocity", velocity),
            ("Duration", &ticks.to_string()),
        ],
    ))
}

fn configuration(persona: &RenderedPersona, frames: &Path) -> ExportResult<Configuration> {
    let mut actions = Element::new("ActionList", &[]);
    let anchor = persona.cell[1]
        .checked_sub(11)
        .ok_or_else(|| invalid("Shimeji cells must be at least eleven pixels high"))?;
    for (name, state) in ACTIONS {
        let mut action = Element::new(
            "Action",
            &[("Name", name), ("Type", "Animate"), ("BorderType", "Floor")],
        );
        let mut animation = Element::new("Animation", &[]);
        for i in 0..persona.clip(state)?.frames {
            animation
                .children
                .push(pose(persona, state, i, "0,0", state, None, anchor)?);
        }
        action.children.push(animation);
        actions.children.push(action);
    }
    let mut walk = Element::new(
        "Action",
        &[("Name", "Walk"), ("Type", "Move"), ("BorderType", "Floor")],
    );
    let mut animation = Element::new("Animation", &[]);
    if persona.clip("running-left")?.frames != persona.clip("running-right")?.frames {
        return Err(invalid(
            "Left and right Shimeji walking frame counts must match",
        ));
    }
    for i in 0..persona.clip("running-left")?.frames {
        animation.children.push(pose(
            persona,
            "running-left",
            i,
            "-2,0",
            "running-right",
            None,
            anchor,
        )?);
    }
    walk.children.push(animation);
    actions.children.push(walk);
    for (name, state, index, attributes) in [
        (
            "Falling",
            "jumping",
            2,
            vec![
                ("Class", "com.group_finity.mascot.action.Fall"),
                ("RegistanceX", "0.05"),
                ("RegistanceY", "0.1"),
                ("Gravity", "2"),
            ],
        ),
        (
            "Pinched",
            "waiting",
            0,
            vec![("Class", "com.group_finity.mascot.action.Dragged")],
        ),
    ] {
        if persona.clip(state)?.frames <= index {
            return Err(invalid(format!("Missing Shimeji pose: {state}/{index}")));
        }
        let frame = images::load(&persona.frame_path(frames, state, index), persona.cell)?;
        let bounds =
            images::bounds(&frame).ok_or_else(|| invalid("An embedded Shimeji pose is empty"))?;
        let mut action = Element::new("Action", &[("Name", name), ("Type", "Embedded")]);
        action
            .attributes
            .extend(attributes.iter().map(|(k, v)| ((*k).into(), (*v).into())));
        let mut animation = Element::new("Animation", &[]);
        animation.children.push(pose(
            persona,
            state,
            index,
            "0,0",
            state,
            Some(250),
            bounds[3] - 1,
        )?);
        action.children.push(animation);
        actions.children.push(action);
    }
    for name in ["Fall", "Thrown", "Dragged", "ChaseMouse", "Wander"] {
        let mut sequence = Element::new(
            "Action",
            &[
                ("Name", name),
                ("Type", "Sequence"),
                ("Loop", if name == "Dragged" { "true" } else { "false" }),
            ],
        );
        if name == "Dragged" {
            sequence
                .children
                .push(Element::new("ActionReference", &[("Name", "Pinched")]));
        } else if name == "Fall" || name == "Thrown" {
            let mut falling = Element::new("ActionReference", &[("Name", "Falling")]);
            if name == "Thrown" {
                falling.attributes.extend([
                    ("InitialVX".into(), "${mascot.environment.cursor.dx}".into()),
                    ("InitialVY".into(), "${mascot.environment.cursor.dy}".into()),
                ]);
            }
            sequence.children.push(falling);
            sequence
                .children
                .push(Element::new("ActionReference", &[("Name", "Idle")]));
        } else {
            let target = if name == "ChaseMouse" {
                "#{mascot.environment.cursor.x}".into()
            } else {
                format!(
                    "${{mascot.environment.workArea.left+{}+Math.random()*(mascot.environment.workArea.width-{})}}",
                    persona.cell[0] / 2,
                    persona.cell[0]
                )
            };
            sequence.children.push(Element::new(
                "ActionReference",
                &[("Name", "Walk"), ("TargetX", &target), ("Duration", "250")],
            ));
            sequence
                .children
                .push(Element::new("ActionReference", &[("Name", "Idle")]));
        }
        actions.children.push(sequence);
    }
    let mut behaviors = Element::new("BehaviorList", &[]);
    for name in ["Fall", "Thrown", "Dragged", "ChaseMouse"] {
        behaviors.children.push(Element::new(
            "Behavior",
            &[("Name", name), ("Frequency", "0"), ("Hidden", "true")],
        ));
    }
    let mut floor = Element::new(
        "Condition",
        &[(
            "Condition",
            "#{mascot.environment.floor.isOn(mascot.anchor)}",
        )],
    );
    for (name, frequency) in [
        ("Idle", 100),
        ("Wander", 50),
        ("Wave", 10),
        ("Jump", 5),
        ("Failure", 0),
        ("Waiting", 10),
        ("Work", 20),
        ("Review", 15),
        ("LookAround", 20),
    ] {
        floor.children.push(Element::new(
            "Behavior",
            &[("Name", name), ("Frequency", &frequency.to_string())],
        ));
    }
    behaviors.children.push(floor);
    let action_count = actions.children.len();
    let pose_count = actions
        .children
        .iter()
        .flat_map(|action| &action.children)
        .filter(|child| child.name == "Animation")
        .map(|animation| animation.children.len() as u32)
        .sum();
    Ok(Configuration {
        actions: actions.document()?,
        behaviors: behaviors.document()?,
        action_count,
        pose_count,
    })
}

fn metadata(
    persona: &RenderedPersona,
    report: &ExportReport,
    config: &Configuration,
) -> ExportResult<serde_json::Value> {
    let mut metadata = serde_json::to_value(&persona.provenance)?;
    let values = metadata
        .as_object_mut()
        .ok_or_else(|| invalid("Invalid export provenance"))?;
    values.insert("version".into(), json!(persona.version));
    values.insert(
        "persona".into(),
        json!({"id":persona.id,"name":persona.name}),
    );
    values.insert(
        "validation".into(),
        json!({"ok":true,"tick_ms":40,"actions":config.action_count,"poses":config.pose_count}),
    );
    values.insert("files".into(), json!(report.files));
    Ok(metadata)
}

fn frame_files(
    persona: &RenderedPersona,
    frames: &Path,
    output: &Path,
    copy: bool,
) -> ExportResult<Vec<PathBuf>> {
    let character = output.join("img").join(&persona.name);
    let mut files = vec![];
    for (state, clip) in &persona.animations {
        for index in 0..clip.frames {
            let source = persona.frame_path(frames, state, index);
            let frame = images::load(&source, persona.cell)?;
            if images::bounds(&frame).is_none() {
                return Err(invalid(format!(
                    "Empty Shimeji frame: {}",
                    source.display()
                )));
            }
            let target = character.join(format!("{state}-{index:02}.png"));
            if copy {
                fs::copy(&source, &target)?;
            } else if fs::read(&source)? != fs::read(&target)? {
                return Err(invalid("Shimeji image differs from its rendered frame"));
            }
            files.push(target);
        }
    }
    let icon = character.join("shime1.png");
    let idle = character.join("idle-00.png");
    if copy {
        fs::copy(&idle, &icon)?;
    } else if fs::read(&idle)? != fs::read(&icon)? {
        return Err(invalid("Shimeji icon does not match idle"));
    }
    files.push(icon);
    Ok(files)
}

pub fn export(
    persona: &RenderedPersona,
    frames: &Path,
    output: &Path,
) -> ExportResult<ExportReport> {
    let configuration = configuration(persona, frames)?;
    let config = output.join("img").join(&persona.name).join("conf");
    fs::create_dir_all(&config)?;
    let mut files = frame_files(persona, frames, output, true)?;
    for (name, content) in [
        ("actions.xml", &configuration.actions),
        ("behaviors.xml", &configuration.behaviors),
    ] {
        let path = config.join(name);
        fs::write(&path, content)?;
        files.push(path);
    }
    let report = report(ExportTarget::Shimeji, persona, output, &files)?;
    fs::write(
        output.join("manifest.json"),
        serde_json::to_vec_pretty(&metadata(persona, &report, &configuration)?)?,
    )?;
    fs::write(
        output.join("README.md"),
        format!(
            "# {} for Shimeji\n\nCopy `img/{}` into the Shimeji engine's `img` folder.  \nSelect {} in the character chooser.  \nUse the pet's context menu to choose an action.  \n\nThe image set supports Shimeji-ee compatible engines.  \nWalking uses independently rendered left and right views.  \n",
            persona.name, persona.name, persona.name
        ),
    )?;
    Ok(report)
}

pub fn validate(
    persona: &RenderedPersona,
    frames: &Path,
    output: &Path,
) -> ExportResult<ExportReport> {
    let configuration = configuration(persona, frames)?;
    let config = output.join("img").join(&persona.name).join("conf");
    let mut files = frame_files(persona, frames, output, false)?;
    for (name, expected) in [
        ("actions.xml", &configuration.actions),
        ("behaviors.xml", &configuration.behaviors),
    ] {
        let path = config.join(name);
        if &fs::read(&path)? != expected {
            return Err(invalid(format!(
                "Shimeji configuration differs from its export contract: {name}"
            )));
        }
        files.push(path);
    }
    let report = report(ExportTarget::Shimeji, persona, output, &files)?;
    let actual: serde_json::Value =
        serde_json::from_slice(&fs::read(output.join("manifest.json"))?)?;
    if actual != metadata(persona, &report, &configuration)? {
        return Err(invalid(
            "Shimeji manifest does not match its validated outputs",
        ));
    }
    Ok(report)
}
