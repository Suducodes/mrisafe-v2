import type { PlateCtx } from '../learn/plates/types';
import type { Callouts } from '../ui/callouts';

/** Train mode (built out in the next step). */
export class Train {
  constructor(private readonly ctx: Omit<PlateCtx, 'root'>, private readonly callouts: Callouts, private readonly host: HTMLElement) {}
  async enter(_fromHome: boolean) {}
  leave() { this.callouts.set([]); }
}
