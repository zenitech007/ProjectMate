import { describe, it, expect } from 'vitest';
import {
  PAGE_BREAK_HTML,
  escapeHTML,
  parseH2Blocks,
  reorderChapterSectionsInHTML,
  renameSectionInHTML,
  renameSectionsInHTML,
  deleteSectionFromHTML,
  renameChapterInHTML,
  isLockedChapter,
  outlineToDrafts,
  editsToOutline,
  validateStructureEdits,
  findContentBearingDeletions,
  applyStructureChanges,
} from './outlineReconciler';
import type { Project, Chapter } from '../types';
import { InstitutionType } from '../types';

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

  it('parses h2 tags that carry attributes', () => {
    const html = '<h1>T</h1>' + PB + '<h2 style="text-align: center">Styled</h2><p>x</p>';
    const { blocks } = parseH2Blocks(html);
    expect(blocks.map(b => b.title)).toEqual(['Styled']);
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

  it('heals legacy content with accumulated duplicate page breaks', () => {
    const legacy =
      '<h1>T</h1><p>i</p>' + PB + PB + PB +
      '<h2>A</h2><p>a</p>' + PB + '<h2>B</h2><p>b</p>';
    const out = reorderChapterSectionsInHTML(legacy, ['A', 'B']);
    expect(out.match(/pm-page-break/g)!.length).toBe(2);
  });

  it('preserves both blocks when two sections share a title', () => {
    const dup =
      '<h1>T</h1><p>i</p>' + PB +
      '<h2>Same</h2><p>first body</p>' + PB +
      '<h2>Same</h2><p>second body</p>';
    const out = reorderChapterSectionsInHTML(dup, ['Same']);
    expect(out).toContain('first body');
    expect(out).toContain('second body');
  });
});

describe('escapeHTML', () => {
  it('escapes &, <, >, and double quotes', () => {
    expect(escapeHTML('a & <b> "c"')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
  });
});

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

  it('does not interpret $ replacement patterns in the new name', () => {
    const out = renameSectionInHTML(chapter, 'Background of the Study', 'Budget $$ & Costing $&');
    expect(out).toContain('<h2>Budget $$ &amp; Costing $&amp;</h2><p>bg body</p>');
  });

  it('preserves heading attributes when renaming', () => {
    const styled = '<h1>T</h1>' + PB + '<h2 style="text-align: center">Old</h2><p>x</p>';
    const out = renameSectionInHTML(styled, 'Old', 'New');
    expect(out).toContain('<h2 style="text-align: center">New</h2><p>x</p>');
  });

  it('renames every duplicate-titled block', () => {
    const dup = '<h1>T</h1>' + PB + '<h2>Same</h2><p>one</p>' + PB + '<h2>Same</h2><p>two</p>';
    const out = renameSectionInHTML(dup, 'Same', 'Renamed');
    expect(out.match(/<h2>Renamed<\/h2>/g)!.length).toBe(2);
  });

  it('matches when oldName carries stray whitespace', () => {
    const out = renameSectionInHTML(chapter, '  Background of the Study  ', 'Tidy');
    expect(out).toContain('<h2>Tidy</h2><p>bg body</p>');
  });
});

describe('renameSectionsInHTML (map)', () => {
  it('handles a name swap in one pass', () => {
    const out = renameSectionsInHTML(chapter, new Map([
      ['Background of the Study', 'Statement of the Problem'],
      ['Statement of the Problem', 'Background of the Study'],
    ]));
    expect(out).toContain('<h2>Statement of the Problem</h2><p>bg body</p>');
    expect(out).toContain('<h2>Background of the Study</h2><p>prob body</p>');
  });

  it('returns the original string when nothing matches', () => {
    expect(renameSectionsInHTML(chapter, new Map([['Nope', 'X']]))).toBe(chapter);
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

  it('deleting the only section leaves just the preamble', () => {
    const single = '<h1>T</h1><p>i</p>' + PB + '<h2>Only</h2><p>body</p>';
    const out = deleteSectionFromHTML(single, 'Only');
    expect(out).toBe('<h1>T</h1><p>i</p>');
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

  it('is a no-op when no h1 exists', () => {
    const noH1 = '<p>plain</p>';
    expect(renameChapterInHTML(noH1, 'X')).toBe(noH1);
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

const makeProject = (): Project => ({
  id: 'p1', userId: 'u1', topic: 'T',
  studentName: '', matricNumber: '', supervisorName: '',
  institutionType: InstitutionType.UNIVERSITY, institutionName: '', faculty: '', department: '',
  chapters: {
    'CHAPTER 1: INTRODUCTION': { title: 'CHAPTER 1: INTRODUCTION', content: chapter, status: 'completed' },
    'REFERENCES': { title: 'REFERENCES', content: '', status: 'empty' },
  },
  outline: [
    { title: 'CHAPTER 1: INTRODUCTION', sections: ['Background of the Study', 'Statement of the Problem', 'Method & Design'] },
    { title: 'REFERENCES', sections: [] },
  ],
  settings: { showPageNumbers: true, showHeader: true, academicFormat: 'standard' },
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

  it('seeds locked chapters with no section drafts even if data carries some', () => {
    const drafts = outlineToDrafts([{ title: 'REFERENCES', sections: ['Junk From LLM'] }]);
    expect(drafts[0].locked).toBe(true);
    expect(drafts[0].sections).toEqual([]);
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

  it('rejects renaming or adding sections to locked chapters', () => {
    const drafts = outlineToDrafts(makeProject().outline);
    drafts[1].title = 'BIBLIOGRAPHY';
    expect(validateStructureEdits(drafts).some(e => e.includes('locked'))).toBe(true);
    const drafts2 = outlineToDrafts(makeProject().outline);
    drafts2[1].sections.push({ name: 'X', originalName: null });
    expect(validateStructureEdits(drafts2).some(e => e.includes('locked'))).toBe(true);
  });

  it('rejects renaming an unlocked chapter into the reserved namespace', () => {
    const drafts = outlineToDrafts(makeProject().outline);
    drafts[0].title = 'REFERENCE MATERIALS';
    expect(validateStructureEdits(drafts).some(e => e.includes('reserved'))).toBe(true);
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
    delete project.chapters['REFERENCES'];
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

  it('passes through chapters present in the map but absent from the drafts', () => {
    const project = makeProject();
    (project.chapters as Record<string, Chapter>)['PRELIMINARY PAGES'] = {
      title: 'PRELIMINARY PAGES', content: '<p>cover</p>', status: 'completed',
    };
    const applied = applyStructureChanges(project, outlineToDrafts(project.outline));
    expect(applied.chapters['PRELIMINARY PAGES']).toEqual(project.chapters['PRELIMINARY PAGES']);
  });

  it('downgrades a completed chapter to empty when all its content is deleted', () => {
    const project = makeProject();
    project.chapters['CHAPTER 1: INTRODUCTION'].content = '<h2>Background of the Study</h2><p>bg body</p>';
    const drafts = outlineToDrafts(project.outline);
    drafts[0].sections = [];
    const applied = applyStructureChanges(project, drafts);
    expect(applied.chapters['CHAPTER 1: INTRODUCTION']).toMatchObject({ content: '', status: 'empty' });
  });

  it('preserves pending status on an empty chapter draft', () => {
    const project = makeProject();
    project.chapters['CHAPTER 1: INTRODUCTION'] = { title: 'CHAPTER 1: INTRODUCTION', content: '', status: 'pending' };
    const applied = applyStructureChanges(project, outlineToDrafts(project.outline));
    expect(applied.chapters['CHAPTER 1: INTRODUCTION'].status).toBe('pending');
  });

  it('handles a chapter TITLE swap, keeping both entries and mapping both renames', () => {
    const project = makeProject();
    project.chapters['CHAPTER 2: REVIEW'] = { title: 'CHAPTER 2: REVIEW', content: '<h1>CHAPTER 2: REVIEW</h1><p>two</p>', status: 'completed' };
    project.outline.splice(1, 0, { title: 'CHAPTER 2: REVIEW', sections: [] });
    const drafts = outlineToDrafts(project.outline);
    drafts[0].title = 'CHAPTER 2: REVIEW';
    drafts[1].title = 'CHAPTER 1: INTRODUCTION';
    const applied = applyStructureChanges(project, drafts);
    expect(applied.chapters['CHAPTER 2: REVIEW'].content).toContain('bg body');
    expect(applied.chapters['CHAPTER 1: INTRODUCTION'].content).toContain('two');
    expect(applied.renamedChapters).toEqual({
      'CHAPTER 1: INTRODUCTION': 'CHAPTER 2: REVIEW',
      'CHAPTER 2: REVIEW': 'CHAPTER 1: INTRODUCTION',
    });
  });

  it('returns byte-identical content for a no-op draft', () => {
    const project = makeProject();
    const applied = applyStructureChanges(project, outlineToDrafts(project.outline));
    expect(applied.chapters['CHAPTER 1: INTRODUCTION'].content).toBe(chapter);
  });
});
