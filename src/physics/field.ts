/**
 * Static field B0 of the superconducting magnet, from the coil geometry (Biot-Savart).
 *
 * Coils are axisymmetric current loops about the bore axis (here: z, with z = 0 at isocentre and
 * rho the distance from the axis). Each winding is split into a few filaments across its section.
 * Turn ratios are not invented: they are solved so the field is flat at isocentre (2nd and 4th
 * derivatives of Bz vanish) and, for the actively shielded magnet, so the shield coils cancel the
 * far-field dipole. Geometry matches assets-src/blender/01_stack.py.
 */
const MU0 = 4e-7 * Math.PI;

export interface Coil { a: number; z: number; da: number; dz: number; turns: number }
export interface Magnet { coils: Coil[]; current: number; shielded: boolean; B0: number }

/** Complete elliptic integrals K(m), E(m) with parameter m = k^2, by the AGM. */
function ellipKE(m: number): [number, number] {
  let a = 1, b = Math.sqrt(1 - m), sum = 0.5 * m, pow = 0.5;
  for (let i = 0; i < 24; i++) {
    const c = (a - b) / 2;
    const an = (a + b) / 2;
    b = Math.sqrt(a * b); a = an; pow *= 2; sum += pow * c * c;
    if (c < 1e-15) break;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - sum)];
}

/** Field of one filament loop (radius a, current I) at (rho, z) relative to its plane. */
function loopField(a: number, I: number, rho: number, z: number): [number, number] {
  const ap = (a + rho) ** 2 + z * z;
  const am = (a - rho) ** 2 + z * z;
  if (am < 1e-12) return [0, 0];                     // on the wire itself
  const m = (4 * a * rho) / ap;
  const [K, E] = ellipKE(Math.min(m, 1 - 1e-12));
  const c = (MU0 * I) / (2 * Math.PI * Math.sqrt(ap));
  const bz = c * (K + ((a * a - rho * rho - z * z) / am) * E);
  const br = rho < 1e-9 ? 0 : (c * z / rho) * (-K + ((a * a + rho * rho + z * z) / am) * E);
  return [br, bz];
}

const onAxis = (a: number, z: number) => (a * a) / (2 * (a * a + z * z) ** 1.5);   // Bz per (mu0 I)

/** Even-order derivatives at z = 0 of the on-axis field of a symmetric coil pair at +/- zc. */
function pairTerms(a: number, zc: number) {
  const f = (z: number) => onAxis(a, z - zc) + onAxis(a, z + zc);
  const h = 0.02;
  const d2 = (f(h) - 2 * f(0) + f(-h)) / (h * h);
  const d4 = (f(2 * h) - 4 * f(h) + 6 * f(0) - 4 * f(-h) + f(-2 * h)) / h ** 4;
  return { b: f(0), d2, d4, dipole: 2 * a * a };
}

function solve3(A: number[][], y: number[]) {
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  return [0, 1, 2].map((c) => det(A.map((row, r) => row.map((v, k) => (k === c ? y[r] : v)))) / D);
}

// mean radius and axial centre of each primary pair, and the shield pair (01_stack.py)
const PRIMARY = [{ a: 0.576, z: 0.10, da: 0.04, dz: 0.06 }, { a: 0.581, z: 0.37, da: 0.05, dz: 0.09 }, { a: 0.591, z: 0.64, da: 0.07, dz: 0.12 }];
const SHIELD = { a: 0.885, z: 0.56, da: 0.05, dz: 0.14 };

export function designMagnet(B0: number, shielded: boolean): Magnet {
  const p = PRIMARY.map((c) => pairTerms(c.a, c.z));
  const s = pairTerms(SHIELD.a, SHIELD.z);
  let n: number[];
  if (shielded) {
    // unknowns n2, n3, ns with n1 = 1: d2 = 0, d4 = 0, net dipole = 0
    const [n2, n3, ns] = solve3(
      [[p[1].d2, p[2].d2, s.d2], [p[1].d4, p[2].d4, s.d4], [p[1].dipole, p[2].dipole, s.dipole]],
      [-p[0].d2, -p[0].d4, -p[0].dipole]);
    n = [1, n2, n3, ns];
  } else {
    const det = p[1].d2 * p[2].d4 - p[2].d2 * p[1].d4;
    const n2 = (-p[0].d2 * p[2].d4 + p[2].d2 * p[0].d4) / det;
    const n3 = (-p[1].d2 * p[0].d4 + p[1].d4 * p[0].d2) / det;
    n = [1, n2, n3, 0];
  }
  const coils: Coil[] = [];
  PRIMARY.forEach((c, i) => { for (const sgn of [1, -1]) coils.push({ ...c, z: sgn * c.z, turns: n[i] }); });
  if (shielded) for (const sgn of [1, -1]) coils.push({ ...SHIELD, z: sgn * SHIELD.z, turns: n[3] });
  const perAmp = p.reduce((acc, t, i) => acc + n[i] * t.b, 0) + (shielded ? n[3] * s.b : 0);   // Bz(0) per mu0 * I
  return { coils, current: B0 / (MU0 * perAmp), shielded, B0 };
}

const FIL = [-0.25, 0.25];        // 2 x 2 filaments per winding section

/** B (tesla) at (rho, z): [B_rho, B_z]. `coarse` uses one filament per winding (field lines, maps). */
export function fieldAt(mag: Magnet, rho: number, z: number, coarse = false): [number, number] {
  let br = 0, bz = 0;
  for (const c of mag.coils) {
    if (coarse) {
      const [r, zz] = loopField(c.a, mag.current * c.turns, rho, z - c.z);
      br += r; bz += zz;
      continue;
    }
    const I = (mag.current * c.turns) / 4;
    for (const fa of FIL) for (const fz of FIL) {
      const [r, zz] = loopField(c.a + fa * c.da, I, rho, z - (c.z + fz * c.dz));
      br += r; bz += zz;
    }
  }
  return [br, bz];
}

export const fieldMag = (mag: Magnet, rho: number, z: number, coarse = false) => Math.hypot(...fieldAt(mag, rho, z, coarse));

/** Spatial gradient of |B| along a direction in the (rho, z) plane, T/m (central difference). */
export function gradMag(mag: Magnet, rho: number, z: number, dr: number, dz: number) {
  const h = 0.005, n = Math.hypot(dr, dz) || 1;
  return (fieldMag(mag, rho + (h * dr) / n, z + (h * dz) / n) - fieldMag(mag, rho - (h * dr) / n, z - (h * dz) / n)) / (2 * h);
}

/**
 * Translational pull on a small steel object relative to its own weight.
 * Below saturation F = (chi V / mu0) B dB/dx; once the steel saturates (M ~ 1.6 T / mu0)
 * F = V Msat dB/dx. chi_eff ~ 3 is the shape-limited susceptibility of an elongated tool.
 */
export function pullOverWeight(B: number, dBdx: number, chi = 3, rho = 7850) {
  const Msat = 1.6 / MU0;
  const M = Math.min((chi * B) / MU0, Msat);
  return (M * Math.abs(dBdx)) / (rho * 9.81);
}

/** Marching squares: line segments where f(x, y) crosses `level` on a regular grid. */
export function contour(f: (x: number, y: number) => number, level: number,
                        x0: number, x1: number, y0: number, y1: number, nx: number, ny: number): number[] {
  const v: number[] = new Array((nx + 1) * (ny + 1));
  const X = (i: number) => x0 + ((x1 - x0) * i) / nx, Y = (j: number) => y0 + ((y1 - y0) * j) / ny;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = f(X(i), Y(j)) - level;
  const out: number[] = [];
  const lerp = (a: number, b: number) => a / (a - b);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = v[j * (nx + 1) + i], b = v[j * (nx + 1) + i + 1], c = v[(j + 1) * (nx + 1) + i + 1], d = v[(j + 1) * (nx + 1) + i];
    const pts: number[][] = [];
    if ((a > 0) !== (b > 0)) pts.push([X(i) + lerp(a, b) * (X(i + 1) - X(i)), Y(j)]);
    if ((b > 0) !== (c > 0)) pts.push([X(i + 1), Y(j) + lerp(b, c) * (Y(j + 1) - Y(j))]);
    if ((c > 0) !== (d > 0)) pts.push([X(i + 1) - lerp(c, d) * (X(i + 1) - X(i)), Y(j + 1)]);
    if ((d > 0) !== (a > 0)) pts.push([X(i), Y(j + 1) - lerp(d, a) * (Y(j + 1) - Y(j))]);
    if (pts.length >= 2) out.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
    if (pts.length === 4) out.push(pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
  }
  return out;
}

/**
 * Field line through a seed in the (rho, z) plane, traced both ways (RK4 on the unit field) until
 * it closes, leaves the domain, or the field drops below `floorT` (e.g. the 5 gauss level).
 * Returned as the two halves, each starting at the seed, so a drawing can grow outward from it.
 */
export function fieldLine(mag: Magnet, rho0: number, z0: number, floorT = 4e-4, step = 0.03, maxLen = 16, bound = 12): [number[][], number[][]] {
  const dir = (r: number, z: number, sgn: number) => {
    const [br, bz] = fieldAt(mag, Math.abs(r), z, true);
    const n = Math.hypot(br, bz) || 1;
    return [(sgn * br * Math.sign(r || 1)) / n, (sgn * bz) / n, n];
  };
  const trace = (sgn: number) => {
    const pts: number[][] = [[rho0, z0]];
    let r = rho0, z = z0;
    for (let s = 0; s < maxLen; s += step) {
      const k1 = dir(r, z, sgn), k2 = dir(r + (step / 2) * k1[0], z + (step / 2) * k1[1], sgn);
      const k3 = dir(r + (step / 2) * k2[0], z + (step / 2) * k2[1], sgn), k4 = dir(r + step * k3[0], z + step * k3[1], sgn);
      r += (step / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      z += (step / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      if (Math.abs(r) > bound || Math.abs(z) > bound || k1[2] < floorT) break;
      pts.push([r, z]);
      if (s > 0.5 && Math.hypot(r - rho0, z - z0) < step * 0.8) break;      // closed on itself
    }
    return pts;
  };
  return [trace(1), trace(-1)];
}
