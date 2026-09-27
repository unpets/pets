import {
  Object3D,
  AnimationMixer,
  AnimationClip as ThreeAnimationClip,
  type AnimationAction,
  VectorKeyframeTrack,
  QuaternionKeyframeTrack,
} from 'three';

export function createMotion(
  model: Object3D,
  clips: ThreeAnimationClip[],
  initialMode: string,
) {
  const mixer = new AnimationMixer(model);
  const actions = new Map(
    clips.map((clip) => [clip.name, mixer.clipAction(clip)]),
  );
  const initial = actions.get(initialMode);
  if (!initial) throw new Error(`Animation ${initialMode} is missing.`);
  let current: AnimationAction = initial;
  current.play();
  let transition: { action: AnimationAction; elapsed: number } | undefined;

  function stopTransition() {
    transition?.action.stop();
    transition = undefined;
  }

  return {
    setMode(mode: string) {
      const next = actions.get(mode);
      if (!next) throw new Error(`Animation ${mode} is missing.`);
      // Capture the displayed pose so interrupted transitions remain continuous.
      const tracks: (VectorKeyframeTrack | QuaternionKeyframeTrack)[] = [];
      model.traverse((object) => {
        if (!object.userData.joint) return;
        tracks.push(
          new VectorKeyframeTrack(
            `${object.name}.position`,
            [0],
            object.position.toArray(),
          ),
        );
        tracks.push(
          new QuaternionKeyframeTrack(
            `${object.name}.quaternion`,
            [0],
            object.quaternion.toArray(),
          ),
        );
      });
      const previousClip = transition?.action.getClip();
      stopTransition();
      if (previousClip) mixer.uncacheClip(previousClip);
      mixer.stopAllAction();
      const snapshot = new ThreeAnimationClip('transition', 1, tracks);
      const source = mixer.clipAction(snapshot).play();
      next.reset().setEffectiveWeight(0).play();
      current = next;
      transition = { action: source, elapsed: 0 };
    },
    update(elapsed: number, phase: number) {
      current.time = phase * current.getClip().duration;
      if (transition) {
        transition.elapsed += elapsed;
        const t = Math.min(1, transition.elapsed / 0.24);
        const weight = t * t * (3 - 2 * t);
        transition.action.setEffectiveWeight(1 - weight);
        current.setEffectiveWeight(weight);
        if (t === 1) {
          const clip = transition.action.getClip();
          stopTransition();
          mixer.uncacheClip(clip);
        }
      }
      mixer.update(0);
      model.updateMatrixWorld(true);
    },
    cancelTransition() {
      const clip = transition?.action.getClip();
      stopTransition();
      if (clip) mixer.uncacheClip(clip);
      current.setEffectiveWeight(1);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    },
  };
}
