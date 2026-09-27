import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';
import {
  defaultScreenProject,
  parseScreenProject,
  screenLayers,
  type ScreenLayer,
  type ScreenProject,
} from './screen-project';

export function createScreen(
  canvas: HTMLCanvasElement,
  sources: Record<ScreenLayer, HTMLImageElement>,
) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The display canvas is unavailable.');
  const scratch = document.createElement('canvas');
  scratch.width = 96;
  scratch.height = 64;
  const layerContext = scratch.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.flipY = false;
  let project = defaultScreenProject();
  let previousCell = -1;
  let gaze = { x: 0, y: 0 };
  return {
    texture,
    setProject(value: ScreenProject) {
      project = parseScreenProject(value);
      previousCell = -1;
    },
    setGaze(x: number, y: number) {
      x = Math.round(Math.max(-8, Math.min(8, x)));
      y = Math.round(Math.max(-6, Math.min(6, y)));
      if (x !== gaze.x || y !== gaze.y) {
        gaze = { x, y };
        previousCell = -1;
      }
    },
    update(row: number, phase: number) {
      const frame = Math.min(47, Math.max(0, Math.floor(phase * 48)));
      const cell = row * 48 + frame;
      if (cell === previousCell) return;
      context.globalAlpha = 1;
      context.fillStyle = '#07151d';
      context.fillRect(0, 0, 96, 64);
      for (const name of screenLayers) {
        const layer = project.layers[name];
        if (!layer.visible || layer.opacity === 0) continue;
        layerContext.globalCompositeOperation = 'source-over';
        layerContext.clearRect(0, 0, 96, 64);
        layerContext.drawImage(
          sources[name],
          frame * 96,
          (layer.source ?? row) * 64,
          96,
          64,
          0,
          0,
          96,
          64,
        );
        if (layer.color) {
          layerContext.globalCompositeOperation = 'source-in';
          layerContext.fillStyle = layer.color;
          layerContext.fillRect(0, 0, 96, 64);
        }
        context.globalAlpha = layer.opacity;
        context.drawImage(
          scratch,
          layer.x + (name === 'eyes' ? gaze.x : 0),
          layer.y + (name === 'eyes' ? gaze.y : 0),
        );
      }
      context.globalAlpha = 1;
      texture.needsUpdate = true;
      previousCell = cell;
    },
    dispose() {
      texture.dispose();
    },
  };
}
