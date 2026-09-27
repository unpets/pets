import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';
import {
  defaultScreenProject,
  parseScreenProject,
  screenLayers,
  type ScreenProject,
} from './screen-project';

export const screenSources = [
  'eyes',
  'mouth',
  'background-lines',
  'background-text',
  'activity-lines',
  'activity-text',
] as const;
export type ScreenSource = (typeof screenSources)[number];

function tint(
  context: CanvasRenderingContext2D,
  color: string,
  shaded = false,
) {
  if (!shaded) {
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = color;
    context.fillRect(0, 0, 96, 64);
    context.globalCompositeOperation = 'source-over';
    return;
  }
  const image = context.getImageData(0, 0, 96, 64);
  const rgb = [1, 3, 5].map((offset) =>
    parseInt(color.slice(offset, offset + 2), 16),
  );
  for (let i = 0; i < image.data.length; i += 4) {
    const brightness =
      Math.max(image.data[i], image.data[i + 1], image.data[i + 2]) / 255;
    rgb.forEach((channel, j) => {
      image.data[i + j] = Math.round(channel * brightness);
    });
  }
  context.putImageData(image, 0, 0);
}

export function createScreen(
  canvas: HTMLCanvasElement,
  sources: Record<ScreenSource, HTMLImageElement>,
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
  const component = document.createElement('canvas');
  component.width = 96;
  component.height = 64;
  const componentContext = component.getContext('2d', {
    willReadFrequently: true,
  })!;
  function drawCell(
    context: CanvasRenderingContext2D,
    source: ScreenSource,
    frame: number,
    row: number,
  ) {
    context.drawImage(
      sources[source],
      frame * 96,
      row * 64,
      96,
      64,
      0,
      0,
      96,
      64,
    );
  }
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
      context.fillStyle = project.palette.background;
      context.fillRect(0, 0, 96, 64);
      for (const name of screenLayers) {
        const layer = project.layers[name];
        if (!layer.visible || layer.opacity === 0) continue;
        layerContext.globalCompositeOperation = 'source-over';
        layerContext.clearRect(0, 0, 96, 64);
        const sourceRow = layer.source ?? row;
        if (name === 'background' || name === 'activity') {
          if (name === 'background') {
            layerContext.fillStyle = project.palette.background;
            layerContext.fillRect(0, 0, 96, 64);
          }
          for (const role of ['lines', 'text'] as const) {
            componentContext.clearRect(0, 0, 96, 64);
            drawCell(componentContext, `${name}-${role}`, frame, sourceRow);
            const color = project.palette[role];
            if (color) tint(componentContext, color, true);
            layerContext.drawImage(component, 0, 0);
          }
        } else {
          drawCell(layerContext, name, frame, sourceRow);
          if (layer.color) tint(layerContext, layer.color);
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
