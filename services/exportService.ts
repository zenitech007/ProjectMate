
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, PageNumber, Header, Footer } from 'docx';
import { jsPDF } from 'jspdf';
import { Project } from '../types';

export const exportToDocx = async (project: Project) => {
  // Create Title Page
  const titlePage = [
    new Paragraph({
      text: project.topic.toUpperCase(),
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 1000 },
    }),
    new Paragraph({
      text: "BY",
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: project.studentName.toUpperCase(),
          bold: true,
          size: 28,
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      text: project.matricNumber,
      alignment: AlignmentType.CENTER,
      spacing: { after: 1000 },
    }),
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

  const sections = project.outline.map((chapter) => {
    const chapterContent: Paragraph[] = [
      new Paragraph({
        text: chapter.title.toUpperCase(),
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400, before: 400 },
      })
    ];

    chapter.sections.forEach(sectionTitle => {
      const sectionText = project.content[chapter.title] || ''; // Improved content lookup
      // Note: In current app structure, content is stored by chapterTitle
      
      chapterContent.push(new Paragraph({
        children: [
          new TextRun({
            text: sectionTitle.toUpperCase(),
            bold: true,
            font: "Times New Roman",
            size: 24,
          })
        ],
        spacing: { before: 240, after: 120 },
      }));

      // Find if we have text specifically for this section or just general chapter text
      // For simplicity in this export, we split chapter content
      const lines = sectionText.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        chapterContent.push(new Paragraph({
          children: [
            new TextRun({
              text: line,
              font: "Times New Roman",
              size: 24,
            })
          ],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 480 },
          indent: { firstLine: 720 },
        }));
      });
    });

    return {
      properties: {},
      headers: project.settings.showHeader ? {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: `${project.topic.substring(0, 50)}... | ${chapter.title}`,
                  size: 16,
                  color: "999999",
                }),
              ],
            }),
          ],
        }),
      } : undefined,
      children: chapterContent,
      footers: project.settings?.showPageNumbers ? {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun("Page "),
                new TextRun({
                  children: [PageNumber.CURRENT],
                }),
              ],
            }),
          ],
        }),
      } : undefined
    };
  });

  const doc = new Document({
    sections: [
      {
        children: titlePage,
      },
      ...sections
    ]
  });

  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.topic.substring(0, 30)}_ProjectMate.docx`;
  a.click();
  window.URL.revokeObjectURL(url);
};

export const exportToPdf = async (project: Project) => {
  const doc = new jsPDF();
  let y = 20;
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  const addFooter = (pageNum: number) => {
    if (project.settings?.showPageNumbers) {
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      doc.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 10, { align: "center" });
    }
  };

  const addHeader = (chapterTitle: string) => {
    if (project.settings?.showHeader) {
      doc.setFont("times", "italic");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`${project.topic.substring(0, 60)}... | ${chapterTitle}`, pageWidth - margin, 10, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }
  };

  // TITLE PAGE
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(project.topic.toUpperCase(), pageWidth - (margin * 2));
  doc.text(titleLines, pageWidth / 2, 60, { align: "center" });
  
  doc.setFontSize(12);
  doc.text("BY", pageWidth / 2, 100, { align: "center" });
  
  doc.setFontSize(14);
  doc.text(project.studentName.toUpperCase(), pageWidth / 2, 110, { align: "center" });
  doc.text(project.matricNumber, pageWidth / 2, 120, { align: "center" });
  
  doc.setFontSize(11);
  const submissionLines = doc.splitTextToSize(
    `A RESEARCH PROJECT SUBMITTED TO THE DEPARTMENT OF ${project.department.toUpperCase()}, FACULTY OF ${project.faculty.toUpperCase()}, ${project.institutionName.toUpperCase()} IN PARTIAL FULFILMENT OF THE REQUIREMENTS FOR THE AWARD OF THE DEGREE OF BACHELOR OF SCIENCE (B.Sc) IN ${project.department.toUpperCase()}`,
    pageWidth - (margin * 4)
  );
  doc.text(submissionLines, pageWidth / 2, 160, { align: "center" });
  
  doc.text(`SUPERVISOR: ${project.supervisorName.toUpperCase()}`, pageWidth / 2, 220, { align: "center" });
  doc.text(new Date().getFullYear().toString(), pageWidth / 2, 260, { align: "center" });

  let currentPage = 1;

  project.outline.forEach((chapter) => {
    addFooter(currentPage);
    doc.addPage();
    currentPage++;
    y = 20;
    addHeader(chapter.title);

    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.text(chapter.title.toUpperCase(), margin, y);
    y += 10;
    
    // In current implementation, content is mapped by chapter title
    const chapterText = project.content[chapter.title] || '';
    
    doc.setFont("times", "normal");
    const lines = doc.splitTextToSize(chapterText, pageWidth - (margin * 2));
    lines.forEach((line: string) => {
      if (y > 280) { 
        addFooter(currentPage);
        doc.addPage(); 
        y = 20; 
        currentPage++;
        addHeader(chapter.title);
      }
      doc.text(line, margin, y);
      y += 7;
    });
  });

  addFooter(currentPage);
  doc.save(`${project.topic.substring(0, 30)}_ProjectMate.pdf`);
};
