/** One of Allwyn Sir's chapters, as extracted by tools/extract-chapters.mjs. */
export interface Chapter {
  id: string;
  group: string;
  title: string;
  lead?: string;
  body: string;
  safety?: string;
}
