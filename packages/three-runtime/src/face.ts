export type FaceVector = [number, number, number];
export interface FaceTransform {
  position: FaceVector;
  rotation: FaceVector;
  scale: FaceVector;
}
export interface FaceFrame extends FaceTransform {
  time: number;
  opacity: number;
}
export type FaceGeometry =
  | { type: 'sphere' | 'box' | 'plane' }
  | { type: 'mesh'; positions: number[]; indices: number[] };
export interface FaceSurface {
  canvas: boolean;
  placements: Record<string, FaceTransform>;
}
export const identityTransform = (): FaceTransform => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});
export const identityFrame = (time: number): FaceFrame => ({
  ...identityTransform(),
  time,
  opacity: 1,
});
export const isFaceComponent = (kind: string) =>
  kind === 'screen' || kind === 'face-mesh';
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const vector = (v: unknown): v is FaceVector =>
  Array.isArray(v) &&
  v.length === 3 &&
  v.every((x) => typeof x === 'number' && Number.isFinite(x));
export function validateTransform(
  value: unknown,
): asserts value is FaceTransform {
  if (
    !record(value) ||
    !vector(value.position) ||
    !vector(value.rotation) ||
    !vector(value.scale) ||
    value.scale.some((v) => v === 0)
  )
    throw new Error('Invalid mesh transform.');
}
export function validateMesh(data: Record<string, unknown>) {
  const geometry = data.geometry;
  if (
    typeof data.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(data.color) ||
    !record(geometry)
  )
    throw new Error('Invalid mesh layer.');
  if (['sphere', 'box', 'plane'].includes(String(geometry.type))) return;
  if (
    geometry.type !== 'mesh' ||
    !Array.isArray(geometry.positions) ||
    !Array.isArray(geometry.indices) ||
    geometry.positions.length < 9 ||
    geometry.positions.length % 3 ||
    geometry.positions.length > 300_000 ||
    geometry.positions.some(
      (v) => typeof v !== 'number' || !Number.isFinite(v),
    ) ||
    !geometry.indices.length ||
    geometry.indices.length % 3 ||
    geometry.indices.length > 900_000 ||
    geometry.indices.some(
      (v) =>
        !Number.isInteger(v) ||
        v < 0 ||
        v >= (geometry.positions as number[]).length / 3,
    )
  )
    throw new Error('Invalid portable mesh geometry.');
}
export function validateMeshFrames(
  data: Record<string, unknown>,
  duration: number,
) {
  const frames = data.keyframes;
  if (!Array.isArray(frames) || !frames.length || frames.length > 2048)
    throw new Error('Mesh keyframes are required.');
  frames.forEach((frame, i) => {
    validateTransform(frame);
    const f = frame as FaceFrame;
    if (
      !Number.isFinite(f.time) ||
      f.time < 0 ||
      f.time > duration ||
      (i > 0 && f.time <= frames[i - 1].time) ||
      !Number.isFinite(f.opacity) ||
      f.opacity < 0 ||
      f.opacity > 1
    )
      throw new Error('Invalid mesh keyframe.');
  });
}
export function validateSurface(
  surface: FaceSurface,
  components: Record<string, { kind: string }>,
) {
  if (
    !record(surface) ||
    typeof surface.canvas !== 'boolean' ||
    !record(surface.placements)
  )
    throw new Error('Invalid face surface.');
  for (const [id, placement] of Object.entries(surface.placements)) {
    if (components[id]?.kind !== 'face-mesh')
      throw new Error(`Unknown mesh face placement: ${id}`);
    validateTransform(placement);
  }
}
