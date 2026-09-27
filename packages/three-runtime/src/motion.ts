import {
  Object3D,
  AnimationMixer,
  AnimationClip as ThreeAnimationClip,
  type AnimationAction,
  VectorKeyframeTrack,
  QuaternionKeyframeTrack,
  PropertyBinding,
} from 'three';

export interface MotionLayer {
  id: string;
  source: string;
  nodes: string[];
}

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
  let layers: { id: string; action: AnimationAction }[] = [
    { id: 'body', action: current },
  ];
  const sourceClips = new Map(clips.map((clip) => [clip.name, clip]));
  current.play();
  let transition: { action: AnimationAction; elapsed: number } | undefined;

  function stopTransition() {
    transition?.action.stop();
    transition = undefined;
  }

  function activate(next: { id: string; action: AnimationAction }[]) {
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
    for (const layer of next) layer.action.reset().setEffectiveWeight(0).play();
    layers = next;
    transition = { action: source, elapsed: 0 };
  }
  return {
    setMode(mode: string) {
      const next = actions.get(mode);
      if (!next) throw new Error(`Animation ${mode} is missing.`);
      current = next;
      activate([{ id: 'body', action: current }]);
    },
    setLayers(next: MotionLayer[]) {
      activate(
        next.map((layer) => {
          const key = JSON.stringify([layer.source, layer.nodes]);
          let action = actions.get(key);
          if (!action) {
            const source = sourceClips.get(layer.source);
            if (!source)
              throw new Error(`Animation ${layer.source} is missing.`);
            const tracks = source.tracks.filter((track) =>
              layer.nodes.includes(
                PropertyBinding.parseTrackName(track.name).nodeName,
              ),
            );
            if (!tracks.length) throw new Error(`No tracks for ${layer.id}.`);
            action = mixer.clipAction(
              new ThreeAnimationClip(key, source.duration, tracks),
            );
            actions.set(key, action);
          }
          return { id: layer.id, action };
        }),
      );
    },
    addClip(clip: ThreeAnimationClip) {
      sourceClips.set(clip.name, clip);
    },
    update(elapsed: number, phase: number | Record<string, number>) {
      for (const { id, action } of layers)
        action.time =
          (typeof phase === 'number' ? phase : (phase[id] ?? 0)) *
          action.getClip().duration;
      if (transition) {
        transition.elapsed += elapsed;
        const t = Math.min(1, transition.elapsed / 0.24);
        const weight = t * t * (3 - 2 * t);
        transition.action.setEffectiveWeight(1 - weight);
        for (const layer of layers) layer.action.setEffectiveWeight(weight);
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
      for (const layer of layers) layer.action.setEffectiveWeight(1);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    },
  };
}
