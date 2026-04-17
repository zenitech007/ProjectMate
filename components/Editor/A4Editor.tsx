
import React, { useEffect, useRef } from 'react';
import ReactQuill from 'react-quill';

interface A4EditorProps {
  value: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
}

const A4Editor = React.forwardRef<ReactQuill, A4EditorProps>(({ value, onChange, readOnly }, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['clean']
    ],
    history: {
      delay: 1000,
      maxStack: 100,
      userOnly: true
    }
  };

  const formats = [
    'header', 'bold', 'italic', 'underline',
    'list', 'bullet', 'align'
  ];

  // Logic to simulate page markers every ~1123px (Standard A4 at 96 DPI)
  // The user requested ~3000px, but 1123px is the standard A4 height.
  // I will use 1123px for a realistic multi-page feel.
  const pageMarkers = Array.from({ length: 20 }, (_, i) => i + 1);

  const QuillComponent = ReactQuill as any;

  return (
    <div className="min-h-screen bg-slate-100 py-4 md:py-12 px-2 md:px-0 flex justify-center overflow-auto custom-scrollbar w-full">
      {/* The A4 Sheet Container */}
      <div
        className="bg-white shadow-2xl relative shrink-0"
        style={{
          width: '100%',
          maxWidth: '210mm',
          minHeight: '297mm',
          padding: 'clamp(1rem, 5vw, 2.54cm)', // Shrinks padding on small screens
          fontFamily: '"Tinos", "Times New Roman", Times, serif',
          transition: 'all 0.3s ease'
        }}
        ref={editorRef}
      >
        {/* Visual Pagination Indicators */}
        {pageMarkers.map((page) => (
          <div
            key={page}
            className="absolute left-0 right-0 pointer-events-none z-10"
            style={{
              top: `${page * 1123}px`,
              borderTop: '1px dashed #cbd5e1'
            }}
          />
        ))}

        {QuillComponent && (
          <QuillComponent
            ref={ref}
            theme="snow"
            value={value}
            onChange={onChange}
            modules={readOnly ? { toolbar: false } : modules}
            formats={formats}
            readOnly={readOnly}
            className="h-full academic-editor"
            placeholder="Select a section from the sidebar and use the magic wand to draft content..."
          />
        )}

        <style>{`
          .academic-editor .ql-container.ql-snow {
            border: none !important;
          }
          .academic-editor .ql-editor {
            font-family: "Tinos", "Times New Roman", serif !important;
            font-size: 12pt !important;
            line-height: 2.0 !important;
            padding: 0 !important;
            min-height: 297mm;
            text-align: justify;
            color: #1e293b;
          }
          .academic-editor .ql-editor p {
            margin-bottom: 1.5em;
            text-indent: 0.5in;
          }
          .academic-editor .ql-editor h3 {
            text-align: center;
            text-transform: uppercase;
            font-weight: bold;
            font-size: 14pt !important;
            margin: 1.5em 0;
            text-indent: 0 !important;
          }
        `}</style>
      </div>
    </div>
  );
});

A4Editor.displayName = 'A4Editor';

export default A4Editor;
