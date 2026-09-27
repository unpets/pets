use pets_core::{Animation, DesktopFrame, Wander};

fn frame(mode: Animation, x: f64) -> DesktopFrame {
    DesktopFrame {
        elapsed: 0.05,
        active: true,
        mode,
        x,
        left: -100.0,
        right: 100.0,
        choice: 0.5,
    }
}

#[test]
fn movement_keeps_the_existing_speed_and_boundary_turns() {
    let mut wander = Wander::default();
    assert_eq!(wander.step(frame(Animation::MoveRight, 0.0)).x, Some(2.1));
    let edge = wander.step(frame(Animation::MoveLeft, -99.0));
    assert_eq!(edge.x, Some(-100.0));
    assert_eq!(edge.mode, Animation::MoveRight);
    assert_eq!(wander.step(frame(Animation::Idle, 0.0)).x, None);
}

#[test]
fn paused_frames_do_not_move_and_drag_reset_defers_the_next_choice() {
    let mut wander = Wander::default();
    let mut input = frame(Animation::MoveRight, 0.0);
    input.active = false;
    input.elapsed = 9.0;
    assert_eq!(wander.step(input).x, None);
    wander.reset();
    assert_eq!(
        wander.step(frame(Animation::Review, 0.0)).mode,
        Animation::Review
    );
    let mut input = frame(Animation::Idle, 0.0);
    input.elapsed = 9.0;
    input.choice = 0.99;
    assert_eq!(wander.step(input).mode, Animation::Look);
}

#[test]
fn selecting_the_same_mode_preserves_the_host_restart_event() {
    let mut wander = Wander::default();
    let mut input = frame(Animation::Idle, 0.0);
    input.elapsed = 9.0;
    input.choice = 0.0;
    let next = wander.step(input);
    assert_eq!(next.mode, Animation::Idle);
    assert!(next.restart);
    assert!(!wander.step(frame(Animation::Idle, 0.0)).restart);
}
