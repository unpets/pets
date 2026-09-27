import { ImageLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimationData } from './types';
import modelUrl from '../../generated/assets/kernel.glb?inline';
import eyesUrl from '../../generated/assets/screen-eyes.png?inline';
import mouthUrl from '../../generated/assets/screen-mouth.png?inline';
import backgroundLinesUrl from '../../generated/assets/screen-background-lines.png?inline';
import backgroundTextUrl from '../../generated/assets/screen-background-text.png?inline';
import activityLinesUrl from '../../generated/assets/screen-activity-lines.png?inline';
import activityTextUrl from '../../generated/assets/screen-activity-text.png?inline';
import { screenSources, type ScreenSource } from './screen';
import animationText from '../../generated/assets/animations.json?raw';

export const animationData: AnimationData = JSON.parse(animationText);
export const downloads = {
  model: modelUrl,
  animations: `data:application/json;charset=utf-8,${encodeURIComponent(animationText)}`,
};

function modelBuffer(url: string) {
  const base64 = url.slice(url.indexOf(',') + 1);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    .buffer;
}

export const defaultAssets = () => ({
  model: modelUrl,
  screens: [
    eyesUrl,
    mouthUrl,
    backgroundLinesUrl,
    backgroundTextUrl,
    activityLinesUrl,
    activityTextUrl,
  ],
  data: structuredClone(animationData),
});
export type CharacterAssets = ReturnType<typeof defaultAssets>;
export function parseAssets(value: unknown): CharacterAssets {
  const assets = value as CharacterAssets;
  if (
    !assets ||
    typeof assets.model !== 'string' ||
    !/^data:(model\/gltf-binary|application\/octet-stream);base64,/.test(
      assets.model,
    ) ||
    !Array.isArray(assets.screens) ||
    assets.screens.length !== 6 ||
    assets.screens.some(
      (url) =>
        typeof url !== 'string' || !url.startsWith('data:image/png;base64,'),
    ) ||
    !assets.data?.ports ||
    !assets.data.states?.idle
  )
    throw new Error('Invalid embedded persona assets.');
  const vector = (v: unknown) =>
    Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  if (!vector(assets.data.ports.wrist) || !vector(assets.data.ports.server))
    throw new Error('Invalid persona attachment points.');
  return structuredClone(assets);
}
export async function loadAssets(assets = defaultAssets()) {
  const [model, screenImage] = await Promise.all([
    new GLTFLoader().parseAsync(modelBuffer(assets.model), ''),
    Promise.all(assets.screens.map((url) => new ImageLoader().loadAsync(url))),
  ]);
  const data = assets.data;
  if (!data.states?.running?.samples?.length)
    throw new Error('Animation data is incomplete.');
  const screenImages = Object.fromEntries(
    screenSources.map((name, index) => [name, screenImage[index]]),
  ) as Record<ScreenSource, HTMLImageElement>;
  return { model: model.scene, clips: model.animations, data, screenImages };
}
