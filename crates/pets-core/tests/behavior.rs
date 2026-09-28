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
        heading: 90.0,
        move_speed: 0.7,
    }
}

#[test]
fn movement_keeps_the_existing_speed_and_boundary_turns() {
    let mut wander = Wander::default();
    assert_eq!(wander.step(frame(Animation::Move, 0.0)).x, Some(2.1));
    let mut input = frame(Animation::Move, -99.0);
    input.heading = -90.0;
    let edge = wander.step(input);
    assert_eq!(edge.x, Some(-100.0));
    assert_eq!(edge.mode, Animation::Move);
    assert_eq!(edge.heading, Some(90.0));
    assert!(!edge.restart);
    assert_eq!(wander.step(frame(Animation::Idle, 0.0)).x, None);
}

#[test]
fn paused_frames_do_not_move_and_drag_reset_defers_the_next_choice() {
    let mut wander = Wander::default();
    let mut input = frame(Animation::Move, 0.0);
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

#[test]
fn movement_speed_and_facing_are_independent_of_the_gait_clock() {
    let mut wander = Wander::default();
    let mut input = frame(Animation::Move, 0.0);
    input.heading = 30.0;
    input.move_speed = 2.0;
    let step = wander.step(input);
    assert!((step.x.unwrap() - 3.0).abs() < 1e-9);
    assert!(!step.restart);
    let mut input = frame(Animation::Move, 0.0);
    input.move_speed = 0.0;
    assert_eq!(wander.step(input).x, Some(0.0));
}
