import { AnimationClip, Object3D, Quaternion, Vector3 } from 'three';

/** Read legacy directional clips without retaining duplicate clips in new exports. */
export function compatibleMotionClips(model: Object3D, clips: AnimationClip[]) {
  const result = [...clips];
  const joints: Record<string, string> = {};
  model.traverse((node) => {
    if (node.userData.joint) joints[node.userData.joint] = node.name;
  });
  function turn(
    source: AnimationClip,
    name: string,
    angle: number,
    headBias: number,
  ) {
    const clip = source.clone();
    clip.name = name;
    const body = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle);
    const head = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      headBias,
    );
    for (const track of clip.tracks) {
      if (
        track.name === `${joints.body}.quaternion` ||
        track.name === `${joints.head}.quaternion`
      ) {
        const rotation =
          track.name === `${joints.body}.quaternion` ? body : head;
        for (let i = 0; i < track.values.length; i += 4)
          new Quaternion()
            .fromArray(track.values, i)
            .premultiply(rotation)
            .toArray(track.values, i);
      } else if (track.name === `${joints.body}.position`) {
        for (let i = 0; i < track.values.length; i += 3)
          new Vector3()
            .fromArray(track.values, i)
            .applyQuaternion(body)
            .toArray(track.values, i);
      }
    }
    result.push(clip);
    return clip;
  }
  let move = result.find((clip) => clip.name === 'move');
  const right = result.find((clip) => clip.name === 'running-right');
  if (!move && right) move = turn(right, 'move', -0.95, 0.1);
  if (move)
    for (const [name, sign] of [
      ['running-right', 1],
      ['running-left', -1],
    ] as const)
      if (!result.some((clip) => clip.name === name))
        turn(move, name, sign * 0.95, -sign * 0.1);
  return result;
}
