import { isTauri } from '@tauri-apps/api/core';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import {
  cursorPosition,
  currentMonitor,
  getCurrentWindow,
} from '@tauri-apps/api/window';
import type { PetScene } from './scene';
import type { AnimationMode } from '../types';

export const nativeDesktop = isTauri();
export interface PetSettings {
  tracking: boolean;
  autonomous: boolean;
  playing: boolean;
  menu: boolean;
  mode: AnimationMode;
}

export async function connectDesktop(
  pet: PetScene,
  settings: () => PetSettings,
  onMode: (mode: AnimationMode) => void,
  openControls: () => void,
  onError: (message: string) => void,
) {
  if (!nativeDesktop)
    return { destroy() {}, async drag() {}, async close() {} };
  const window = getCurrentWindow();
  let disposed = false;
  let ignored = false;
  let dragging = false;
  let timer: ReturnType<typeof setTimeout>;
  let previous = performance.now();
  let lastChoice = previous;
  let lastMonitor = 0;
  let monitor = await currentMonitor();
  const unlisten = await window.listen('pet-controls', openControls);
  async function poll() {
    if (disposed) return;
    try {
      const now = performance.now();
      const dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      const [cursor, position, scale] = await Promise.all([
        cursorPosition(),
        window.outerPosition(),
        window.scaleFactor(),
      ]);
      if (now - lastMonitor > 1500) {
        monitor = await currentMonitor();
        lastMonitor = now;
      }
      const x = (cursor.x - position.x) / scale;
      const y = (cursor.y - position.y) / scale;
      pet.setCursor(x, y);
      const state = settings();
      const overControls =
        x >= innerWidth - 45 && x <= innerWidth && y >= 0 && y <= 45;
      const nextIgnore =
        !state.menu && !dragging && !overControls && !pet.hitTest(x, y);
      if (nextIgnore !== ignored) {
        await window.setIgnoreCursorEvents(nextIgnore);
        ignored = nextIgnore;
      }
      if (
        state.autonomous &&
        state.playing &&
        !state.menu &&
        !dragging &&
        monitor
      ) {
        if (now - lastChoice > 8500) {
          const choices: AnimationMode[] = [
            'idle',
            'idle',
            'running-left',
            'running-right',
            'waving',
            'review',
            'look',
          ];
          onMode(choices[Math.floor(Math.random() * choices.length)]);
          lastChoice = now;
        }
        const direction =
          state.mode === 'running-left'
            ? -1
            : state.mode === 'running-right'
              ? 1
              : 0;
        if (direction) {
          const area = monitor.workArea;
          const left = area.position.x / scale;
          const right =
            (area.position.x + area.size.width) / scale - innerWidth;
          const currentX = position.x / scale;
          const next = Math.max(
            left,
            Math.min(right, currentX + direction * 42 * dt),
          );
          if (
            (next <= left && direction < 0) ||
            (next >= right && direction > 0)
          )
            onMode(direction < 0 ? 'running-right' : 'running-left');
          await window.setPosition(
            new LogicalPosition(next, position.y / scale),
          );
        }
      }
    } catch (error) {
      onError(`Desktop tracking is unavailable: ${String(error)}`);
      try {
        await window.setIgnoreCursorEvents(false);
      } catch {
        /* The window may have closed. */
      }
      return;
    }
    if (!disposed) timer = setTimeout(poll, 50);
  }
  void poll();
  return {
    async drag() {
      dragging = true;
      try {
        await window.startDragging();
      } finally {
        dragging = false;
        lastChoice = performance.now();
      }
    },
    async close() {
      await window.close();
    },
    destroy() {
      disposed = true;
      clearTimeout(timer);
      unlisten();
    },
  };
}
