import { ImageLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimationData } from './types';
import modelUrl from '../../public/assets/kernel.glb?inline';
import backgroundUrl from '../../public/assets/screen-background.png?inline';
import activityUrl from '../../public/assets/screen-activity.png?inline';
import eyesUrl from '../../public/assets/screen-eyes.png?inline';
import mouthUrl from '../../public/assets/screen-mouth.png?inline';
import { screenLayers } from './screen-project';
import animationText from '../../public/assets/animations.json?raw';

export const animationData: AnimationData = JSON.parse(animationText);
export const downloads = {
  model: modelUrl,
  animations: `data:application/json;charset=utf-8,${encodeURIComponent(animationText)}`,
};

function modelBuffer() {
  const base64 = modelUrl.slice(modelUrl.indexOf(',') + 1);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    .buffer;
}

export async function loadAssets() {
  const [model, screenImage] = await Promise.all([
    new GLTFLoader().parseAsync(modelBuffer(), ''),
    Promise.all(
      [backgroundUrl, activityUrl, eyesUrl, mouthUrl].map((url) =>
        new ImageLoader().loadAsync(url),
      ),
    ),
  ]);
  const data = animationData;
  if (!data.states?.running?.samples?.length)
    throw new Error('Animation data is incomplete.');
  const screenImages = Object.fromEntries(
    screenLayers.map((name, index) => [name, screenImage[index]]),
  ) as Record<(typeof screenLayers)[number], HTMLImageElement>;
  return { model: model.scene, clips: model.animations, data, screenImages };
}
