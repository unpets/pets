import { invoke, isTauri } from '@tauri-apps/api/core';
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
  let lastMonitor = 0;
  let monitor = await currentMonitor();
  const unlisten = await window.listen('pet-controls', openControls);
  async function poll() {
    if (disposed) return;
    try {
      const now = performance.now();
      const elapsed = (now - previous) / 1000;
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
      if (monitor) {
        const area = monitor.workArea;
        const next = await invoke<{
          mode: AnimationMode;
          restart: boolean;
          heading: number | null;
          x: number | null;
        }>('wander_step', {
          frame: {
            elapsed,
            active:
              state.autonomous && state.playing && !state.menu && !dragging,
            mode: state.mode,
            heading: pet.travelHeading,
            moveSpeed: pet.walkSpeed,
            x: position.x / scale,
            left: area.position.x / scale,
            right: (area.position.x + area.size.width) / scale - innerWidth,
            choice: Math.random(),
          },
        });
        if (next.restart || next.mode !== state.mode) onMode(next.mode);
        if (next.heading !== null) pet.setHeading(next.heading, 'view');
        if (next.x !== null) {
          await window.setPosition(
            new LogicalPosition(next.x, position.y / scale),
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
        try {
          await invoke('reset_wander');
        } finally {
          dragging = false;
        }
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
