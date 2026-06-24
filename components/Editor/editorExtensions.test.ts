import { describe, it, expect } from 'vitest';
import { Editor, generateHTML, generateJSON } from '@tiptap/core';
import { PAGE_BREAK_HTML } from '../../services/outlineReconciler';
import { buildEditorExtensions } from './editorExtensions';

// Chapter HTML is persisted via editor.getHTML() on every manual edit
// (WordEditor onUpdate → ProjectEditor handleEdit), so any element the schema
// cannot represent is silently dropped the first time a user edits a chapter.
// Page breaks must survive byte-for-byte: outlineReconciler strips trailing
// breaks with String.endsWith(PAGE_BREAK_HTML), and exportService converts
// the divs into real DOCX/PDF page breaks.
describe('editor schema round-trip', () => {
  const extensions = buildEditorExtensions();
  const roundTrip = (html: string) =>
    generateHTML(generateJSON(html, extensions), extensions);

  it('preserves page-break divs between blocks', () => {
    const html = `<p>before</p>${PAGE_BREAK_HTML}<p>after</p>`;
    expect(roundTrip(html)).toBe(html);
  });

  it('serializes a trailing page break byte-for-byte (endsWith contract)', () => {
    const html = `<h2>Background of the Study</h2><p>body</p>${PAGE_BREAK_HTML}`;
    const out = roundTrip(html);
    expect(out).toBe(html);
    expect(out.endsWith(PAGE_BREAK_HTML)).toBe(true);
  });

  it('survives a live editor edit cycle (editor.getHTML, the persistence path)', () => {
    const html = `<p>before</p>${PAGE_BREAK_HTML}<p>after</p>`;
    const editor = new Editor({ extensions, content: html });
    try {
      expect(editor.getHTML()).toBe(html);
    } finally {
      editor.destroy();
    }
  });

  it('setPageBreak command inserts a page-break div', () => {
    const editor = new Editor({ extensions, content: '<p>text</p>' });
    try {
      editor.commands.setPageBreak();
      expect(editor.getHTML()).toContain(PAGE_BREAK_HTML);
    } finally {
      editor.destroy();
    }
  });
});
