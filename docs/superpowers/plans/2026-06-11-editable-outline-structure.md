# Editable Outline Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users rename/add/remove/reorder chapter sub-sections and rename chapter titles per project, with chapter HTML and AI generation following the custom structure.

**Architecture:** A pure reconciliation module (`services/outlineReconciler.ts`) owns all `<h2>`-block HTML surgery and is unit-tested with vitest. A shared draft-based `StructureEditor` modal is mounted from both the editor sidebar and Wizard Step 4. Cloud Function prompts read the project's real outline server-side (from the snapshot the ownership check already fetches) instead of hardcoded section lists.

**Tech Stack:** React 18 + TypeScript + Vite 6, @dnd-kit (already a dep), Firebase Functions v2 (Node, `functions/index.js`), vitest + jsdom (new dev deps).

**Spec:** `docs/superpowers/specs/2026-06-11-editable-outline-structure-design.md`

**Key existing facts (verified):**
- `types.ts:11-20` — `Chapter {title, content, status: 'empty'|'pending'|'completed'}`, `ProjectOutline {title, sections: string[]}`; `Project.chapters: Record<string, Chapter>` is keyed by chapter title.
- `components/Editor/ProjectEditor.tsx:34-130` — module-level helpers `escapeHTML`, `wrapChapterContent` (writes `<h1>{TITLE UPPERCASED}</h1>`), `PAGE_BREAK_HTML`, `appendSection` (writes `<h2>{section}</h2>` blocks separated by page-break divs), `reorderChapterSectionsInHTML`.
- `ProjectEditor` has `isGeneratingRef` (sync lock), `triggerAutosave(updated)` writes `{chapters, outline}`.
- `functions/index.js` — `verifyProjectOwner(projectId, uid)` **returns the project doc data** (currently discarded at call sites). `generateChapterStream` has hardcoded section lists in its prompt; `generateSectionStream` has per-section writing rules keyed to standard names; References/Appendices use dedicated prompts gated BEFORE the generic prompt (unchanged by this plan).
- `components/ProjectWizard/ProjectWizard.tsx` — Step 4 holds `outline` state and sends it to the `createProject` callable (server already sanitizes, caps 30 chapters / 50 sections).
- No test framework exists yet. `npm run lint` = `tsc --noEmit` (has 5 pre-existing errors in `GhostTextExtension.ts` — ignore those, fail only on NEW errors).
- **Latent bug to fix while extracting:** the current `reorderChapterSectionsInHTML` keeps a trailing page-break inside the preamble slice AND inserts another page-break after the preamble when re-stitching → a duplicate page break accumulates per reorder when content was built by `appendSection`. The new parser strips the preamble's trailing page-break (Task 2 test covers idempotency).

---

### Task 1: Test tooling (vitest + jsdom)

**Files:**
- Modify: `package.json` (devDependencies + `test` script)
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dev dependencies**

Run: `cd C:\Users\IKA\ProjectMate; npm install -D vitest jsdom`
Expected: exits 0, `vitest` and `jsdom` appear in `devDependencies`.

- [ ] **Step 2: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['services/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Add test script**

In `package.json`, change the scripts block to:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "tsc --noEmit",
    "test": "vitest run"
  },
```

- [ ] **Step 4: Verify the harness runs**

Create `services/outlineReconciler.test.ts` with a smoke test:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest harness', () => {
  it('runs with jsdom DOM available', () => {
    const div = document.createElement('div');
    div.innerHTML = 'a &amp; b';
    expect(div.textContent).toBe('a & b');
  });
});
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts services/outlineReconciler.test.ts
git commit -m "chore: add vitest + jsdom test harness"
```

---

### Task 2: Reconciler core — parsing, stitching, reorder (extracted + fixed)

**Files:**
- Create: `services/outlineReconciler.ts`
- Modify: `services/outlineReconciler.test.ts`
- Modify: `components/Editor/ProjectEditor.tsx` (delete local copies, import from reconciler)

- [ ] **Step 1: Write failing tests**

Replace the smoke describe in `services/outlineReconciler.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  PAGE_BREAK_HTML,
  parseH2Blocks,
  reorderChapterSectionsInHTML,
} from './outlineReconciler';

const PB = PAGE_BREAK_HTML;
// Mirrors production content built by wrapChapterContent + appendSection:
// preamble ends with a page break before the first <h2>.
const chapter =
  '<h1>CHAPTER 1: INTRODUCTION</h1><p>Intro.</p>' + PB +
  '<h2>Background of the Study</h2><p>bg body</p>' + PB +
  '<h2>Statement of the Problem</h2><p>prob body</p>' + PB +
  '<h2>Method &amp; Design</h2><p>md body</p>';

describe('parseH2Blocks', () => {
  it('splits preamble and blocks, decoding entities in titles', () => {
    const { preamble, blocks } = parseH2Blocks(chapter);
    expect(preamble).toBe('<h1>CHAPTER 1: INTRODUCTION</h1><p>Intro.</p>');
    expect(blocks.map(b => b.title)).toEqual([
      'Background of the Study',
      'Statement of the Problem',
      'Method & Design',
    ]);
    expect(blocks[0].block).toBe('<h2>Background of the Study</h2><p>bg body</p>');
  });

  it('returns whole html as preamble when no h2 exists', () => {
    const html = '<h1>X</h1><p>only intro</p>';
    expect(parseH2Blocks(html)).toEqual({ preamble: html, blocks: [] });
  });

  it('handles empty input', () => {
    expect(parseH2Blocks('')).toEqual({ preamble: '', blocks: [] });
  });
});

describe('reorderChapterSectionsInHTML', () => {
  it('reorders blocks and keeps exactly one page break between parts', () => {
    const out = reorderChapterSectionsInHTML(chapter, [
      'Statement of the Problem',
      'Background of the Study',
      'Method & Design',
    ]);
    const titles = [...out.matchAll(/<h2>([^<]+)<\/h2>/g)].map(m => m[1]);
    expect(titles).toEqual(['Statement of the Problem', 'Background of the Study', 'Method &amp; Design']);
    expect(out.match(new RegExp('pm-page-break', 'g'))!.length).toBe(3);
  });

  it('is idempotent — reordering twice does not accumulate page breaks', () => {
    const order = ['Statement of the Problem', 'Background of the Study', 'Method & Design'];
    const once = reorderChapterSectionsInHTML(chapter, order);
    const twice = reorderChapterSectionsInHTML(once, order);
    expect(twice).toBe(once);
  });

  it('appends blocks missing from newOrder defensively', () => {
    const out = reorderChapterSectionsInHTML(chapter, ['Method & Design']);
    expect(out).toContain('Background of the Study');
    expect(out).toContain('Statement of the Problem');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `outlineReconciler.ts` has no exports yet / module not found.

- [ ] **Step 3: Implement the core module**

Create `services/outlineReconciler.ts`:

```ts
/**
 * outlineReconciler — pure helpers that keep a chapter's HTML in sync with
 * its outline structure. Chapter HTML is a preamble (the <h1> heading plus
 * any intro/full-chapter prose) followed by <h2>-keyed section blocks
 * separated by page-break divs. All functions are pure: no React, no
 * Firestore. DOM (document.createElement) is used only to decode HTML
 * entities, available in browser and jsdom.
 */
import { Project, ProjectOutline, Chapter } from '../types';

export const PAGE_BREAK_HTML = '<div data-page-break="" class="pm-page-break"></div>';

export const escapeHTML = (str: string): string =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const decodeEntities = (s: string): string => {
  const div = document.createElement('div');
  div.innerHTML = s;
  return (div.textContent || '').trim();
};

const stripTrailingBreak = (s: string): string =>
  s.endsWith(PAGE_BREAK_HTML) ? s.slice(0, -PAGE_BREAK_HTML.length) : s;

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

export const reorderChapterSectionsInHTML = (html: string, newOrder: string[]): string => {
  if (!html || newOrder.length === 0) return html;
  const { preamble, blocks } = parseH2Blocks(html);
  if (blocks.length === 0) return html;
  const byTitle = new Map(blocks.map(b => [b.title, b.block]));
  const used = new Set<string>();
  const ordered: string[] = [];
  for (const t of newOrder) {
    const blk = byTitle.get(t);
    if (blk && !used.has(t)) {
      ordered.push(blk);
      used.add(t);
    }
  }
  // Defensive: keep blocks whose title wasn't in newOrder rather than drop content.
  for (const b of blocks) {
    if (!used.has(b.title)) ordered.push(b.block);
  }
  return stitch(preamble, ordered);
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Point ProjectEditor at the shared module**

In `components/Editor/ProjectEditor.tsx`:

1. Add to imports (after the `cleanHTML` import at line ~13):

```tsx
import {
  PAGE_BREAK_HTML,
  escapeHTML,
  reorderChapterSectionsInHTML,
} from '../../services/outlineReconciler';
```

2. **Delete** the now-duplicated module-level declarations: the `escapeHTML` const (line ~34), the `PAGE_BREAK_HTML` const (line ~48), and the whole `reorderChapterSectionsInHTML` function (lines ~68-130). Keep `wrapChapterContent` and `appendSection` (generation-specific) — they now use the imported `escapeHTML`/`PAGE_BREAK_HTML`.

- [ ] **Step 6: Type-check and build**

Run: `npm run lint`
Expected: only the 5 pre-existing `GhostTextExtension.ts` errors — no new ones.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add services/outlineReconciler.ts services/outlineReconciler.test.ts components/Editor/ProjectEditor.tsx
git commit -m "refactor: extract h2-block parsing into outlineReconciler, fix page-break accumulation on reorder"
```

---

### Task 3: Reconciler — rename/delete HTML operations

**Files:**
- Modify: `services/outlineReconciler.ts`
- Modify: `services/outlineReconciler.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `services/outlineReconciler.test.ts` (extend the import list with `renameSectionInHTML, deleteSectionFromHTML, renameChapterInHTML, isLockedChapter`):

```ts
describe('renameSectionInHTML', () => {
  it('rewrites the matching h2 text, escaped, preserving the body', () => {
    const out = renameSectionInHTML(chapter, 'Background of the Study', 'Background & Context');
    expect(out).toContain('<h2>Background &amp; Context</h2><p>bg body</p>');
    expect(out).not.toContain('<h2>Background of the Study</h2>');
  });

  it('matches entity-encoded titles by decoded text', () => {
    const out = renameSectionInHTML(chapter, 'Method & Design', 'Methodology');
    expect(out).toContain('<h2>Methodology</h2><p>md body</p>');
  });

  it('is a no-op when the section is not found', () => {
    expect(renameSectionInHTML(chapter, 'Nope', 'X')).toBe(chapter);
  });
});

describe('deleteSectionFromHTML', () => {
  it('removes the block and leaves single page breaks between the rest', () => {
    const out = deleteSectionFromHTML(chapter, 'Statement of the Problem');
    expect(out).not.toContain('prob body');
    expect(out).toContain('bg body');
    expect(out).toContain('md body');
    expect(out.match(/pm-page-break/g)!.length).toBe(2);
  });

  it('deleting the first section keeps the preamble intact', () => {
    const out = deleteSectionFromHTML(chapter, 'Background of the Study');
    expect(out).toContain('<h1>CHAPTER 1: INTRODUCTION</h1><p>Intro.</p>');
    expect(out).not.toContain('bg body');
  });

  it('is a no-op when the section is not found', () => {
    expect(deleteSectionFromHTML(chapter, 'Nope')).toBe(chapter);
  });
});

describe('renameChapterInHTML', () => {
  it('rewrites the h1 with the uppercased new title', () => {
    const out = renameChapterInHTML(chapter, 'Chapter One: Overview');
    expect(out).toContain('<h1>CHAPTER ONE: OVERVIEW</h1>');
    expect(out).not.toContain('CHAPTER 1: INTRODUCTION');
  });

  it('is a no-op on empty html', () => {
    expect(renameChapterInHTML('', 'X')).toBe('');
  });
});

describe('isLockedChapter', () => {
  it('locks references and appendices in any case', () => {
    expect(isLockedChapter('REFERENCES')).toBe(true);
    expect(isLockedChapter('Appendices')).toBe(true);
    expect(isLockedChapter('Appendix A')).toBe(true);
    expect(isLockedChapter('CHAPTER 1: INTRODUCTION')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test`
Expected: new describes FAIL (functions not exported); Task 2 tests still pass.

- [ ] **Step 3: Implement**

Append to `services/outlineReconciler.ts`:

```ts
export const renameSectionInHTML = (html: string, oldName: string, newName: string): string => {
  const { preamble, blocks } = parseH2Blocks(html);
  if (blocks.length === 0) return html;
  let changed = false;
  const newBlocks = blocks.map(b => {
    if (!changed && b.title === oldName) {
      changed = true;
      return b.block.replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, `<h2>${escapeHTML(newName)}</h2>`);
    }
    return b.block;
  });
  if (!changed) return html;
  return stitch(preamble, newBlocks);
};

export const deleteSectionFromHTML = (html: string, name: string): string => {
  const { preamble, blocks } = parseH2Blocks(html);
  if (blocks.length === 0) return html;
  const remaining = blocks.filter(b => b.title !== name);
  if (remaining.length === blocks.length) return html;
  return stitch(preamble, remaining.map(b => b.block));
};

export const renameChapterInHTML = (html: string, newTitle: string): string => {
  if (!html) return html;
  // wrapChapterContent writes <h1>{TITLE UPPERCASED}</h1> — follow the same convention.
  return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, `<h1>${escapeHTML(newTitle.toUpperCase())}</h1>`);
};

/** REFERENCES / APPENDICES are fully locked: their dedicated AI prompts are
 *  triggered by title match, so renaming them would silently degrade
 *  generation to generic prose. Same detection as functions/index.js. */
export const isLockedChapter = (title: string): boolean => {
  const t = (title || '').toUpperCase();
  return t.includes('REFERENCE') || t.includes('APPENDIC');
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add services/outlineReconciler.ts services/outlineReconciler.test.ts
git commit -m "feat: section rename/delete and chapter rename HTML operations"
```

---

### Task 4: Reconciler — drafts, validation, content-deletion detection, atomic apply

**Files:**
- Modify: `services/outlineReconciler.ts`
- Modify: `services/outlineReconciler.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `services/outlineReconciler.test.ts` (extend imports with `outlineToDrafts, editsToOutline, validateStructureEdits, findContentBearingDeletions, applyStructureChanges` and `import type { Project } from '../types';`):

```ts
const makeProject = (): Project => ({
  id: 'p1', userId: 'u1', topic: 'T',
  studentName: '', matricNumber: '', supervisorName: '',
  institutionType: '' as any, institutionName: '', faculty: '', department: '',
  chapters: {
    'CHAPTER 1: INTRODUCTION': { title: 'CHAPTER 1: INTRODUCTION', content: chapter, status: 'completed' },
    'REFERENCES': { title: 'REFERENCES', content: '', status: 'empty' },
  },
  outline: [
    { title: 'CHAPTER 1: INTRODUCTION', sections: ['Background of the Study', 'Statement of the Problem', 'Method & Design'] },
    { title: 'REFERENCES', sections: [] },
  ],
  settings: { showPageNumbers: true, showHeader: true, academicFormat: 'standard' } as any,
  status: 'draft', createdAt: 0,
});

describe('outlineToDrafts / editsToOutline', () => {
  it('round-trips an outline and marks locked chapters', () => {
    const drafts = outlineToDrafts(makeProject().outline);
    expect(drafts[0].locked).toBe(false);
    expect(drafts[1].locked).toBe(true);
    expect(drafts[0].sections[0]).toEqual({ name: 'Background of the Study', originalName: 'Background of the Study' });
    expect(editsToOutline(drafts)).toEqual(makeProject().outline);
  });
});

describe('validateStructureEdits', () => {
  it('rejects empty names, duplicates, and over-long titles', () => {
    const drafts = outlineToDrafts(makeProject().outline);
    drafts[0].sections.push({ name: '', originalName: null });
    drafts[0].sections.push({ name: 'background of the study', originalName: null }); // case-insensitive dup
    drafts[0].title = 'x'.repeat(101);
    const errors = validateStructureEdits(drafts);
    expect(errors.some(e => e.includes('empty section'))).toBe(true);
    expect(errors.some(e => e.includes('Duplicate section'))).toBe(true);
    expect(errors.some(e => e.includes('too long'))).toBe(true);
  });

  it('passes a clean draft', () => {
    expect(validateStructureEdits(outlineToDrafts(makeProject().outline))).toEqual([]);
  });
});

describe('findContentBearingDeletions', () => {
  it('flags removed sections whose blocks have body text, ignores renames and empty blocks', () => {
    const project = makeProject();
    const drafts = outlineToDrafts(project.outline);
    // Rename one (NOT a deletion), delete another (HAS content), add one (no warn)
    drafts[0].sections[0].name = 'Background & Context';
    drafts[0].sections.splice(1, 1); // delete Statement of the Problem
    drafts[0].sections.push({ name: 'New Section', originalName: null });
    const dels = findContentBearingDeletions(project, drafts);
    expect(dels).toEqual([{ chapter: 'CHAPTER 1: INTRODUCTION', section: 'Statement of the Problem' }]);
  });
});

describe('applyStructureChanges', () => {
  it('applies rename + delete + add + reorder + chapter rename atomically', () => {
    const project = makeProject();
    const drafts = outlineToDrafts(project.outline);
    drafts[0].title = 'CHAPTER ONE: OVERVIEW';
    drafts[0].sections[0].name = 'Background & Context';          // rename
    drafts[0].sections.splice(1, 1);                               // delete Statement of the Problem
    drafts[0].sections.push({ name: 'New Section', originalName: null }); // add
    drafts[0].sections.reverse();                                  // reorder: [New, Method & Design, Background & Context]

    const applied = applyStructureChanges(project, drafts);

    expect(applied.outline[0]).toEqual({
      title: 'CHAPTER ONE: OVERVIEW',
      sections: ['New Section', 'Method & Design', 'Background & Context'],
    });
    expect(applied.renamedChapters).toEqual({ 'CHAPTER 1: INTRODUCTION': 'CHAPTER ONE: OVERVIEW' });
    expect(applied.chapters['CHAPTER 1: INTRODUCTION']).toBeUndefined();

    const html = applied.chapters['CHAPTER ONE: OVERVIEW'].content;
    expect(html).toContain('<h1>CHAPTER ONE: OVERVIEW</h1>');
    expect(html).not.toContain('prob body');                        // deleted
    expect(html).toContain('<h2>Background &amp; Context</h2><p>bg body</p>'); // renamed, body kept
    // Added section has no HTML until generated:
    expect(html).not.toContain('New Section');
    // Existing blocks follow the new order (Method & Design before Background):
    expect(html.indexOf('md body')).toBeLessThan(html.indexOf('bg body'));
    // Untouched chapters pass through:
    expect(applied.chapters['REFERENCES']).toEqual(project.chapters['REFERENCES']);
  });

  it('creates an empty chapter entry if the map was missing one', () => {
    const project = makeProject();
    delete (project.chapters as any)['REFERENCES'];
    const applied = applyStructureChanges(project, outlineToDrafts(project.outline));
    expect(applied.chapters['REFERENCES']).toEqual({ title: 'REFERENCES', content: '', status: 'empty' });
  });

  it('handles a name swap (A→B while B→A) without losing either body', () => {
    const project = makeProject();
    const drafts = outlineToDrafts(project.outline);
    drafts[0].sections[0].name = 'Statement of the Problem';   // Background → Statement
    drafts[0].sections[1].name = 'Background of the Study';    // Statement → Background
    const applied = applyStructureChanges(project, drafts);
    const html = applied.chapters['CHAPTER 1: INTRODUCTION'].content;
    expect(html).toContain('<h2>Statement of the Problem</h2><p>bg body</p>');
    expect(html).toContain('<h2>Background of the Study</h2><p>prob body</p>');
  });

  it('deletes the old block when renaming another section onto the deleted name', () => {
    const project = makeProject();
    const drafts = outlineToDrafts(project.outline);
    // Delete 'Statement of the Problem' AND rename Background → Statement of the Problem
    drafts[0].sections.splice(1, 1);
    drafts[0].sections[0].name = 'Statement of the Problem';
    const applied = applyStructureChanges(project, drafts);
    const html = applied.chapters['CHAPTER 1: INTRODUCTION'].content;
    expect(html).not.toContain('prob body');                 // old block really deleted
    expect(html).toContain('<h2>Statement of the Problem</h2><p>bg body</p>'); // renamed survivor
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test`
Expected: new describes FAIL; earlier ones pass.

- [ ] **Step 3: Implement**

Append to `services/outlineReconciler.ts`:

```ts
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
  outline.map(ch => ({
    originalTitle: ch.title,
    title: ch.title,
    locked: isLockedChapter(ch.title),
    sections: (ch.sections || []).map(s => ({ name: s, originalName: s })),
  }));

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

/** Sections being removed whose HTML block has body text beyond the heading.
 *  Used for the single aggregated warn dialog BEFORE applying changes. */
export const findContentBearingDeletions = (
  project: Project,
  edits: StructureEdits,
): Array<{ chapter: string; section: string }> => {
  const result: Array<{ chapter: string; section: string }> = [];
  for (const ch of edits) {
    const content = project.chapters?.[ch.originalTitle]?.content;
    if (!content) continue;
    const surviving = new Set(
      ch.sections.filter(s => s.originalName !== null).map(s => s.originalName as string),
    );
    for (const b of parseH2Blocks(content).blocks) {
      if (surviving.has(b.title)) continue;
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

/** Apply a full editing session atomically: renames, deletions, additions,
 *  reorder, and chapter renames (which re-key the chapters map). Pure. */
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
    //    is still among the draft's surviving originalName values.
    const survivingOriginals = new Set(
      ch.sections.filter(s => s.originalName !== null).map(s => s.originalName as string),
    );
    for (const b of parseH2Blocks(html).blocks) {
      if (!survivingOriginals.has(b.title)) html = deleteSectionFromHTML(html, b.title);
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
    chapters[finalTitle] = { ...existing, title: finalTitle, content: html };
  }

  return { outline: editsToOutline(edits), chapters, renamedChapters };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: only the 5 pre-existing `GhostTextExtension.ts` errors.

- [ ] **Step 6: Commit**

```bash
git add services/outlineReconciler.ts services/outlineReconciler.test.ts
git commit -m "feat: draft model, validation, deletion detection, atomic applyStructureChanges"
```

---

### Task 5: StructureEditor component

**Files:**
- Create: `components/Editor/StructureEditor.tsx`

No unit tests for this UI component (project has no component-test setup) — verified by type-check, build, and the manual smoke in Task 9.

- [ ] **Step 1: Create the component**

Create `components/Editor/StructureEditor.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import {
  X, Plus, Trash2, GripVertical, Lock, Check, AlertCircle,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ProjectOutline } from '../../types';
import {
  StructureEdits, SectionDraft, outlineToDrafts, validateStructureEdits,
} from '../../services/outlineReconciler';

/**
 * StructureEditor — full-screen (mobile) / centered modal (desktop) editor
 * for the project's chapter/section structure. Draft-based: nothing touches
 * the project until the user taps Save, when the full draft is handed to
 * onSave as StructureEdits (the caller validates content deletions and
 * applies). REFERENCES/APPENDICES rows are locked.
 */

interface StructureEditorProps {
  outline: ProjectOutline[];
  onSave: (edits: StructureEdits) => void;
  onClose: () => void;
  /** disable Save (e.g. while an AI stream is running) */
  saveDisabled?: boolean;
}

// Draft rows need stable ids for dnd + React keys while names mutate.
let nextRowId = 0;
const genId = () => `sr-${++nextRowId}`;

interface DraftRow extends SectionDraft { id: string; }
interface DraftChapter {
  originalTitle: string;
  title: string;
  locked: boolean;
  rows: DraftRow[];
}

const SortableRow: React.FC<{
  row: DraftRow;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}> = ({ row, onRename, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 py-1"
    >
      <button
        type="button"
        aria-label={`Reorder ${row.name || 'section'}`}
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-300 hover:text-slate-500 shrink-0 touch-none bg-transparent border-0 p-1"
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        value={row.name}
        onChange={e => onRename(row.id, e.target.value)}
        placeholder="Section name"
        maxLength={100}
        className="flex-1 min-w-0 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-green-700 focus:bg-white outline-none transition-all"
      />
      <button
        type="button"
        onClick={() => onDelete(row.id)}
        aria-label={`Delete section ${row.name || ''}`}
        className="shrink-0 p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

const StructureEditor: React.FC<StructureEditorProps> = ({ outline, onSave, onClose, saveDisabled }) => {
  const [drafts, setDrafts] = useState<DraftChapter[]>(() =>
    outlineToDrafts(outline).map(ch => ({
      originalTitle: ch.originalTitle,
      title: ch.title,
      locked: ch.locked,
      rows: ch.sections.map(s => ({ ...s, id: genId() })),
    })),
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const edits: StructureEdits = useMemo(
    () => drafts.map(ch => ({
      originalTitle: ch.originalTitle,
      title: ch.title,
      locked: ch.locked,
      sections: ch.rows.map(({ name, originalName }) => ({ name, originalName })),
    })),
    [drafts],
  );

  const errors = useMemo(() => validateStructureEdits(edits), [edits]);

  const renameChapter = (idx: number, title: string) =>
    setDrafts(d => d.map((ch, i) => (i === idx ? { ...ch, title } : ch)));

  const renameRow = (idx: number, id: string, name: string) =>
    setDrafts(d => d.map((ch, i) =>
      i === idx ? { ...ch, rows: ch.rows.map(r => (r.id === id ? { ...r, name } : r)) } : ch));

  const deleteRow = (idx: number, id: string) =>
    setDrafts(d => d.map((ch, i) =>
      i === idx ? { ...ch, rows: ch.rows.filter(r => r.id !== id) } : ch));

  const addRow = (idx: number) =>
    setDrafts(d => d.map((ch, i) =>
      i === idx
        ? { ...ch, rows: [...ch.rows, { id: genId(), name: '', originalName: null }] }
        : ch));

  const onDragEnd = (idx: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDrafts(d => d.map((ch, i) => {
      if (i !== idx) return ch;
      const from = ch.rows.findIndex(r => r.id === active.id);
      const to = ch.rows.findIndex(r => r.id === over.id);
      if (from === -1 || to === -1) return ch;
      return { ...ch, rows: arrayMove(ch.rows, from, to) };
    }));
  };

  const canSave = errors.length === 0 && !saveDisabled;

  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white w-full h-[92vh] md:h-auto md:max-h-[85vh] md:max-w-2xl md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">Customize Structure</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 custom-scrollbar">
          {drafts.map((ch, idx) => (
            <div key={ch.originalTitle}>
              {ch.locked ? (
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg text-slate-400">
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="text-xs font-black uppercase tracking-widest">{ch.title}</span>
                </div>
              ) : (
                <>
                  <input
                    value={ch.title}
                    onChange={e => renameChapter(idx, e.target.value)}
                    maxLength={100}
                    aria-label={`Chapter title (was ${ch.originalTitle})`}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-black uppercase tracking-wide text-slate-800 focus:ring-2 focus:ring-green-700 outline-none transition-all"
                  />
                  <div className="mt-2 pl-2 border-l-2 border-slate-100 space-y-0.5">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => onDragEnd(idx, e)}>
                      <SortableContext items={ch.rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                        {ch.rows.map(row => (
                          <SortableRow
                            key={row.id}
                            row={row}
                            onRename={(id, name) => renameRow(idx, id, name)}
                            onDelete={id => deleteRow(idx, id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                    <button
                      type="button"
                      onClick={() => addRow(idx)}
                      className="flex items-center gap-1.5 mt-1 px-2 py-2 text-green-700 hover:bg-green-50 rounded-lg text-xs font-black uppercase tracking-widest transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add section
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0 space-y-3">
          {errors.length > 0 && (
            <div className="flex items-start gap-2 text-red-600 text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errors[0]}</span>
            </div>
          )}
          {saveDisabled && (
            <p className="text-xs text-slate-400 font-medium">Finish or cancel the running AI generation before saving structure changes.</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 rounded-xl font-black text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => canSave && onSave(edits)}
              disabled={!canSave}
              className="flex-1 py-3.5 bg-[#1a4731] text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-[#153a28] transition-colors disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Save Structure
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StructureEditor;
```

- [ ] **Step 2: Type-check and build**

Run: `npm run lint`
Expected: only the 5 pre-existing errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/Editor/StructureEditor.tsx
git commit -m "feat: StructureEditor modal — draft-based add/rename/delete/reorder with locked References/Appendices"
```

---

### Task 6: Editor integration

**Files:**
- Modify: `components/Editor/ProjectEditor.tsx`

- [ ] **Step 1: Add imports and state**

In `components/Editor/ProjectEditor.tsx`:

1. Extend the lucide import (the list that currently ends with `Sparkles, X, CheckCircle2`) with `Settings2`:

```tsx
  AlertCircle, Zap, GripVertical, Bot, Send, Sparkles, X, CheckCircle2, Settings2
```

2. Extend the reconciler import from Task 2 with the new symbols:

```tsx
import {
  PAGE_BREAK_HTML,
  escapeHTML,
  reorderChapterSectionsInHTML,
  StructureEdits,
  findContentBearingDeletions,
  applyStructureChanges,
} from '../../services/outlineReconciler';
import StructureEditor from './StructureEditor';
```

3. Next to the other `useState` calls (after `const [toast, setToast] = useState<string | null>(null);`):

```tsx
  const [isStructureOpen, setIsStructureOpen] = useState(false);
```

- [ ] **Step 2: Add the save handler**

Insert after `handleDragEnd` (before the error/loading early-returns):

```tsx
  // ── Structure editing ────────────────────────────────────────────────────
  const handleStructureSave = (edits: StructureEdits) => {
    if (!project || isGeneratingRef.current) return;

    const deletions = findContentBearingDeletions(project, edits);
    if (deletions.length > 0) {
      const list = deletions.map(d => `• ${d.section}  (${d.chapter})`).join('\n');
      const ok = window.confirm(
        `These sections already have content that will be permanently removed:\n\n${list}\n\nDelete them?`
      );
      if (!ok) return;
    }

    const applied = applyStructureChanges(project, edits);
    const updated = { ...project, outline: applied.outline, chapters: applied.chapters };
    setProject(updated);
    // Keep the open chapter selected across a rename. Object.hasOwn because
    // chapter titles are user-controlled keys (a chapter titled "constructor"
    // must not hit Object.prototype).
    if (Object.hasOwn(applied.renamedChapters, activeChapter)) {
      setActiveChapter(applied.renamedChapters[activeChapter]);
    } else if (!Object.hasOwn(applied.chapters, activeChapter)) {
      setActiveChapter(applied.outline[0]?.title || '');
    }
    setIsStructureOpen(false);
    triggerAutosave(updated);
    showToast('Structure updated');
  };
```

- [ ] **Step 3: Add the Customize button to the sidebar header**

In the sidebar header (the `div` with `className="h-14 px-5 flex items-center justify-between border-b border-slate-100 shrink-0"`, containing the "Library" button and the department label), replace the department `<span>` with a group of department label + customize button:

```tsx
          <div className="flex items-center gap-1 ml-2 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 truncate max-w-20">
              {project.department}
            </span>
            <button
              onClick={() => setIsStructureOpen(true)}
              disabled={generating}
              title="Customize structure"
              aria-label="Customize chapter and section structure"
              className="shrink-0 p-1.5 text-slate-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-40"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
```

- [ ] **Step 4: Mount the modal**

Next to the existing `{showPayment && <PaymentModal …/>}` line at the top of the returned JSX:

```tsx
      {isStructureOpen && project && (
        <StructureEditor
          outline={project.outline}
          onSave={handleStructureSave}
          onClose={() => setIsStructureOpen(false)}
          saveDisabled={generating}
        />
      )}
```

- [ ] **Step 5: Type-check, test, build**

Run: `npm run lint` — only the 5 pre-existing errors.
Run: `npm test` — all reconciler tests still pass.
Run: `npm run build` — succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/Editor/ProjectEditor.tsx
git commit -m "feat: Customize Structure entry point in editor — warn on content deletions, atomic apply + autosave"
```

---

### Task 7: Wizard Step 4 integration

**Files:**
- Modify: `components/ProjectWizard/ProjectWizard.tsx`

- [ ] **Step 1: Add imports and state**

1. Extend the lucide import list with `Settings2`.
2. Add below the existing imports:

```tsx
import StructureEditor from '../Editor/StructureEditor';
import { StructureEdits, editsToOutline } from '../../services/outlineReconciler';
```

3. Next to the other Step-4 state (`const [outline, setOutline] = ...`):

```tsx
  const [isStructureOpen, setIsStructureOpen] = useState(false);
```

- [ ] **Step 2: Add the save handler**

Insert after `handleFinishWizard`:

```tsx
  // Customize structure before the credit is spent — edits the outline that
  // will be sent to createProject. No content reconciliation needed: no
  // chapters exist yet.
  const handleStructureSave = (edits: StructureEdits) => {
    setOutline(editsToOutline(edits));
    setIsStructureOpen(false);
    showToast('Structure updated', 'success');
  };
```

- [ ] **Step 3: Mount the modal and add the button**

1. Next to `{showPayment && <PaymentModal …/>}`:

```tsx
        {isStructureOpen && (
          <StructureEditor
            outline={outline}
            onSave={handleStructureSave}
            onClose={() => setIsStructureOpen(false)}
          />
        )}
```

2. In the Step 4 outline-preview card, directly under the chapter-grid `div` (the one with `className="grid sm:grid-cols-2 gap-4 …"`), add:

```tsx
                  <button
                    onClick={() => setIsStructureOpen(true)}
                    className="mt-6 w-full py-3.5 border border-white/20 text-emerald-300 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-colors"
                  >
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                    Customize structure for your department
                  </button>
```

- [ ] **Step 4: Type-check and build**

Run: `npm run lint` — only the 5 pre-existing errors.
Run: `npm run build` — succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/ProjectWizard/ProjectWizard.tsx
git commit -m "feat: customize structure at wizard Step 4, before the credit is spent"
```

---

### Task 8: Outline-aware AI prompts (functions/index.js)

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Add the shared known-section rules constant**

In `functions/index.js`, insert after the `buildAppendicesPrompt` function (before `extractJSON`):

```js
// Writing rules for the standard Nigerian-format section types. Custom
// sections (any title not listed) get the generic fallback rule. Shared by
// generateChapterStream and generateSectionStream.
const KNOWN_SECTION_RULES = `SECTION WRITING RULES — where a section's title matches one of the known types below, follow its rule exactly. For ANY OTHER section title, write 600-800 words of well-structured academic prose appropriate to that section's title and the research topic, with APA 7th in-text citations.

Known section types:
  - Background of the Study: flow from Global to African/Continental to Nigerian national to Local study site context. 5-6 full prose paragraphs.
  - Statement of the Problem: 4 paragraphs using problem-funnel style (national evidence to local gap to why investigation is needed).
  - Objectives of the Study: EXACTLY 1 general objective as a single <p>. Then a brief intro sentence, then EXACTLY 5 specific objectives — each as its own <p>, with numbers.
  - Research Questions: EXACTLY 6 research questions — one per <p>.
  - Research Hypotheses: EXACTLY 4 null hypotheses: <p><b>H01:</b> There is no statistically significant association between ... and ... </p> — one per <p>.
  - Significance of the Study: EXACTLY 5 paragraphs — one per stakeholder group (nursing profession, health care providers, PHC system, policy makers, society/caregivers).
  - Scope of Study: <p><b>Variables:</b> ...</p> <p><b>Location:</b> ...</p> <p><b>Population:</b> ...</p> — one item per <p>.
  - Operational Definition of Terms: EXACTLY 5 terms — <p><b>Term:</b> definition.</p> — one per <p>.
  - Conceptual Review: for EVERY key concept variable in the topic, write a sub-section — one sharp defining sentence followed by one deep explanatory paragraph connecting the concept to this study.
  - Theoretical Review: EXACTLY 2 paragraphs — paragraph 1 describes the chosen theoretical framework in full; paragraph 2 maps each causal layer of the framework to the study's specific variables.
  - Empirical Review: EXACTLY 3 flowing prose paragraphs citing named Nigerian authors with years — prevalence studies first, socioeconomic/maternal determinants second, feeding practices/morbidity third.
  - Research Design / Research Setting / Target Population / Sampling Technique / Instrument for Data Collection / Validity of Instrument / Reliability of Instrument / Method of Data Collection / Ethical Consideration: explain WHAT was done, then WHY that choice was made.
  - Sample Size and Formula: describe the Taro Yamane formula in words, show the full step-by-step mathematical working each in its own <p>, then add 10% attrition to the final sample. Formula variables: <p><b>symbol:</b> meaning</p> — one per variable.
  - Method of Data Analysis: must mention SPSS, descriptive statistics (frequencies, percentages, mean, standard deviation), Chi-square test of independence, and p-value threshold of less than 0.05.`;
```

- [ ] **Step 2: Make generateChapterStream outline-aware**

In `exports.generateChapterStream`, the ownership check currently discards the returned project data:

```js
  try {
    await verifyProjectOwner(projectId, decoded.uid);
  } catch (e) {
    return res.status(e.status || 403).send(e.message);
  }
```

Replace with:

```js
  let projectData;
  try {
    projectData = await verifyProjectOwner(projectId, decoded.uid);
  } catch (e) {
    return res.status(e.status || 403).send(e.message);
  }

  // Read the project's REAL outline server-side (client cannot tamper) so
  // generation follows the user's customized structure.
  const outlineEntry = Array.isArray(projectData.outline)
    ? projectData.outline.find((ch) => ch && ch.title === chapterTitle)
    : null;
  const customSections = outlineEntry && Array.isArray(outlineEntry.sections)
    ? outlineEntry.sections
        .filter((s) => typeof s === "string" && s.trim())
        .slice(0, 50)
        .map((s) => sanitize(s))
    : [];
```

Then, inside the generic (non-References/Appendices) prompt template, replace the entire block from the line `STRUCTURE — apply based on which chapter you are writing:` down to (and including) the last line of the `If writing CHAPTER 3 (METHODOLOGY):` rules — i.e. the hardcoded per-chapter structure — with an interpolated structure block. Change the prompt construction to:

```js
  const structureBlock = customSections.length
    ? `STRUCTURE — this project uses a customized outline. Write the chapter's body covering ALL of these sections in this exact order, treating each as a major section of the chapter:
${customSections.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}

${KNOWN_SECTION_RULES}`
    : `STRUCTURE — apply based on which chapter you are writing. Cover ALL standard sections for that chapter in their conventional order.

${KNOWN_SECTION_RULES}`;
```

and reference it in the template where the old block was:

```js
${structureBlock}
```

(Note: the References/Appendices dedicated-prompt branch runs BEFORE this and is untouched. The `If writing REFERENCES:` / `If writing APPENDICES:` fallback text inside this generic prompt is dead code once the dedicated branch exists — delete those two `If writing…` blocks as part of this replacement.)

- [ ] **Step 3: Make generateSectionStream rules conditional**

In `exports.generateSectionStream`:

1. Leave the ownership call exactly as it is (`await verifyProjectOwner(projectId, decoded.uid);`) — this endpoint writes ONE named section supplied in the request, so no outline lookup is needed.
2. In its prompt template, replace the entire `STRUCTURE — apply based on which section you are writing:` block (the `CHAPTER 1 sections:` / `CHAPTER 2 sections:` / `CHAPTER 3 sections:` lists) with:

```js
${KNOWN_SECTION_RULES}
```

- [ ] **Step 4: Syntax check**

Run: `cd functions; node --check index.js`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add functions/index.js
git commit -m "feat: outline-aware generation prompts — custom structures honored, known-name rules conditional"
```

---

### Task 9: Final verification + graph refresh

**Files:** none new.

- [ ] **Step 1: Full local verification**

Run, in order:
- `npm test` → all reconciler tests pass
- `npm run lint` → only the 5 pre-existing `GhostTextExtension.ts` errors
- `npm run build` → succeeds; note a new `StructureEditor` chunk (lazy parents) or inclusion in editor/wizard chunks
- `cd functions; node --check index.js` → exits 0

- [ ] **Step 2: Refresh the knowledge graph**

Run: `graphify update .`
Expected: graph.json/GRAPH_REPORT.md updated.

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: graph refresh after editable-structure feature"
```

- [ ] **Step 4: Manual smoke checklist (run after deploy)**

Deploy order: `firebase deploy --only functions` then `firebase deploy --only hosting`.

- Wizard: Step 4 → "Customize structure" → rename a section, add one, delete one, rename Chapter 4's title → Save → create project → sidebar shows the custom structure.
- Editor: Customize (gear icon) disabled while generating; enabled otherwise.
- Generate the custom-added section → content streams under its `<h2>`.
- Generate the full chapter → AI covers the custom section list in order (not the old standard list).
- Rename a content-bearing section → document `<h2>` follows; export DOCX → heading matches.
- Delete a content-bearing section → warn dialog lists it → confirm → block gone from document and export.
- Rename a chapter → sidebar, document `<h1>`, and export all match; open chapter stays selected.
- REFERENCES / APPENDICES rows are locked (no rename, no sections).
- Duplicate section name in one chapter → inline error, Save disabled.
- Reload the project → structure persists (Firestore round-trip).

---

## Out of scope (per spec)

Department templates/presets, sharing structures, add/delete whole chapters, editing REFERENCES/APPENDICES.
