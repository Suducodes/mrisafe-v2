/**
 * Allwyn Sir's original modules, loaded unmodified. They are UMD files (module.exports or a
 * window global), so they are evaluated here with a CommonJS shim instead of being rewritten:
 * his tested physics and assessment logic stay exactly as he wrote them.
 */
import physicsSrc from './sir-physics.cjs?raw';
import engineSrc from '../training/sir-engine.cjs?raw';

function loadUMD<T>(src: string): T {
  const module = { exports: {} as T };
  new Function('module', 'exports', src)(module, module.exports);
  return module.exports;
}

export interface Tissue { name: string; pd: number; t1: number; t2: number }
export interface SirPhysics {
  GAMMA_BAR_MHZ_PER_T: number;
  larmorMHz(B0: number): number;
  sliceThicknessMm(bwKHz: number, gradMTperM: number): number;
  sliceOffsetMm(offsetKHz: number, gradMTperM: number): number;
  frequencyShiftKHz(zM: number, gradMTperM: number): number;
  TISSUES: Record<string, Tissue>;
  PRESETS: Record<string, { name: string; TR: number; TE: number; note: string }>;
  signalSE(tissue: string | Tissue, TR: number, TE: number): number;
  relax(tMs: number, tissue: string | Tissue, flipDeg: number): { mz: number; mxy: number };
  headPhantom(N: number): Uint8Array;
  phantomImage(labels: Uint8Array, TR: number, TE: number): Float64Array;
  LABELS: string[];
  fft1d(re: Float64Array, im: Float64Array, inverse: boolean): void;
  fft2d(re: Float64Array, im: Float64Array, N: number, inverse: boolean): void;
  fftshift(a: Float64Array, N: number): Float64Array;
  reconstruct(kRe: Float64Array, kIm: Float64Array, N: number, mask: (rowShifted: number) => boolean): Float64Array;
}

export const PHYS = loadUMD<SirPhysics>(physicsSrc);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ENGINE = loadUMD<any>(engineSrc);
export const larmorMHz = (B0: number) => PHYS.larmorMHz(B0);
