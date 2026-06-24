import { describe, it, expect } from 'vitest';
import { cleanHTML, cleanDocumentHTML } from './htmlCleaner';
import { parseH2Blocks, PAGE_BREAK_HTML } from './outlineReconciler';

const PB = PAGE_BREAK_HTML;
const doc =
  '<h1>CHAPTER 1: INTRODUCTION</h1><p>Intro.</p>' + PB +
  '<h2>Background of the Study</h2><p>bg body</p>' + PB +
  '<h2>Statement of the Problem</h2><p>prob body</p>';

describe('cleanDocumentHTML', () => {
  it('preserves chapter h1/h2 headings and page breaks', () => {
    const out = cleanDocumentHTML(doc);
    expect(out).toContain('<h1>CHAPTER 1: INTRODUCTION</h1>');
    expect(out).toContain('<h2>Background of the Study</h2>');
    expect(out.match(/pm-page-break/g)!.length).toBe(2);
  });

  it('round-trips through parseH2Blocks intact', () => {
    expect(parseH2Blocks(cleanDocumentHTML(doc)).blocks).toHaveLength(2);
  });

  it('still strips XSS vectors', () => {
    const out = cleanDocumentHTML(doc + '<script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('onerror');
  });

  it('handles empty input', () => {
    expect(cleanDocumentHTML('')).toBe('');
  });
});

describe('cleanHTML (AI body fragments)', () => {
  it('still demotes headings to bold — fragments must not carry headings', () => {
    expect(cleanHTML('<h2>Sneaky</h2><p>x</p>')).toContain('<b>Sneaky</b>');
  });
});
