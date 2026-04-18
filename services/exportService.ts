import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  HeadingLevel, PageNumber, Header, Footer, PageBreak,
  UnderlineType,
} from 'docx';
import { jsPDF } from 'jspdf';
import { Project } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// HTML → docx Paragraph converter
//
// ROOT CAUSE OF THE BUG (now fixed):
//   The old exportService looped over outline sections and for EACH section
//   dumped the ENTIRE chapter HTML as raw plain text. So if Chapter 1 had 7
//   sections, the same "Background of the Study" wall-of-text was written 7
//   times under every section heading.
//
// THE FIX:
//   We parse the stored HTML ONCE per chapter. The HTML is already correctly
//   structured (wrapChapterContent adds <h1>, appendSection adds <h2> + <p>
//   body for each section). We walk those nodes and convert them to proper
//   docx Paragraph objects preserving headings, bold, body text, page breaks.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Recursively collect TextRun objects from a DOM node, inheriting inline styles.
 * Shared by both <p> and <li> converters to avoid duplication.
 */
const collectTextRuns = (rootNode: Node, initialStyles: Record<string, any> = {}): TextRun[] => {
  const runs: TextRun[] = [];

  const walk = (node: Node, currentStyles: Record<string, any>) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent || '';
        if (text) {
          runs.push(new TextRun({ text, font: 'Times New Roman', size: 24, ...currentStyles }));
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const childTag = el.tagName?.toLowerCase();
        const newStyles = { ...currentStyles };
        if (childTag === 'b' || childTag === 'strong') newStyles.bold = true;
        if (childTag === 'i' || childTag === 'em') newStyles.italics = true;
        if (childTag === 'u') newStyles.underline = { type: UnderlineType.SINGLE };
        walk(child, newStyles);
      }
    });
  };

  walk(rootNode, initialStyles);
  return runs;
};

const htmlToParagraphs = (html: string | undefined | null): Paragraph[] => {
  if (!html || !html.trim()) return [];

  const dom = new DOMParser().parseFromString(html, 'text/html');
  const paragraphs: Paragraph[] = [];

  const processNode = (node: Element) => {
    const tag = node.tagName?.toLowerCase();

    // Page-break div inserted by appendSection()
    if (tag === 'div' && node.getAttribute('data-page-break') !== null) {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
      return;
    }

    // <h1> → chapter title (centered, bold, large)
    if (tag === 'h1') {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 400 },
          children: [
            new TextRun({
              text: node.textContent?.toUpperCase() || '',
              bold: true,
              font: 'Times New Roman',
              size: 28,
            }),
          ],
        })
      );
      return;
    }

    // <h2> → section heading (bold, underlined)
    if (tag === 'h2') {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 360, after: 200 },
          children: [
            new TextRun({
              text: node.textContent?.toUpperCase() || '',
              bold: true,
              font: 'Times New Roman',
              size: 24,
              underline: { type: UnderlineType.SINGLE },
            }),
          ],
        })
      );
      return;
    }

    // <h3> → sub-section heading
    if (tag === 'h3') {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
          children: [
            new TextRun({
              text: node.textContent || '',
              bold: true,
              font: 'Times New Roman',
              size: 24,
            }),
          ],
        })
      );
      return;
    }

    // <p> → justified body paragraph; handle inline formatting
    if (tag === 'p') {
      const runs = collectTextRuns(node);

      if (runs.length > 0) {
        paragraphs.push(
          new Paragraph({
            children: runs,
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: 480, after: 120 },
            indent: { firstLine: 720 },
          })
        );
      }
      return;
    }

    // <ul>/<ol> → bullet/numbered list items (direct children only — Fix #14)
    if (tag === 'ul' || tag === 'ol') {
      const directLis = Array.from(node.children).filter(
        child => child.tagName?.toLowerCase() === 'li'
      );
      directLis.forEach((li, idx) => {
        const prefix = tag === 'ol' ? `${idx + 1}. ` : '\u2022  ';
        const prefixRun = new TextRun({ text: prefix, font: 'Times New Roman', size: 24 });
        const contentRuns = collectTextRuns(li);

        paragraphs.push(
          new Paragraph({
            children: [prefixRun, ...contentRuns],
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: 480, after: 80 },
            indent: { left: 720, hanging: 360 },
          })
        );
      });
      return;
    }

    // Recurse into any other container element
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) processNode(child as Element);
    });
  };

  dom.body.childNodes.forEach(child => {
    if (child.nodeType === Node.ELEMENT_NODE) processNode(child as Element);
  });

  return paragraphs;
};

// ─────────────────────────────────────────────────────────────────────────────
// DOCX Export  (fixed)
// ─────────────────────────────────────────────────────────────────────────────
export const exportToDocx = async (project: Project) => {

  // Title page paragraphs
  const titlePage: Paragraph[] = [
    new Paragraph({
      text: project.topic.toUpperCase(),
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 1000 },
    }),
    new Paragraph({ text: 'BY', alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: project.studentName.toUpperCase(), bold: true, size: 28 })],
    }),
    new Paragraph({ text: project.matricNumber, alignment: AlignmentType.CENTER, spacing: { after: 1000 } }),
    new Paragraph({
      text: `A RESEARCH PROJECT SUBMITTED TO THE DEPARTMENT OF ${project.department.toUpperCase()}, FACULTY OF ${project.faculty.toUpperCase()}, ${project.institutionName.toUpperCase()}`,
      alignment: AlignmentType.CENTER,
      spacing: { line: 480 },
    }),
    new Paragraph({
      text: `IN PARTIAL FULFILMENT OF THE REQUIREMENTS FOR THE AWARD OF THE DEGREE OF BACHELOR OF SCIENCE (B.Sc) IN ${project.department.toUpperCase()}`,
      alignment: AlignmentType.CENTER,
      spacing: { before: 1000, after: 1000 },
    }),
    new Paragraph({
      text: `SUPERVISOR: ${project.supervisorName.toUpperCase()}`,
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000 },
    }),
    new Paragraph({
      text: new Date().getFullYear().toString(),
      alignment: AlignmentType.CENTER,
      spacing: { before: 1000 },
    }),
  ];

  // One docx section per chapter — parse HTML ONCE, no more per-section duplication
  const chapterSections = project.outline.map(chapter => {
    const storedHtml = project.chapters[chapter.title]?.content || '';

    const contentParagraphs: Paragraph[] = storedHtml
      ? htmlToParagraphs(storedHtml)
      : [
          new Paragraph({
            children: [
              new TextRun({
                text: `[${chapter.title} — content not yet generated]`,
                font: 'Times New Roman',
                size: 24,
                italics: true,
                color: 'AAAAAA',
              }),
            ],
          }),
        ];

    return {
      properties: {},
      headers: project.settings?.showHeader
        ? {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: `${project.topic.substring(0, 50)}… | ${chapter.title}`,
                      size: 16,
                      color: '999999',
                    }),
                  ],
                }),
              ],
            }),
          }
        : undefined,
      footers: project.settings?.showPageNumbers
        ? {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun('Page '), new TextRun({ children: [PageNumber.CURRENT] })],
                }),
              ],
            }),
          }
        : undefined,
      children: contentParagraphs,
    };
  });

  const doc = new Document({ sections: [{ children: titlePage }, ...chapterSections] });
  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.topic.substring(0, 30)}_ProjectMate.docx`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF Export  (fixed)
// ─────────────────────────────────────────────────────────────────────────────
export const exportToPdf = async (project: Project) => {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 72;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  let currentPage = 1;

  const checkNewPage = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      addFooter();
      pdf.addPage();
      currentPage++;
      y = margin + 20;
    }
  };

  const addFooter = () => {
    if (!project.settings?.showPageNumbers) return;
    pdf.setFont('times', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text(String(currentPage), pageWidth / 2, pageHeight - 30, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  };

  const addHeader = (title: string) => {
    if (!project.settings?.showHeader) return;
    pdf.setFont('times', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`${project.topic.substring(0, 60)}… | ${title}`, pageWidth - margin, 30, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
  };

  // Title page — intentionally no page number footer (standard academic format)
  pdf.setFont('times', 'bold'); pdf.setFontSize(18);
  const titleLines = pdf.splitTextToSize(project.topic.toUpperCase(), contentWidth);
  pdf.text(titleLines, pageWidth / 2, 140, { align: 'center' });

  pdf.setFont('times', 'normal'); pdf.setFontSize(12);
  pdf.text('BY', pageWidth / 2, 220, { align: 'center' });
  pdf.setFont('times', 'bold'); pdf.setFontSize(14);
  pdf.text(project.studentName.toUpperCase(), pageWidth / 2, 245, { align: 'center' });
  pdf.setFont('times', 'normal'); pdf.setFontSize(12);
  pdf.text(project.matricNumber, pageWidth / 2, 265, { align: 'center' });

  const submissionText = `A RESEARCH PROJECT SUBMITTED TO THE DEPARTMENT OF ${project.department.toUpperCase()}, FACULTY OF ${project.faculty.toUpperCase()}, ${project.institutionName.toUpperCase()} IN PARTIAL FULFILMENT OF THE REQUIREMENTS FOR THE AWARD OF THE DEGREE OF BACHELOR OF SCIENCE (B.Sc) IN ${project.department.toUpperCase()}`;
  const subLines = pdf.splitTextToSize(submissionText, contentWidth - 80);
  pdf.text(subLines, pageWidth / 2, 360, { align: 'center' });

  pdf.setFont('times', 'bold');
  pdf.text(`SUPERVISOR: ${project.supervisorName.toUpperCase()}`, pageWidth / 2, 500, { align: 'center' });
  pdf.text(new Date().getFullYear().toString(), pageWidth / 2, 560, { align: 'center' });

  // Chapter pages — parse HTML once per chapter
  for (const chapter of project.outline) {
    addFooter();
    pdf.addPage();
    currentPage++;
    y = margin + 20;
    addHeader(chapter.title);

    const storedHtml = project.chapters[chapter.title]?.content || '';
    if (!storedHtml) {
      pdf.setFont('times', 'italic'); pdf.setFontSize(12);
      pdf.setTextColor(170, 170, 170);
      pdf.text(`[${chapter.title} — content not yet generated]`, margin, y);
      pdf.setTextColor(0, 0, 0);
      continue;
    }

    const dom = new DOMParser().parseFromString(storedHtml, 'text/html');

    /** Collect styled text segments from a DOM node for PDF rendering. */
    const collectPdfSegments = (rootNode: Node, initialStyles = { bold: false, italic: false }): { text: string; bold: boolean; italic: boolean }[] => {
      const segments: { text: string; bold: boolean; italic: boolean }[] = [];
      const walk = (node: Node, styles: { bold: boolean; italic: boolean }) => {
        node.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) {
            segments.push({ text: child.textContent || '', ...styles });
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child as Element;
            const childTag = el.tagName?.toLowerCase();
            const newStyles = { ...styles };
            if (childTag === 'b' || childTag === 'strong') newStyles.bold = true;
            if (childTag === 'i' || childTag === 'em') newStyles.italic = true;
            walk(child, newStyles);
          }
        });
      };
      walk(rootNode, initialStyles);
      return segments;
    };

    /** Render styled segments as word-wrapped PDF text at the current y position. */
    const renderPdfSegments = (segments: { text: string; bold: boolean; italic: boolean }[], startX: number, wrapX: number) => {
      const lineHeight = 24;
      let currentX = startX;
      for (const segment of segments) {
        const style = segment.bold && segment.italic ? 'bolditalic' : segment.bold ? 'bold' : segment.italic ? 'italic' : 'normal';
        pdf.setFont('times', style);
        const words = segment.text.split(/(\s+)/);
        for (const word of words) {
          if (!word) continue;
          const wordWidth = pdf.getStringUnitWidth(word) * 12 / pdf.internal.scaleFactor;
          if (currentX + wordWidth > pageWidth - margin) {
            y += lineHeight;
            checkNewPage(lineHeight);
            currentX = wrapX;
          }
          pdf.text(word, currentX, y);
          currentX += wordWidth;
        }
      }
      y += lineHeight;
    };

    const renderNode = (node: Element) => {
      const tag = node.tagName?.toLowerCase();

      if (tag === 'div' && node.getAttribute('data-page-break') !== null) {
        addFooter();
        pdf.addPage(); currentPage++; y = margin + 20;
        addHeader(chapter.title);
        return;
      }

      if (tag === 'h1') {
        checkNewPage(40);
        pdf.setFont('times', 'bold'); pdf.setFontSize(16);
        const lines = pdf.splitTextToSize((node.textContent || '').toUpperCase(), contentWidth);
        pdf.text(lines, pageWidth / 2, y, { align: 'center' });
        y += lines.length * 22 + 16;
        return;
      }

      if (tag === 'h2') {
        checkNewPage(36);
        y += 12;
        pdf.setFont('times', 'bold'); pdf.setFontSize(13);
        const lines = pdf.splitTextToSize((node.textContent || '').toUpperCase(), contentWidth);
        pdf.text(lines, margin, y);
        y += lines.length * 18 + 8;
        return;
      }

      if (tag === 'h3') {
        checkNewPage(28);
        y += 8;
        pdf.setFont('times', 'bold'); pdf.setFontSize(12);
        const lines = pdf.splitTextToSize(node.textContent || '', contentWidth);
        pdf.text(lines, margin, y);
        y += lines.length * 16 + 6;
        return;
      }

      if (tag === 'p') {
        const segments = collectPdfSegments(node);
        if (segments.every(s => !s.text.trim())) return;

        const lineHeight = 24;
        const indent = 36;
        pdf.setFontSize(12);
        checkNewPage(lineHeight);
        renderPdfSegments(segments, margin + indent, margin);
        return;
      }

      if (tag === 'ul' || tag === 'ol') {
        // Direct children only to avoid flattening nested lists (Fix #14)
        const directLis = Array.from(node.children).filter(
          child => child.tagName?.toLowerCase() === 'li'
        );
        directLis.forEach((li, idx) => {
          const prefix = tag === 'ol' ? `${idx + 1}. ` : '\u2022  ';
          const segments = collectPdfSegments(li);
          if (segments.every(s => !s.text.trim())) return;

          const lineHeight = 24;
          const textIndent = 36;
          pdf.setFontSize(12);
          checkNewPage(lineHeight);
          pdf.setFont('times', 'normal');
          pdf.text(prefix, margin, y);
          renderPdfSegments(segments, margin + textIndent, margin + textIndent);
        });
        return;
      }

      node.childNodes.forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) renderNode(child as Element);
      });
    };

    dom.body.childNodes.forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE) renderNode(child as Element);
    });
  }

  addFooter();
  pdf.save(`${project.topic.substring(0, 30)}_ProjectMate.pdf`);
};
