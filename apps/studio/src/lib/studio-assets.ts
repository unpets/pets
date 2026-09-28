import { defaultAssets, type CharacterAssets } from '@pets/kernel/assets';
import characterModel from '../../../../personas/kernel/generated/assets/kernel-character.glb?inline';

export function defaultStudioAssets(): CharacterAssets {
  return { ...defaultAssets(), characterModel };
}
