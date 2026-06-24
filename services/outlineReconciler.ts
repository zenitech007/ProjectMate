/**
 * outlineReconciler — pure helpers that keep a chapter's HTML in sync with
 * its outline structure. Chapter HTML is a preamble (the <h1> heading plus
 * any intro/full-chapter prose) followed by <h2>-keyed section blocks
 * separated by page-break divs. All functions are pure: no React, no
 * Firestore. DOMParser is used only to decode HTML entities (inert
 * document, no resource loading), available in browser and jsdom.
 * Rename and delete do not commute — orchestrators must delete (keyed by
 * original titles) before renaming.
 */
import type { Project, ProjectOutline, Chapter } from '../types';

export const PAGE_BREAK_ATTR = 'data-page-break';
export const PAGE_BREAK_CLASS = 'pm-page-break';
// The editor's PageBreak node (components/Editor/PageBreakExtension.ts) must
// serialize to exactly this string — stripTrailingBreak compares via endsWith.
export const PAGE_BREAK_HTML = `<div ${PAGE_BREAK_ATTR}="" class="${PAGE_BREAK_CLASS}"></div>`;

export const escapeHTML = (str: string): string =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const decodeEntities = (s: string): string => {
  const doc = new DOMParser().parseFromString(s, 'text/html');
  return (doc.documentElement.textContent || '').trim();
};

const stripTrailingBreak = (s: string): string => {
  let out = s;
  while (out.endsWith(PAGE_BREAK_HTML)) out = out.slice(0, -PAGE_BREAK_HTML.length);
  return out;
};

export interface H2Block {
  /** entity-decoded heading text */
  title: string;
  /** raw HTML from the <h2> tag to the next block (trailing page break stripped) */
  block: string;
}

export interface ParsedChapterHTML {
  preamble: string;
  blocks: H2Block[];
}

export const parseH2Blocks = (html: string): ParsedChapterHTML => {
  if (!html) return { preamble: '', blocks: [] };
  const matches: Array<{ title: string; start: number }> = [];
  const h2Pattern = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let m: RegExpExecArray | null;
  while ((m = h2Pattern.exec(html)) !== null) {
    matches.push({ title: decodeEntities(m[1]), start: m.index });
  }
  if (matches.length === 0) return { preamble: html, blocks: [] };
  // Strip the preamble's trailing page break — stitch() re-inserts exactly
  // one between parts. (Fixes duplicate-page-break accumulation on reorder.)
  const preamble = stripTrailingBreak(html.slice(0, matches[0].start));
  const blocks: H2Block[] = matches.map((entry, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].start : html.length;
    return { title: entry.title, block: stripTrailingBreak(html.slice(entry.start, end)) };
  });
  return { preamble, blocks };
};

const stitch = (preamble: string, blocks: string[]): string => {
  const joined = blocks.join(PAGE_BREAK_HTML);
  return preamble + (preamble.trim() && joined ? PAGE_BREAK_HTML : '') + joined;
};

/** Rename every block whose decoded title has a mapping, in ONE parse pass.
 *  Handles name swaps (A→B while B→A) that sequential single renames cannot.
 *  Keys and values are trimmed before use. Returns the original string when
 *  no block matched. */
export const renameSectionsInHTML = (html: string, renames: Map<string, string>): string => {
  if (!html || renames.size === 0) return html;
  const { preamble, blocks } = parseH2Blocks(html);
  if (blocks.length === 0) return html;
  const lookup = new Map<string, string>();
  for (const [k, v] of renames) lookup.set(k.trim(), v.trim());
  let changed = false;
  const newBlocks = blocks.map(b => {
    const newName = lookup.get(b.title);
    if (newName === undefined || newName === b.title) return b.block;
    changed = true;
    // Function replacement: never interprets $-patterns in user-supplied
    // names; the capture group preserves the heading's attributes.
    return b.block.replace(
      /<h2([^>]*)>[\s\S]*?<\/h2>/i,
      (_m, attrs: string) => `<h2${attrs}>${escapeHTML(newName)}</h2>`,
    );
  });
  if (!changed) return html;
  return stitch(preamble, newBlocks);
};

/** Rename ALL blocks whose decoded title equals the trimmed oldName
 *  (consistent with delete-all and reorder's duplicate handling). Returns the
 *  original string (identity) when nothing matched. */
export const renameSectionInHTML = (html: string, oldName: string, newName: string): string =>
  renameSectionsInHTML(html, new Map([[oldName, newName]]));

/** Delete ALL blocks whose decoded title equals the trimmed name. Returns the
 *  original string (identity) when nothing matched. */
export const deleteSectionFromHTML = (html: string, name: string): string => {
  const { preamble, blocks } = parseH2Blocks(html);
  if (blocks.length === 0) return html;
  const trimmed = name.trim();
  const remaining = blocks.filter(b => b.title !== trimmed);
  if (remaining.length === blocks.length) return html;
  return stitch(preamble, remaining.map(b => b.block));
};

/** Rewrite the chapter heading — the first <h1> in the PREAMBLE only
 *  (section bodies may legitimately contain user-typed h1s). Uppercases per
 *  the wrapChapterContent convention. Returns the original string when the
 *  preamble has no h1. */
export const renameChapterInHTML = (html: string, newTitle: string): string => {
  if (!html) return html;
  const { preamble, blocks } = parseH2Blocks(html);
  const h1re = /<h1([^>]*)>[\s\S]*?<\/h1>/i;
  if (!h1re.test(preamble)) return html;
  const newPreamble = preamble.replace(
    h1re,
    (_m, attrs: string) => `<h1${attrs}>${escapeHTML(newTitle.trim().toUpperCase())}</h1>`,
  );
  return stitch(newPreamble, blocks.map(b => b.block));
};

/** REFERENCES / APPENDICES are fully locked: their dedicated AI prompts are
 *  triggered by title match, so renaming them would silently degrade
 *  generation to generic prose. Superset of the functions/index.js detection
 *  ("REFERENCE" / "APPENDIC"): "APPENDI" also covers singular "Appendix A"
 *  chapters — locking broadly is safe, unlocking is not. */
export const isLockedChapter = (title: string): boolean => {
  const t = (title || '').toUpperCase();
  return t.includes('REFERENCE') || t.includes('APPENDI');
};

export const reorderChapterSectionsInHTML = (html: string, newOrder: string[]): string => {
  if (!html || newOrder.length === 0) return html;
  const { preamble, blocks } = parseH2Blocks(html);
  if (blocks.length === 0) return html;
  // Queue per title so duplicate titles each consume their own block (no last-wins loss).
  const byTitle = new Map<string, string[]>();
  for (const b of blocks) {
    const q = byTitle.get(b.title);
    if (q) q.push(b.block);
    else byTitle.set(b.title, [b.block]);
  }
  const ordered: string[] = [];
  for (const t of newOrder) {
    const q = byTitle.get(t.trim());
    const blk = q?.shift();
    if (blk !== undefined) ordered.push(blk);
  }
  // Defensive: keep any unconsumed blocks rather than drop content.
  for (const q of byTitle.values()) ordered.push(...q);
  return stitch(preamble, ordered);
};

// ─── Draft model for the StructureEditor ────────────────────────────────────
// originalName/originalTitle track identity so a rename is distinguishable
// from delete-plus-add (a rename preserves the section's generated content).

export interface SectionDraft {
  name: string;
  /** null = newly added section (no content block exists yet) */
  originalName: string | null;
}

export interface ChapterDraft {
  /** key into project.chapters at the time editing started */
  originalTitle: string;
  title: string;
  locked: boolean;
  sections: SectionDraft[];
}

export type StructureEdits = ChapterDraft[];

export const outlineToDrafts = (outline: ProjectOutline[]): StructureEdits =>
  outline.map(ch => {
    const locked = isLockedChapter(ch.title);
    return {
      originalTitle: ch.title,
      title: ch.title,
      locked,
      // Locked chapters seed with no section drafts even if legacy/LLM data
      // carries some — their dedicated prompts ignore sections, and the
      // alternative is an uneditable validation dead-end in the UI.
      sections: locked ? [] : (ch.sections || []).map(s => ({ name: s, originalName: s })),
    };
  });

export const editsToOutline = (edits: StructureEdits): ProjectOutline[] =>
  edits.map(ch => ({
    title: ch.title.trim(),
    sections: ch.sections.map(s => s.name.trim()),
  }));

const MAX_TITLE_LEN = 100;
const MAX_SECTIONS_PER_CHAPTER = 50;

export const validateStructureEdits = (edits: StructureEdits): string[] => {
  const errors: string[] = [];
  const chapterTitles = new Set<string>();
  for (const ch of edits) {
    const title = ch.title.trim();
    if (!title) errors.push('Chapter titles cannot be empty.');
    if (title.length > MAX_TITLE_LEN) errors.push(`Chapter title too long: "${title.slice(0, 30)}…"`);
    const key = title.toUpperCase();
    if (chapterTitles.has(key)) errors.push(`Duplicate chapter title: "${title}"`);
    chapterTitles.add(key);
    const lockedByOrigin = isLockedChapter(ch.originalTitle);
    if (lockedByOrigin) {
      if (title !== ch.originalTitle) errors.push(`"${ch.originalTitle}" is a locked chapter and cannot be renamed.`);
      if (ch.sections.length > 0) errors.push(`"${ch.originalTitle}" is a locked chapter and cannot contain sections.`);
    } else if (isLockedChapter(title)) {
      errors.push(`Chapter title "${title}" conflicts with the reserved References/Appendices naming.`);
    }
    if (ch.sections.length > MAX_SECTIONS_PER_CHAPTER) {
      errors.push(`"${title}" exceeds ${MAX_SECTIONS_PER_CHAPTER} sections.`);
    }
    const names = new Set<string>();
    for (const s of ch.sections) {
      const n = s.name.trim();
      if (!n) {
        errors.push(`"${title}" has an empty section name.`);
        continue;
      }
      if (n.length > MAX_TITLE_LEN) errors.push(`Section name too long in "${title}".`);
      const nk = n.toUpperCase();
      if (names.has(nk)) errors.push(`Duplicate section "${n}" in "${title}".`);
      names.add(nk);
    }
  }
  return errors;
};

/** Trimmed originalName values of a draft's surviving (non-added) sections —
 *  the survival key shared by findContentBearingDeletions and
 *  applyStructureChanges' delete pass. */
const survivingOriginalNames = (ch: ChapterDraft): Set<string> =>
  new Set(ch.sections.flatMap(s => (s.originalName === null ? [] : [s.originalName.trim()])));

/** Sections being removed whose HTML block has body text beyond the heading.
 *  Used for the single aggregated warn dialog BEFORE applying changes.
 *  Keys survival on ORIGINAL names — consistent with applyStructureChanges'
 *  delete pass. */
export const findContentBearingDeletions = (
  project: Project,
  edits: StructureEdits,
): Array<{ chapter: string; section: string }> => {
  const result: Array<{ chapter: string; section: string }> = [];
  for (const ch of edits) {
    const content = project.chapters?.[ch.originalTitle]?.content;
    if (!content) continue;
    const survivingOriginals = survivingOriginalNames(ch);
    for (const b of parseH2Blocks(content).blocks) {
      if (survivingOriginals.has(b.title)) continue;
      const body = b.block
        .replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (body) result.push({ chapter: ch.originalTitle, section: b.title });
    }
  }
  return result;
};

export interface AppliedStructure {
  outline: ProjectOutline[];
  chapters: Record<string, Chapter>;
  /** old chapter title -> new title, for remapping activeChapter */
  renamedChapters: Record<string, string>;
}

/** Apply a full editing session atomically: deletions, renames, additions,
 *  reorder, and chapter renames (which re-key the chapters map). Pure.
 *  Order matters (see module header): deletions are keyed by ORIGINAL names
 *  and run BEFORE renames; renames run as ONE map pass (swap-safe); then
 *  blocks are reordered to the draft's final order.
 *  Callers MUST run `validateStructureEdits` first — unvalidated drafts with
 *  duplicate final titles or empty names produce undefined results. */
export const applyStructureChanges = (project: Project, edits: StructureEdits): AppliedStructure => {
  const chapters: Record<string, Chapter> = {};
  const renamedChapters: Record<string, string> = {};

  for (const ch of edits) {
    const existing: Chapter =
      project.chapters?.[ch.originalTitle] ?? { title: ch.originalTitle, content: '', status: 'empty' };
    let html = existing.content || '';

    // 1. Deletions FIRST, keyed by ORIGINAL names (rename and delete do not
    //    commute: deleting after renaming lets "rename A→B while deleting the
    //    old B" leave the old B block alive). A block survives iff its title
    //    is still among the draft's surviving originalName values. One
    //    filter+stitch pass, preserving the no-op identity.
    const survivingOriginals = survivingOriginalNames(ch);
    {
      const { preamble, blocks } = parseH2Blocks(html);
      const remaining = blocks.filter(b => survivingOriginals.has(b.title));
      if (remaining.length !== blocks.length) {
        html = stitch(preamble, remaining.map(b => b.block));
      }
    }

    // 2. All renames in ONE parse pass (Map<originalName, newName>) — handles
    //    name swaps (A→B, B→A) that sequential single renames cannot.
    const renames = new Map<string, string>();
    for (const s of ch.sections) {
      if (s.originalName !== null && s.originalName !== s.name.trim()) {
        renames.set(s.originalName, s.name.trim());
      }
    }
    if (renames.size > 0) html = renameSectionsInHTML(html, renames);

    // 3. Reorder to the draft's final order (added sections have no block — skipped).
    html = reorderChapterSectionsInHTML(html, ch.sections.map(s => s.name.trim()));

    // 4. Chapter rename: rewrite <h1> and re-key the map.
    const finalTitle = ch.title.trim();
    if (finalTitle !== ch.originalTitle) {
      html = renameChapterInHTML(html, finalTitle);
      renamedChapters[ch.originalTitle] = finalTitle;
    }
    chapters[finalTitle] = {
      ...existing,
      title: finalTitle,
      content: html,
      // A chapter whose content was entirely deleted is no longer 'completed';
      // 'pending' (auto-draft marker) is preserved.
      status: !html.trim() && existing.status === 'completed' ? 'empty' : existing.status,
    };
  }

  // Chapters in the map but not in the drafts (e.g. legacy preliminary-pages
  // entries the editor filters from the outline) must survive the save.
  // If a draft's final title collides with such an orphan key, the draft wins.
  const consumed = new Set(edits.map(e => e.originalTitle));
  for (const [key, chap] of Object.entries(project.chapters ?? {})) {
    if (!consumed.has(key) && !(key in chapters)) chapters[key] = chap;
  }

  return { outline: editsToOutline(edits), chapters, renamedChapters };
};
