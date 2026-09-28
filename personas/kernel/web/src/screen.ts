import { resolveComposition } from '@pets/three-runtime/project';
import type {
  AnimationProject,
  ComponentSample,
} from '@pets/three-runtime/project';
import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';
import {
  defaultScreenProject,
  parseScreenProject,
  type ScreenProject,
} from './screen-project';
import { screenSourceModes } from './types';

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
  let previousCell = '';
  let gaze = { x: 0, y: 0 };
  return {
    texture,
    invalidate() {
      previousCell = '';
    },
    setProject(value: ScreenProject) {
      project = parseScreenProject(value);
      previousCell = '';
    },
    setGaze(x: number, y: number) {
      x = Math.round(Math.max(-8, Math.min(8, x)));
      y = Math.round(Math.max(-6, Math.min(6, y)));
      if (x !== gaze.x || y !== gaze.y) {
        gaze = { x, y };
        previousCell = '';
      }
    },
    update(
      animation: AnimationProject,
      samples: Record<string, ComponentSample>,
      seconds = 0,
    ) {
      const components = Object.entries(animation.components)
        .filter(([, c]) => c.kind === 'screen')
        .sort(
          (a, b) =>
            Number(
              project.layers[a[1].data.layer as keyof ScreenProject['layers']]
                ?.order ?? a[1].data.order,
            ) -
            Number(
              project.layers[b[1].data.layer as keyof ScreenProject['layers']]
                ?.order ?? b[1].data.order,
            ),
        );
      const resolved = { ...samples };
      for (const [id, specification] of components) {
        const name = specification.data.layer as keyof ScreenProject['layers'];
        const eye =
          name === 'eyes' || name === 'eyeLeft' || name === 'eyeRight';
        const source = project.layers[name]?.source;
        if (source === null || source === undefined) continue;
        const mode = screenSourceModes[source];
        const binding = animation.compositions[mode]
          ? (resolveComposition(animation, mode).bindings[id] ??
            (eye
              ? resolveComposition(animation, mode).bindings['screen/eyes']
              : undefined))
          : undefined;
        const clip = binding && animation.clips[binding.clip];
        if (clip)
          resolved[id] = {
            clip: binding.clip,
            phase: (((seconds / clip.duration) % 1) + 1) % 1,
          };
      }
      const cells = components.map(([id]) => {
        const sample = resolved[id];
        if (!sample) return '';
        const clip = animation.clips[sample.clip];
        const count = Array.isArray(clip.data.frames)
          ? clip.data.frames.length
          : 48;
        return `${sample.clip}:${Math.min(count - 1, Math.floor(sample.phase * count))}`;
      });
      const cell = cells.join('|');
      if (cell === previousCell) return;
      context.globalAlpha = 1;
      context.fillStyle = project.palette.background;
      context.fillRect(0, 0, 96, 64);
      for (const [id, specification] of components) {
        const sample = resolved[id];
        if (!sample) continue;
        const clip = animation.clips[sample.clip];
        const name = specification.data.layer as keyof ScreenProject['layers'];
        const layer = project.layers[name] ?? {
          visible: true,
          opacity: 1,
          x: 0,
          y: 0,
          color: null,
          source: null,
          mirrorX: false,
          mirrorY: false,
          scale: 1,
          rotation: 0,
          order: 0,
          ...(specification.data.style as Partial<
            ScreenProject['layers']['eyes']
          >),
        };
        const frames = clip.data.frames as
          [number, number, string][][] | undefined;
        const frame = Math.min(
          (frames?.length ?? 48) - 1,
          Math.floor(sample.phase * (frames?.length ?? 48)),
        );
        if (!layer.visible || layer.opacity === 0) continue;
        layerContext.globalCompositeOperation = 'source-over';
        layerContext.clearRect(0, 0, 96, 64);
        const sourceRow = Number(clip.data.row ?? 0);
        if (frames) {
          for (const [x, y, color] of frames[frame]) {
            layerContext.fillStyle = color;
            layerContext.fillRect(x, y, 1, 1);
          }
          if (layer.color) tint(layerContext, layer.color);
        } else if (name === 'background' || name === 'activity') {
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
          drawCell(
            layerContext,
            name === 'eyeLeft' || name === 'eyeRight' ? 'eyes' : name,
            frame,
            sourceRow,
          );
          if (layer.color) tint(layerContext, layer.color);
        }
        const halfEye = name === 'eyeLeft' || name === 'eyeRight';
        const mirroredEye =
          name === 'eyeRight' && project.eyeMode === 'mirrored';
        const width = halfEye ? 48 : 96;
        const destinationX = name === 'eyeRight' ? 48 : 0;
        const sourceX = name === 'eyeRight' && !mirroredEye ? 48 : 0;
        const isEye = halfEye || name === 'eyes';
        context.save();
        context.globalAlpha = layer.opacity;
        context.translate(
          destinationX + width / 2 + layer.x + (isEye ? gaze.x : 0),
          32 + layer.y + (isEye ? gaze.y : 0),
        );
        context.rotate((layer.rotation * Math.PI) / 180);
        context.scale(
          layer.scale * (layer.mirrorX !== mirroredEye ? -1 : 1),
          layer.scale * (layer.mirrorY ? -1 : 1),
        );
        context.drawImage(
          scratch,
          sourceX,
          0,
          width,
          64,
          -width / 2,
          -32,
          width,
          64,
        );
        context.restore();
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
