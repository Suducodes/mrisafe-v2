import type { Plate } from './types';
import { assembly } from './assembly';
import { field } from './field';
import { cryo, shim, gradients, rf } from './construction';
import { spins, excite, relax } from './spins';
import { slice, kspace } from './imaging';
import { quench } from './quench';
import { quiz } from './quiz';

export const PLATES: Record<string, Plate> = {
  assembly, field, cryo, shim, gradients, rf, spins, excite, relax, slice, kspace, quench, quiz,
};
