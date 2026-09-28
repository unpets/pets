/** Continuous heading in radians. Gait clocks and clip selection are independent. */
export function createHeading(initial = 0) {
  let angle = initial;
  let velocity = 0;
  return {
    get angle() {
      return angle;
    },
    get velocity() {
      return velocity;
    },
    snap(target: number) {
      angle = target;
      velocity = 0;
      return angle;
    },
    update(target: number, elapsed: number, speed = 240) {
      if (
        ![target, elapsed, speed].every(Number.isFinite) ||
        speed <= 0 ||
        elapsed <= 0
      )
        return angle;
      // Small integration steps keep acceleration and braking stable across frame rates.
      let remaining = Math.min(elapsed, 0.25);
      const limit = (speed * Math.PI) / 180;
      const acceleration = limit * 6;
      while (remaining > 1e-9) {
        const dt = Math.min(remaining, 1 / 240);
        const error = Math.atan2(
          Math.sin(target - angle),
          Math.cos(target - angle),
        );
        const wanted =
          Math.sign(error) *
          Math.min(
            limit,
            Math.sqrt(2 * acceleration * Math.abs(error)),
            Math.abs(error) * 12,
          );
        velocity += Math.max(
          -acceleration * dt,
          Math.min(acceleration * dt, wanted - velocity),
        );
        const step = velocity * dt;
        if (
          Math.sign(step) === Math.sign(error) &&
          Math.abs(step) >= Math.abs(error)
        ) {
          angle += error;
          velocity = 0;
        } else angle += step;
        remaining -= dt;
      }
      return angle;
    },
  };
}
