import { blendWeights, type DirectionSample } from './locomotion';
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
  blendSpace?: DirectionSample[];
}

interface ActiveLayer {
  id: string;
  action: AnimationAction;
  source?: string;
  blendSpace?: DirectionSample[];
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
  let layers: ActiveLayer[] = [{ id: 'body', action: current }];
  const sourceClips = new Map(clips.map((clip) => [clip.name, clip]));
  current.play();
  let transition: { action: AnimationAction; elapsed: number } | undefined;

  function stopTransition() {
    transition?.action.stop();
    transition = undefined;
  }

  function activate(next: ActiveLayer[]) {
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
        next.flatMap((layer) =>
          (layer.blendSpace ?? [{ source: layer.source, heading: 0 }]).map(
            (sample) => {
              const key = JSON.stringify([sample.source, layer.nodes]);
              let action = actions.get(key);
              if (!action) {
                const source = sourceClips.get(sample.source);
                if (!source)
                  throw new Error(`Animation ${sample.source} is missing.`);
                const tracks = source.tracks.filter((track) =>
                  layer.nodes.includes(
                    PropertyBinding.parseTrackName(track.name).nodeName,
                  ),
                );
                if (!tracks.length)
                  throw new Error(`No tracks for ${layer.id}.`);
                action = mixer.clipAction(
                  new ThreeAnimationClip(key, source.duration, tracks),
                );
                actions.set(key, action);
              }
              return {
                id: layer.id,
                action,
                source: sample.source,
                blendSpace: layer.blendSpace,
              };
            },
          ),
        ),
      );
    },
    addClip(clip: ThreeAnimationClip) {
      sourceClips.set(clip.name, clip);
    },
    update(
      elapsed: number,
      phase: number | Record<string, number>,
      heading = 0,
    ) {
      let transitionWeight = 1;
      for (const { id, action } of layers)
        action.time =
          (typeof phase === 'number' ? phase : (phase[id] ?? 0)) *
          action.getClip().duration;
      if (transition) {
        transition.elapsed += elapsed;
        const t = Math.min(1, transition.elapsed / 0.24);
        const weight = t * t * (3 - 2 * t);
        transition.action.setEffectiveWeight(1 - weight);
        transitionWeight = weight;
        if (t === 1) {
          const clip = transition.action.getClip();
          stopTransition();
          mixer.uncacheClip(clip);
        }
      }
      const weights = new Map<string, Map<string, number>>();
      for (const layer of layers) {
        if (layer.blendSpace && !weights.has(layer.id))
          weights.set(layer.id, blendWeights(layer.blendSpace, heading));
        layer.action.setEffectiveWeight(
          transitionWeight * (weights.get(layer.id)?.get(layer.source!) ?? 1),
        );
      }
      mixer.update(0);
      model.updateMatrixWorld(true);
      return transitionWeight;
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
