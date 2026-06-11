/**
 * exportService.ts
 *
 * KEY CHANGE: docx and jsPDF are dynamically imported INSIDE each export
 * function. This means the ~883 kB vendor-export chunk is never downloaded
 * until the user actually clicks "Export". On a Nigerian 3G connection that's
 * roughly 6 seconds of load time saved on every page that isn't the editor.
 *
 * Everything else (the HTML parsing logic, paragraph helpers) is identical
 * to the original — only the import style changed.
 */
import { Project } from '../types';

// ─── Inline style helpers (no imports needed) ─────────────────────────────────

const collectTextRuns = async (
  rootNode: Node,
  initialStyles: Record<string, any> = {},
  TextRun: any,
  UnderlineType: any
): Promise<any[]> => {
  const runs: any[] = [];

  const walk = (node: Node, currentStyles: Record<string, any>) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent || '';
        if (text) {
          runs.push(new TextRun({ text, font: 'Times New Roman', size: 24, ...currentStyles }));
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName?.toLowerCase();
        const newStyles = { ...currentStyles };
        if (tag === 'b' || tag === 'strong') newStyles.bold = true;
        if (tag === 'i' || tag === 'em') newStyles.italics = true;
        if (tag === 'u') newStyles.underline = { type: UnderlineType.SINGLE };
        walk(child, newStyles);
      }
    });
  };

  walk(rootNode, initialStyles);
  return runs;
};

// ─── DOCX Export ──────────────────────────────────────────────────────────────

export const exportToDocx = async (project: Project) => {
  // Dynamically import docx — only downloaded when this function is called
  const {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    HeadingLevel, PageNumber, Header, Footer, PageBreak, UnderlineType,
  } = await import('docx');

  const htmlToParagraphs = async (html: string | undefined | null): Promise<any[]> => {
    if (!html || !html.trim()) return [];
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const paragraphs: any[] = [];

    const processNode = async (node: Element): Promise<void> => {
      const tag = node.tagName?.toLowerCase();

      if (tag === 'div' && node.getAttribute('data-page-break') !== null) {
        paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
        return;
      }
      if (tag === 'h1') {
        paragraphs.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 400 },
          children: [new TextRun({ text: node.textContent?.toUpperCase() || '', bold: true, font: 'Times New Roman', size: 28 })],
        }));
        return;
      }
      if (tag === 'h2') {
        paragraphs.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 360, after: 200 },
          children: [new TextRun({ text: node.textContent?.toUpperCase() || '', bold: true, font: 'Times New Roman', size: 24, underline: { type: UnderlineType.SINGLE } })],
        }));
        return;
      }
      if (tag === 'h3') {
        paragraphs.push(new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: node.textContent || '', bold: true, font: 'Times New Roman', size: 24 })],
        }));
        return;
      }
      if (tag === 'p') {
        const runs = await collectTextRuns(node, {}, TextRun, UnderlineType);
        if (runs.length > 0) {
          paragraphs.push(new Paragraph({
            children: runs,
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: 480, after: 120 },
            indent: { firstLine: 720 },
          }));
        }
        return;
      }
      if (tag === 'ul' || tag === 'ol') {
        const directLis = Array.from(node.children).filter(c => c.tagName?.toLowerCase() === 'li');
        for (const [idx, li] of directLis.entries()) {
          const prefix = tag === 'ol' ? `${idx + 1}. ` : '\u2022  ';
          const prefixRun = new TextRun({ text: prefix, font: 'Times New Roman', size: 24 });
          const contentRuns = await collectTextRuns(li, {}, TextRun, UnderlineType);
          paragraphs.push(new Paragraph({
            children: [prefixRun, ...contentRuns],
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: 480, after: 80 },
            indent: { left: 720, hanging: 360 },
          }));
        }
        return;
      }
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) await processNode(child as Element);
      }
    };

    for (const child of Array.from(dom.body.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) await processNode(child as Element);
    }
    return paragraphs;
  };

  const titlePage = [
    new Paragraph({ text: project.topic.toUpperCase(), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { before: 2000, after: 1000 } }),
    new Paragraph({ text: 'BY', alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: project.studentName.toUpperCase(), bold: true, size: 28 })] }),
    new Paragraph({ text: project.matricNumber, alignment: AlignmentType.CENTER, spacing: { after: 1000 } }),
    new Paragraph({ text: `A RESEARCH PROJECT SUBMITTED TO THE DEPARTMENT OF ${project.department.toUpperCase()}, FACULTY OF ${project.faculty.toUpperCase()}, ${project.institutionName.toUpperCase()}`, alignment: AlignmentType.CENTER, spacing: { line: 480 } }),
    new Paragraph({ text: `IN PARTIAL FULFILMENT OF THE REQUIREMENTS FOR THE AWARD OF THE DEGREE OF BACHELOR OF SCIENCE (B.Sc) IN ${project.department.toUpperCase()}`, alignment: AlignmentType.CENTER, spacing: { before: 1000, after: 1000 } }),
    new Paragraph({ text: `SUPERVISOR: ${project.supervisorName.toUpperCase()}`, alignment: AlignmentType.CENTER, spacing: { before: 2000 } }),
    new Paragraph({ text: new Date().getFullYear().toString(), alignment: AlignmentType.CENTER, spacing: { before: 1000 } }),
  ];

  const chapterSections = await Promise.all(project.outline.map(async chapter => {
    const storedHtml = project.chapters[chapter.title]?.content || '';
    const contentParagraphs = storedHtml
      ? await htmlToParagraphs(storedHtml)
      : [new Paragraph({ children: [new TextRun({ text: `[${chapter.title} — content not yet generated]`, font: 'Times New Roman', size: 24, italics: true, color: 'AAAAAA' })] })];

    return {
      properties: {},
      headers: project.settings?.showHeader ? {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${project.topic.substring(0, 50)}… | ${chapter.title}`, size: 16, color: '999999' })] })] }),
      } : undefined,
      footers: project.settings?.showPageNumbers ? {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('Page '), new TextRun({ children: [PageNumber.CURRENT] })] })] }),
      } : undefined,
      children: contentParagraphs,
    };
  }));

  const doc = new Document({ sections: [{ children: titlePage }, ...chapterSections] });
  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.topic.substring(0, 30)}_ProjectMate.docx`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// ─── PDF Export ───────────────────────────────────────────────────────────────

export const exportToPdf = async (project: Project) => {
  // Dynamically import jsPDF — only downloaded when this function is called
  const { jsPDF } = await import('jspdf');

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 72;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  let currentPage = 1;

  const checkNewPage = (needed: number) => {
    if (y + needed > pageHeight - margin) { addFooter(); pdf.addPage(); currentPage++; y = margin + 20; }
  };
  const addFooter = () => {
    if (!project.settings?.showPageNumbers) return;
    pdf.setFont('times', 'normal'); pdf.setFontSize(10); pdf.setTextColor(100, 100, 100);
    pdf.text(String(currentPage), pageWidth / 2, pageHeight - 30, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  };
  const addHeader = (title: string) => {
    if (!project.settings?.showHeader) return;
    pdf.setFont('times', 'italic'); pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
    pdf.text(`${project.topic.substring(0, 60)}… | ${title}`, pageWidth - margin, 30, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
  };

  // Title page
  pdf.setFont('times', 'bold'); pdf.setFontSize(18);
  pdf.text(pdf.splitTextToSize(project.topic.toUpperCase(), contentWidth), pageWidth / 2, 140, { align: 'center' });
  pdf.setFont('times', 'normal'); pdf.setFontSize(12);
  pdf.text('BY', pageWidth / 2, 220, { align: 'center' });
  pdf.setFont('times', 'bold'); pdf.setFontSize(14);
  pdf.text(project.studentName.toUpperCase(), pageWidth / 2, 245, { align: 'center' });
  pdf.setFont('times', 'normal'); pdf.setFontSize(12);
  pdf.text(project.matricNumber, pageWidth / 2, 265, { align: 'center' });
  const subText = `A RESEARCH PROJECT SUBMITTED TO THE DEPARTMENT OF ${project.department.toUpperCase()}, FACULTY OF ${project.faculty.toUpperCase()}, ${project.institutionName.toUpperCase()} IN PARTIAL FULFILMENT OF THE REQUIREMENTS FOR THE AWARD OF THE DEGREE OF BACHELOR OF SCIENCE (B.Sc) IN ${project.department.toUpperCase()}`;
  pdf.text(pdf.splitTextToSize(subText, contentWidth - 80), pageWidth / 2, 360, { align: 'center' });
  pdf.setFont('times', 'bold');
  pdf.text(`SUPERVISOR: ${project.supervisorName.toUpperCase()}`, pageWidth / 2, 500, { align: 'center' });
  pdf.text(new Date().getFullYear().toString(), pageWidth / 2, 560, { align: 'center' });

  // Chapters
  for (const chapter of project.outline) {
    addFooter(); pdf.addPage(); currentPage++; y = margin + 20; addHeader(chapter.title);
    const storedHtml = project.chapters[chapter.title]?.content || '';
    if (!storedHtml) {
      pdf.setFont('times', 'italic'); pdf.setFontSize(12); pdf.setTextColor(170, 170, 170);
      pdf.text(`[${chapter.title} — content not yet generated]`, margin, y);
      pdf.setTextColor(0, 0, 0); continue;
    }

    const dom = new DOMParser().parseFromString(storedHtml, 'text/html');

    const collectPdfSegs = (node: Node, styles = { bold: false, italic: false }): { text: string; bold: boolean; italic: boolean }[] => {
      const segs: { text: string; bold: boolean; italic: boolean }[] = [];
      const walk = (n: Node, s: { bold: boolean; italic: boolean }) => {
        n.childNodes.forEach(c => {
          if (c.nodeType === Node.TEXT_NODE) { segs.push({ text: c.textContent || '', ...s }); }
          else if (c.nodeType === Node.ELEMENT_NODE) {
            const tag = (c as Element).tagName?.toLowerCase();
            const ns = { ...s };
            if (tag === 'b' || tag === 'strong') ns.bold = true;
            if (tag === 'i' || tag === 'em') ns.italic = true;
            walk(c, ns);
          }
        });
      };
      walk(node, styles);
      return segs;
    };

    const renderSegs = (segs: { text: string; bold: boolean; italic: boolean }[], startX: number, wrapX: number) => {
      const lh = 24; let cx = startX;
      for (const seg of segs) {
        const style = seg.bold && seg.italic ? 'bolditalic' : seg.bold ? 'bold' : seg.italic ? 'italic' : 'normal';
        pdf.setFont('times', style);
        for (const word of seg.text.split(/(\s+)/)) {
          if (!word) continue;
          const ww = pdf.getStringUnitWidth(word) * 12 / pdf.internal.scaleFactor;
          if (cx + ww > pageWidth - margin) { y += lh; checkNewPage(lh); cx = wrapX; }
          pdf.text(word, cx, y); cx += ww;
        }
      }
      y += 24;
    };

    const renderNode = (node: Element) => {
      const tag = node.tagName?.toLowerCase();
      if (tag === 'div' && node.getAttribute('data-page-break') !== null) {
        addFooter(); pdf.addPage(); currentPage++; y = margin + 20; addHeader(chapter.title); return;
      }
      if (tag === 'h1') {
        checkNewPage(40); pdf.setFont('times', 'bold'); pdf.setFontSize(16);
        const lines = pdf.splitTextToSize((node.textContent || '').toUpperCase(), contentWidth);
        pdf.text(lines, pageWidth / 2, y, { align: 'center' }); y += lines.length * 22 + 16; return;
      }
      if (tag === 'h2') {
        checkNewPage(36); y += 12; pdf.setFont('times', 'bold'); pdf.setFontSize(13);
        const lines = pdf.splitTextToSize((node.textContent || '').toUpperCase(), contentWidth);
        pdf.text(lines, margin, y); y += lines.length * 18 + 8; return;
      }
      if (tag === 'h3') {
        checkNewPage(28); y += 8; pdf.setFont('times', 'bold'); pdf.setFontSize(12);
        const lines = pdf.splitTextToSize(node.textContent || '', contentWidth);
        pdf.text(lines, margin, y); y += lines.length * 16 + 6; return;
      }
      if (tag === 'p') {
        const segs = collectPdfSegs(node);
        if (segs.every(s => !s.text.trim())) return;
        pdf.setFontSize(12); checkNewPage(24);
        renderSegs(segs, margin + 36, margin); return;
      }
      if (tag === 'ul' || tag === 'ol') {
        Array.from(node.children).filter(c => c.tagName?.toLowerCase() === 'li').forEach((li, idx) => {
          const prefix = tag === 'ol' ? `${idx + 1}. ` : '\u2022  ';
          const segs = collectPdfSegs(li);
          if (segs.every(s => !s.text.trim())) return;
          pdf.setFontSize(12); checkNewPage(24); pdf.setFont('times', 'normal');
          pdf.text(prefix, margin, y);
          renderSegs(segs, margin + 36, margin + 36);
        });
        return;
      }
      node.childNodes.forEach(c => { if (c.nodeType === Node.ELEMENT_NODE) renderNode(c as Element); });
    };

    dom.body.childNodes.forEach(c => { if (c.nodeType === Node.ELEMENT_NODE) renderNode(c as Element); });
  }

  addFooter();
  pdf.save(`${project.topic.substring(0, 30)}_ProjectMate.pdf`);
};