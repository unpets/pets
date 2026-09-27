import { ImageLoader } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimationData } from './types';

export async function loadAssets() {
  const [model, response, screenImage] = await Promise.all([
    new GLTFLoader().loadAsync('assets/kernel.glb'),
    fetch('assets/animations.json'),
    new ImageLoader().loadAsync('assets/screens.png'),
  ]);
  if (!response.ok) throw new Error('Animation data is unavailable.');
  const data: AnimationData = await response.json();
  if (!data.states?.running?.samples?.length)
    throw new Error('Animation data is incomplete.');
  return { model: model.scene, data, screenImage };
}
