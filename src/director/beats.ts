/**
 * A chapter is a list of beats. Sir edits these as data; the director plays them.
 * Shape only for now: the director that interprets them lands in phase 2.
 */
export interface Beat {
  shot: { eye: [number, number, number]; target: [number, number, number]; seconds?: number };
  /** Layer names to keep visible from the outside in; everything outside the first is peeled. */
  peelTo?: string;
  highlight?: string[];
  sim?: Record<string, number | string | boolean>;
  caption?: string;
  audio?: string;
  checkpoint?: string;
}

export interface Chapter {
  id: string;
  group: string;
  title: string;
  lead?: string;
  body: string;
  safety?: string;
  beats?: Beat[];
}
