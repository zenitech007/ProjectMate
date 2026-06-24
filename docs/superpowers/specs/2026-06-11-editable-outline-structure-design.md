# Editable Outline Structure — Design

**Date:** 2026-06-11
**Status:** Approved by owner (brainstorming session)
**Feature:** Users can rename, add, remove, and reorder chapter sub-sections, and rename chapter titles, per project — because Nigerian universities and departments issue different project formats.

## Problem

The chapter/section structure is currently a fixed standard list. It is rendered per-project from `project.outline` in Firestore, but users cannot change it (except drag-reorder of sections, which already exists). Three Cloud Function prompts hardcode the standard section names, so even if the outline were edited, AI generation would ignore the custom structure.

## Decisions (made with owner)

1. **Edit locations:** both the editor sidebar (anytime) and Wizard Step 4 (outline review, before a credit is spent).
2. **Delete behavior:** warn first — a single confirmation dialog listing every content-bearing section being deleted — then remove both the sidebar entry and the matching content block from the chapter HTML.
3. **Scope:** sections fully editable (add / remove / rename / reorder). Chapter titles **rename-only** — no adding or deleting chapters. REFERENCES and APPENDICES are **fully locked** (no rename, no sections): their dedicated AI prompts are triggered by title match, so renaming them would silently degrade generation to generic prose.
4. **UI approach:** a dedicated full-screen (mobile) / modal (desktop) **Structure Editor**, shared between the editor and the wizard. Atomic Save/Cancel. (Inline sidebar editing rejected: too cramped on phones, per-keystroke saves race with AI streams.)

## Design

### Data model

No new Firestore fields. `project.outline: {title: string, sections: string[]}[]` remains the single source of truth for structure.

Load-bearing keying facts:
- `project.chapters` is a map **keyed by chapter title**.
- Section content blocks inside chapter HTML are **keyed by their `<h2>` heading text** (this is how the existing drag-reorder re-stitches HTML).

Therefore two uniqueness rules are enforced in the UI with inline errors:
- No two chapters with the same title.
- No two sections with the same name within one chapter.

### Content reconciliation — `services/outlineReconciler.ts` (new)

A pure module (no React, no Firestore): `applyStructureChanges(project, edits) -> {outline, chapters}` built on the same `<h2>`-block parsing as the production reorder helper (`reorderChapterSectionsInHTML`).

| Edit | Outline change | Chapter HTML change |
|---|---|---|
| Rename chapter | title updated | rewrite `<h1>`; re-key `chapters` map; update `activeChapter` if open |
| Rename section | name updated | rewrite the matching `<h2>` text |
| Delete section | removed | delete the `<h2>` block + adjacent page-break div |
| Add section | appended | none — no HTML until generated or typed |
| Reorder section | existing behavior | existing behavior |

All edits from one editing session apply in **one** state update + **one** autosave write. The warn dialog aggregates all deletions into a single prompt.

### UI — `components/Editor/StructureEditor.tsx` (new, shared)

- **Editor entry point:** "Customize" (pencil) button in the sidebar header. Renders full-screen on mobile, centered modal on desktop.
- **Wizard entry point:** rendered inline on Step 4 (outline review) — edits the outline array before `createProject` is called. No reconciliation needed (no chapter content exists yet).
- Rows are large and touch-friendly: tap title to rename in place, trash icon to delete, drag handle to reorder, "+ Add section" at the foot of each chapter.
- REFERENCES / APPENDICES are listed greyed-out: not renameable, no sections (their dedicated AI prompts key off the title text).
- **Save** applies atomically (with warn dialog when deletions have content); **Cancel** discards all edits.
- Save is disabled while an AI stream is running (reuses the editor's existing `isGeneratingRef` lock). Structure edits and streams never interleave.

### AI prompt changes — `functions/index.js`

- `generateChapterStream`: the ownership check (`verifyProjectOwner`) already fetches the project document; reuse that snapshot to read the project's real outline **server-side** (client cannot tamper). Replace the hardcoded "Cover ALL sections in this exact order: Background of the Study, …" with the project's actual section list for the chapter being generated.
- Per-section writing rules (e.g. "Research Hypotheses: EXACTLY 4 null hypotheses…") become **conditional**: applied when a section title matches a known type; any other (custom) section gets "write 600–800 words of well-structured academic prose appropriate to this section's title."
- `generateSectionStream`: same conditional treatment.
- `generateOutline` (wizard): unchanged — still produces the standard template as the starting point.
- References/Appendices dedicated prompts: unchanged.
- `createProject`: unchanged — already accepts an arbitrary sanitized outline (caps: 30 chapters, 50 sections/chapter).

### Validation

- Titles: 1–100 chars after trim/sanitize.
- Uniqueness rules above.
- ≤ 50 sections per chapter (mirrors the server cap).

## Out of scope (YAGNI)

- Department templates / presets / sharing structures between users.
- Adding or deleting whole chapters.
- Editing sections under REFERENCES / APPENDICES.

## Testing

- **Unit tests** for `outlineReconciler`: rename `<h1>`/`<h2>`, delete block with and without page break, add as HTML no-op, batched combined edits, entity-encoded titles (`&amp;` in headings), duplicate-name rejection.
- **Manual smoke:** customize structure in wizard → create project → generate a custom section → rename it → delete it (warn path) → export DOCX/PDF, confirming the document and exports follow the custom structure.

## Files touched

| File | Change |
|---|---|
| `services/outlineReconciler.ts` | new — pure reconciliation helpers |
| `components/Editor/StructureEditor.tsx` | new — shared editing UI |
| `components/Editor/ProjectEditor.tsx` | "Customize" entry point; apply reconciled state; lock vs streams |
| `components/ProjectWizard/ProjectWizard.tsx` | embed StructureEditor in Step 4 |
| `functions/index.js` | outline-aware chapter/section prompts (conditional known-name rules) |
