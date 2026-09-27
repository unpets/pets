import { ImageLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimationData } from './types';
import modelUrl from '../../public/assets/kernel.glb?inline';
import screenUrl from '../../public/assets/screens.png?inline';
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
    new ImageLoader().loadAsync(screenUrl),
  ]);
  const data = animationData;
  if (!data.states?.running?.samples?.length)
    throw new Error('Animation data is incomplete.');
  return { model: model.scene, clips: model.animations, data, screenImage };
}
