import type { StudioController } from './lib/types';
declare global {
  interface Window {
    kernelViewer?: StudioController;
  }
}
export {};
