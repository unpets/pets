use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Animation {
    #[serde(rename = "idle")]
    Idle,
    #[serde(rename = "running-left")]
    MoveLeft,
    #[serde(rename = "running-right")]
    MoveRight,
    #[serde(rename = "waving")]
    Wave,
    #[serde(rename = "jumping")]
    Jump,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "waiting")]
    Waiting,
    #[serde(rename = "running")]
    Work,
    #[serde(rename = "review")]
    Review,
    #[serde(rename = "look")]
    Look,
}

/// Desktop coordinates are logical pixels in the current monitor's scale.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopFrame {
    pub elapsed: f64,
    pub active: bool,
    pub mode: Animation,
    pub x: f64,
    pub left: f64,
    pub right: f64,
    pub choice: f64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct DesktopStep {
    pub mode: Animation,
    pub restart: bool,
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
            mode: frame.mode,
            restart: false,
            x: None,
        };
        if !frame.elapsed.is_finite()
            || !frame.x.is_finite()
            || !frame.left.is_finite()
            || !frame.right.is_finite()
            || !frame.choice.is_finite()
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
                Animation::MoveLeft,
                Animation::MoveRight,
                Animation::Wave,
                Animation::Review,
                Animation::Look,
            ];
            let index = ((frame.choice.clamp(0.0, 1.0) * choices.len() as f64) as usize)
                .min(choices.len() - 1);
            result.mode = choices[index];
            result.restart = true;
            self.since_choice = 0.0;
        }
        let direction = match frame.mode {
            Animation::MoveLeft => -1.0,
            Animation::MoveRight => 1.0,
            _ => return result,
        };
        let next = (frame.x + direction * 42.0 * frame.elapsed.clamp(0.0, 0.1))
            .min(frame.right)
            .max(frame.left);
        if (next <= frame.left && direction < 0.0) || (next >= frame.right && direction > 0.0) {
            result.mode = if direction < 0.0 {
                Animation::MoveRight
            } else {
                Animation::MoveLeft
            };
        }
        result.x = Some(next);
        result
    }
}
