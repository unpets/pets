import { createHeading } from './heading';

export interface DirectionSample {
  source: string;
  heading: number;
}
export function blendWeights(
  points: DirectionSample[],
  angle: number,
): Map<string, number> {
  const normalize = (value: number) => ((value % 360) + 360) % 360;
  const ordered = [...points].sort(
    (a, b) => normalize(a.heading) - normalize(b.heading),
  );
  const result = new Map(points.map((point) => [point.source, 0]));
  for (let index = 0; index < ordered.length; index++) {
    const left = ordered[index],
      right = ordered[(index + 1) % ordered.length];
    const span = normalize(right.heading - left.heading) || 360;
    const offset = normalize(angle - left.heading);
    if (offset <= span) {
      result.set(left.source, 1 - offset / span);
      result.set(right.source, (result.get(right.source) ?? 0) + offset / span);
      break;
    }
  }
  return result;
}

/** Metres and seconds. Translation belongs to the host; gait rate is independent. */
export function createLocomotion() {
  const travel = createHeading();
  let speed = 0;
  return {
    get speed() {
      return speed;
    },
    get angle() {
      return travel.angle;
    },
    update(
      facing: number,
      heading: number | undefined,
      targetSpeed: number,
      elapsed: number,
      turnSpeed = 240,
      immediate = false,
    ) {
      const angle =
        heading === undefined
          ? travel.snap(facing)
          : immediate
            ? travel.snap((heading * Math.PI) / 180)
            : travel.update((heading * Math.PI) / 180, elapsed, turnSpeed);
      speed = immediate
        ? targetSpeed
        : speed +
          (targetSpeed - speed) * (1 - Math.exp(-Math.max(0, elapsed) * 8));
      return { x: Math.sin(angle) * speed, y: -Math.cos(angle) * speed, z: 0 };
    },
  };
}
