import type { Shot, V3 } from '../engine/director';
import type { Callout } from '../ui/callouts';

/**
 * What the scanner does for each of Allwyn Sir's chapters (the text itself stays in
 * content/chapters.json, word for word). Coordinates: three.js metres, isocentre (0, 1.05, 0),
 * bore along z, table toward +z, control room toward -x.
 */
export interface Staging {
  shot: Shot;
  hide?: string[];           // whole layers peeled away
  hideObjects?: string[];    // single parts (e.g. the gradient former, to show its windings)
  cut?: boolean;             // quarter-section cutaway
  callouts?: Callout[];
  plate?: string;            // instrument module mounted in the card
}

const ISO = 1.05;
const at = (x: number, y: number, z: number): V3 => [x, y, z];
const COVERS = ['covers', 'coldhead'];
const BORE_INNER = ['liner', 'rf_body_coil', 'rf_shield'];
export const ROOM_SHELL = ['Wall_west', 'Wall_east', 'Wall_front', 'Wall_rear', 'Ceiling_tiles', 'Ceiling_grid', 'Skirting',
  'Diffuser_A', 'Diffuser_B', 'Exhaust_grille', 'Ceiling_collar_quench', 'Ceiling_collar_hoses',
  ...[0, 1, 2, 3, 4, 5].flatMap((i) => [`LED_panel_${i}`, `LED_panel_${i}_frame`]),
  'Window_frame', 'Window_reveal', 'Door_architrave', 'Pen_recess_trim', 'MagnetStop_plate', 'MagnetStop_button', 'MagnetStop_cover'];
export const CEILING = ['Ceiling_tiles', 'Ceiling_grid', 'Diffuser_A', 'Diffuser_B', 'Exhaust_grille', 'Ceiling_collar_quench', 'Ceiling_collar_hoses',
  ...[0, 1, 2, 3, 4, 5].flatMap((i) => [`LED_panel_${i}`, `LED_panel_${i}_frame`])];

export const HOME_SHOT: Shot = { eye: [-5.18, 1.70, 2.05], target: [0.30, 1.18, 0.80] };
/** Into the magnet room through the RF window, the cold open's flight path. */
export const THROUGH_GLASS: V3[] = [[-3.55, 1.62, 1.55], [-2.62, 1.55, 1.40], [-1.4, 1.62, 2.4]];
const WIDE: Shot = { eye: [2.25, 1.65, 3.6], target: [-0.1, 1.0, 0.3] };

export const STAGING: Record<string, Staging> = {
  ch01: {
    shot: WIDE,
    callouts: [
      { text: 'Magnet in its cryostat', at: at(1.05, 1.45, 0.2), note: '1.5 T, always on' },
      { text: 'Patient table', at: at(0.27, 0.87, 2.3) },
      { text: 'Cold head', at: at(0.0, 2.37, -0.3) },
      { text: 'Quench vent line', at: at(-0.16, 2.75, -0.44) },
      { text: 'RF window to the control room', at: at(-2.6, 1.55, 1.4) },
      { text: 'Penetration panel', at: at(1.25, 1.5, -2.25), note: 'filtered feed-throughs' },
    ],
  },
  ch02: { shot: { eye: [2.45, 1.95, 2.6], target: [0, 1.15, 0] }, cut: true, plate: 'assembly' },
  ch03: {
    shot: { eye: [2.35, 2.55, 4.05], target: [-0.35, 0.85, 0.2] }, hide: COVERS, cut: true, plate: 'field',
    callouts: [
      { text: 'Primary coils (NbTi)', at: at(0, ISO + 0.60, 0.37), note: 'six, in liquid helium' },
      { text: 'Shield coils', at: at(0, ISO + 0.885, 0.56), note: 'current reversed' },
    ],
  },
  ch04: {
    shot: { eye: [1.45, 2.1, 1.35], target: [0.05, 1.8, 0] }, hide: COVERS, cut: true, plate: 'cryo',
    callouts: [
      { text: 'Vacuum vessel', at: at(0, ISO + 0.993, 0.25), note: '≈ 300 K' },
      { text: 'Thermal shield', at: at(0, ISO + 0.972, -0.05), note: '≈ 40–50 K' },
      { text: 'Helium vessel', at: at(0, ISO + 0.944, -0.35), note: '4.2 K' },
      { text: 'Windings in liquid helium', at: at(0, ISO + 0.6, 0.64) },
    ],
  },
  ch05: {
    shot: { eye: [0.62, 1.32, 1.6], target: [0, 1.05, -0.25] }, hide: [...COVERS, ...BORE_INNER, 'gradient'], cut: true, plate: 'shim',
    callouts: [{ text: 'Passive shim trays', at: at(-0.084, ISO + 0.424, 0.35), note: '16 steel pockets' }],
  },
  ch06: {
    shot: { eye: [0.7, 1.36, 1.75], target: [0, 1.1, -0.1] }, hide: [...COVERS, ...BORE_INNER, 'shims'],
    hideObjects: ['Gradient_former_epoxy'], cut: true, plate: 'gradients',
    callouts: [
      { text: 'X gradient (saddle)', at: at(-0.395, ISO, 0.32) },
      { text: 'Y gradient (saddle)', at: at(0, ISO - 0.401, 0.32) },
      { text: 'Z gradient', at: at(-0.275, ISO + 0.275, 0.66) },
    ],
  },
  ch07: {
    shot: { eye: [0.48, 1.28, 1.6], target: [0, 1.05, 0] }, hide: [...COVERS, 'liner'], cut: true, plate: 'rf',
    callouts: [
      { text: 'Birdcage body coil', at: at(-0.26, ISO + 0.26, 0.3), note: '16 rungs' },
      { text: 'RF shield', at: at(-0.38, ISO - 0.02, 0.55) },
    ],
  },
  ch08: { shot: { eye: [0.31, 1.22, 0.35], target: [0, 1.0, 0], via: [[0.3, 1.12, 1.25], [0.2, 1.15, 0.6]] }, plate: 'spins' },
  ch09: { shot: { eye: [0.31, 1.22, 0.35], target: [0, 1.0, 0], via: [[0.3, 1.12, 1.25], [0.2, 1.15, 0.6]] }, plate: 'excite' },
  ch10: { shot: { eye: [0.31, 1.22, 0.35], target: [0, 1.0, 0], via: [[0.3, 1.12, 1.25], [0.2, 1.15, 0.6]] }, plate: 'relax' },
  ch11: { shot: { eye: [1.35, 1.55, 1.75], target: [0, 1.05, -0.1] }, hide: COVERS, cut: true, plate: 'slice' },
  ch12: { shot: { eye: [1.15, 1.45, 2.05], target: [0, 1.1, 0] }, hide: [...COVERS, ...BORE_INNER, 'shims'], hideObjects: ['Gradient_former_epoxy'], cut: true, plate: 'kspace' },
  ch13: {
    shot: { eye: [1.75, 2.3, 2.3], target: [-0.12, 2.55, -0.45] }, hideObjects: CEILING, plate: 'quench',
    callouts: [
      { text: 'Quench vent line', at: at(-0.16, 3.22, -1.3), note: 'to outside' },
      { text: 'O₂ monitor', at: at(-1.0, 2.55, -2.17) },
    ],
  },
  ch14: { shot: WIDE, plate: 'quiz' },
};
