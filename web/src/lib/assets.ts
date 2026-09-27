import { ImageLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimationData } from './types';
import modelUrl from '../../public/assets/kernel.glb?inline';
import eyesUrl from '../../public/assets/screen-eyes.png?inline';
import mouthUrl from '../../public/assets/screen-mouth.png?inline';
import backgroundLinesUrl from '../../public/assets/screen-background-lines.png?inline';
import backgroundTextUrl from '../../public/assets/screen-background-text.png?inline';
import activityLinesUrl from '../../public/assets/screen-activity-lines.png?inline';
import activityTextUrl from '../../public/assets/screen-activity-text.png?inline';
import { screenSources, type ScreenSource } from './screen';
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
      [
        eyesUrl,
        mouthUrl,
        backgroundLinesUrl,
        backgroundTextUrl,
        activityLinesUrl,
        activityTextUrl,
      ].map((url) => new ImageLoader().loadAsync(url)),
    ),
  ]);
  const data = animationData;
  if (!data.states?.running?.samples?.length)
    throw new Error('Animation data is incomplete.');
  const screenImages = Object.fromEntries(
    screenSources.map((name, index) => [name, screenImage[index]]),
  ) as Record<ScreenSource, HTMLImageElement>;
  return { model: model.scene, clips: model.animations, data, screenImages };
}
