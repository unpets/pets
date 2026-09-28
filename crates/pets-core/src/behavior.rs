use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "String", into = "String")]
pub enum Animation {
    Idle,
    Move,
    Wave,
    Jump,
    Failed,
    Waiting,
    Work,
    Review,
    Look,
    Custom(String),
}

impl From<String> for Animation {
    fn from(value: String) -> Self {
        match value.as_str() {
            "idle" => Self::Idle,
            "move" => Self::Move,
            "waving" => Self::Wave,
            "jumping" => Self::Jump,
            "failed" => Self::Failed,
            "waiting" => Self::Waiting,
            "running" => Self::Work,
            "review" => Self::Review,
            "look" => Self::Look,
            _ => Self::Custom(value),
        }
    }
}
impl From<Animation> for String {
    fn from(value: Animation) -> Self {
        match value {
            Animation::Idle => "idle",
            Animation::Move => "move",
            Animation::Wave => "waving",
            Animation::Jump => "jumping",
            Animation::Failed => "failed",
            Animation::Waiting => "waiting",
            Animation::Work => "running",
            Animation::Review => "review",
            Animation::Look => "look",
            Animation::Custom(value) => return value,
        }
        .to_owned()
    }
}

/// Desktop coordinates are logical pixels in the current monitor's scale.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopFrame {
    pub elapsed: f64,
    pub active: bool,
    pub mode: Animation,
    /// Actual view-relative heading supplied by the presentation host.
    pub heading: f64,
    /// Actual metres per second after presentation acceleration.
    pub move_speed: f64,
    pub x: f64,
    pub left: f64,
    pub right: f64,
    pub choice: f64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct DesktopStep {
    pub mode: Animation,
    pub restart: bool,
    pub heading: Option<f64>,
    pub x: Option<f64>,
}

/// The host supplies elapsed time and entropy; the core does no I/O.
#[derive(Debug, Default)]
pub struct Wander {
    since_choice: f64,
}

impl Wander {
    pub fn reset(&mut self) {
        self.since_choice = 0.0;
    }

    pub fn step(&mut self, frame: DesktopFrame) -> DesktopStep {
        let mut result = DesktopStep {
            mode: frame.mode.clone(),
            restart: false,
            heading: None,
            x: None,
        };
        if !frame.elapsed.is_finite()
            || !frame.x.is_finite()
            || !frame.left.is_finite()
            || !frame.right.is_finite()
            || !frame.choice.is_finite()
            || !frame.heading.is_finite()
            || !frame.move_speed.is_finite()
            || frame.move_speed < 0.0
        {
            return result;
        }
        self.since_choice += frame.elapsed.max(0.0);
        if !frame.active {
            return result;
        }
        if self.since_choice > 8.5 {
            let choices = [
                Animation::Idle,
                Animation::Idle,
                Animation::Move,
                Animation::Move,
                Animation::Wave,
                Animation::Review,
                Animation::Look,
            ];
            let index = ((frame.choice.clamp(0.0, 1.0) * choices.len() as f64) as usize)
                .min(choices.len() - 1);
            result.mode = choices[index].clone();
            result.restart = result.mode != Animation::Move || frame.mode != Animation::Move;
            if result.mode == Animation::Move {
                result.heading = Some(if index == 2 { -90.0 } else { 90.0 });
            }
            self.since_choice = 0.0;
        }
        if frame.mode != Animation::Move || result.mode != Animation::Move {
            return result;
        }
        // Follow the presented orientation while it turns, without resetting gait.
        let direction = frame.heading.to_radians().sin();
        let left = frame.left.min(frame.right);
        let right = frame.right.max(frame.left);
        let next = (frame.x + direction * frame.move_speed * 60.0 * frame.elapsed.clamp(0.0, 0.1))
            .clamp(left, right);
        if next <= left && direction < 0.0 {
            result.heading = Some(90.0);
        } else if next >= right && direction > 0.0 {
            result.heading = Some(-90.0);
        }
        result.x = Some(next);
        result
    }
}
