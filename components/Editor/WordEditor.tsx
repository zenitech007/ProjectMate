
import React from 'react';
import ReactQuill from 'react-quill';
import { 
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link, Image, Undo2, Redo2, FileType, 
  ChevronDown, Type, Scissors, Copy, Clipboard
} from 'lucide-react';

interface WordEditorProps {
  value: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
}

const WordEditor = React.forwardRef<ReactQuill, WordEditorProps>(({ value, onChange, readOnly }, ref) => {
  const modules = {
    toolbar: {
      container: "#ribbon-container",
    },
    history: {
      delay: 1000,
      maxStack: 100,
      userOnly: true
    }
  };

  const formats = [
    'header', 'font', 'size', 'bold', 'italic', 'underline',
    'list', 'bullet', 'align', 'link', 'image'
  ];

  // Visual Page Break markers (approx A4 height)
  const pageMarkers = Array.from({ length: 15 }, (_, i) => (i + 1) * 1123);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-100">
      {/* MS WORD STYLE RIBBON (TOOLBAR) */}
      <div id="ribbon-container" className="bg-white border-b border-slate-200 px-6 py-2 flex items-center space-x-8 shadow-sm z-30 sticky top-0">
        
        {/* History Group */}
        <div className="flex items-center space-x-1 border-r border-slate-200 pr-4">
          <button className="ql-undo p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors">
            <Undo2 className="h-4 w-4" />
          </button>
          <button className="ql-redo p-1.5 hover:bg-slate-100 rounded text-slate-600 transition-colors">
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        {/* Font Group */}
        <div className="flex items-center space-x-2 border-r border-slate-200 pr-4">
          <select className="ql-font border-none bg-slate-50 px-2 py-1 rounded text-xs font-bold text-slate-600 outline-none cursor-pointer">
            <option value="serif" selected>Times New Roman</option>
            <option value="sans-serif">Sans Serif</option>
            <option value="monospace">Monospace</option>
          </select>
          <select className="ql-header border-none bg-slate-50 px-2 py-1 rounded text-xs font-bold text-slate-600 outline-none cursor-pointer">
            <option value="3">Header</option>
            <option value="">Normal</option>
          </select>
        </div>

        {/* Text Group */}
        <div className="flex items-center space-x-1 border-r border-slate-200 pr-4">
          <button className="ql-bold p-1.5 hover:bg-slate-100 rounded text-slate-600">
            <Bold className="h-4 w-4" />
          </button>
          <button className="ql-italic p-1.5 hover:bg-slate-100 rounded text-slate-600">
            <Italic className="h-4 w-4" />
          </button>
          <button className="ql-underline p-1.5 hover:bg-slate-100 rounded text-slate-600">
            <Underline className="h-4 w-4" />
          </button>
        </div>

        {/* Paragraph Group */}
        <div className="flex items-center space-x-1 border-r border-slate-200 pr-4">
          <button className="ql-align p-1.5 hover:bg-slate-100 rounded text-slate-600" value="">
            <AlignLeft className="h-4 w-4" />
          </button>
          <button className="ql-align p-1.5 hover:bg-slate-100 rounded text-slate-600" value="center">
            <AlignCenter className="h-4 w-4" />
          </button>
          <button className="ql-align p-1.5 hover:bg-slate-100 rounded text-slate-600" value="justify">
            <AlignJustify className="h-4 w-4" />
          </button>
          <button className="ql-list p-1.5 hover:bg-slate-100 rounded text-slate-600" value="ordered">
            <ListOrdered className="h-4 w-4" />
          </button>
          <button className="ql-list p-1.5 hover:bg-slate-100 rounded text-slate-600" value="bullet">
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* Insert Group */}
        <div className="flex items-center space-x-1">
          <button className="ql-link p-1.5 hover:bg-slate-100 rounded text-slate-600">
            <Link className="h-4 w-4" />
          </button>
          <button className="ql-image p-1.5 hover:bg-slate-100 rounded text-slate-600">
            <Image className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* DOCUMENT WORKSPACE */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-12 bg-slate-100">
        <div className="max-w-fit mx-auto relative group">
          {/* THE PAPER */}
          <div 
            className="bg-white shadow-2xl relative transition-all"
            style={{ 
              width: '210mm', 
              minHeight: '297mm',
              padding: '2.54cm', // 1-inch margins
              boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)'
            }}
          >
            {/* Visual Page Break Lines */}
            {pageMarkers.map((pos) => (
              <div key={pos} className="page-break-marker" style={{ top: `${pos}px` }} />
            ))}

            <ReactQuill
              ref={ref}
              theme="snow"
              value={value}
              onChange={onChange}
              modules={modules}
              formats={formats}
              readOnly={readOnly}
              className="h-full academic-editor"
              placeholder="Start drafting your research manuscript..."
            />
          </div>
        </div>
      </div>
    </div>
  );
});

WordEditor.displayName = 'WordEditor';

export default WordEditor;
