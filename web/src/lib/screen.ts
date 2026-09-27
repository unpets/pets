import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';

export function createScreen(
  canvas: HTMLCanvasElement,
  source: HTMLImageElement,
) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The display canvas is unavailable.');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  // The exported glTF UVs already use image-top coordinates.
  texture.flipY = false;
  let previousCell = -1;

  return {
    texture,
    update(row: number, phase: number) {
      const frame = Math.min(47, Math.floor(phase * 48));
      const cell = row * 48 + frame;
      if (cell === previousCell) return;
      context.drawImage(source, frame * 96, row * 64, 96, 64, 0, 0, 96, 64);
      texture.needsUpdate = true;
      previousCell = cell;
    },
    dispose() {
      texture.dispose();
    },
  };
}
