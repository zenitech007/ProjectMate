import React, { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import {
  Bold, Italic, Underline as UIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link as LinkIcon,
  Undo2, Redo2, FileText, FileDown, Bot
} from 'lucide-react'

const LINE_HEIGHT = 32
const LINES_PER_PAGE = 29
const CONTENT_HEIGHT = LINE_HEIGHT * LINES_PER_PAGE // 928
const A4_WIDTH = 794
const MARGIN = 96

// ✅ Custom extension to allow inline styles (like page breaks)
const PageBreakStyle = Extension.create({
  name: 'pageBreakStyle',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          style: {
            default: null,
            parseHTML: element => element.getAttribute('style'),
            renderHTML: attributes => {
              if (!attributes.style) return {}
              return { style: attributes.style }
            },
          },
        },
      },
    ]
  },
})

// ✅ Custom extension for Track Changes
const TrackChange = Mark.create({
  name: 'trackChange',

  addAttributes() {
    return {
      type: { default: 'insert' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-track]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const isDelete = HTMLAttributes.type === 'delete'
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-track': '',
        style: `
          background:${isDelete ? '#f8d7da' : '#d1e7dd'};
          text-decoration:${isDelete ? 'line-through' : 'none'};
        `,
      }),
      0,
    ]
  },
})

interface Props {
  value: string
  onChange: (val: string) => void
  onExportDocx?: () => void
  onExportPdf?: () => void
  onOpenCopilot?: () => void
}

export default function WordEditor({
  value,
  onChange,
  onExportDocx,
  onExportPdf,
  onOpenCopilot
}: Props) {

  const [visiblePages, setVisiblePages] = useState(1)
  const [trackMode, setTrackMode] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  // ✅ TipTap Editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      PageBreakStyle,
      TrackChange,
      Underline,
      Link,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: value,
    onUpdate({ editor }) {
      let html = editor.getHTML()

      // ✅ FIX: Remove duplicate "Topic"
      html = html.replace(/(Topic:.*?)(\1)/gi, '$1')

      if (trackMode) {
        editor.commands.setMark('trackChange', { type: 'insert' })
      }

      onChange(html)
    },
  })

  // ✅ Pagination engine (REAL)
  useEffect(() => {
    if (!editorRef.current) return

    const observer = new ResizeObserver(() => {
      // scrollHeight includes the top and bottom padding (MARGIN * 2)
      const actualContentHeight = editorRef.current!.scrollHeight - (MARGIN * 2)

      const requiredPages = Math.max(1, Math.ceil(actualContentHeight / CONTENT_HEIGHT))

      // ONLY increase pages when needed (progressive reveal)
      setVisiblePages((prev) => {
        if (requiredPages > prev) return requiredPages
        return prev
      })
    })

    observer.observe(editorRef.current)

    return () => observer.disconnect()
  }, [])

  if (!editor) return null

  return (
    <div className="h-full flex flex-col bg-[#e8e8e8]">

      {/* ================= TOOLBAR ================= */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2 sticky top-0 z-50 flex-wrap">

        {/* Undo/Redo */}
        <button onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="w-4 h-4" />
        </button>

        {/* Font + Style */}
        <div className="flex items-center gap-2 border-l pl-2">
          <select className="h-8 px-2 border rounded">
            <option>Times New Roman</option>
          </select>

          <select
            className="h-8 px-2 border rounded"
            onChange={(e) => {
              const val = e.target.value
              if (val === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run()
              else if (val === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run()
              else editor.chain().focus().setParagraph().run()
            }}
          >
            <option value="p">Normal</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
          </select>
        </div>

        {/* Formatting */}
        <button onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </button>

        <button onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-4 h-4" />
        </button>

        <button onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UIcon className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            setTrackMode(!trackMode)
            if (!trackMode) editor.chain().focus().setMark('trackChange', { type: 'insert' }).run()
            else editor.chain().focus().unsetMark('trackChange').run()
          }}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors ${trackMode ? 'bg-green-100 text-green-700' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          Track
        </button>

        {/* Alignment */}
        <button onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight className="w-4 h-4" />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
          <AlignJustify className="w-4 h-4" />
        </button>

        {/* Lists */}
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="w-4 h-4" />
        </button>

        <button onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="w-4 h-4" />
        </button>

        {/* Link */}
        <button onClick={() => {
          const url = prompt('Enter URL')
          if (url) editor.chain().focus().setLink({ href: url }).run()
        }}>
          <LinkIcon className="w-4 h-4" />
        </button>

        <div className="flex-1" />

        {/* ✅ Modern Export Buttons */}
        <div className="flex gap-2">
          {onExportDocx && (
            <button
              onClick={onExportDocx}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border rounded-xl shadow hover:shadow-md"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              Word
            </button>
          )}

          {onExportPdf && (
            <button
              onClick={onExportPdf}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border rounded-xl shadow hover:shadow-md"
            >
              <FileDown className="w-4 h-4 text-red-500" />
              PDF
            </button>
          )}
        </div>
      </div>

      {/* ================= DOCUMENT ================= */}
      <div className="flex-1 overflow-y-auto py-10">

        <div 
          className="relative mx-auto bg-white shadow-2xl transition-all duration-300"
          style={{ 
            width: A4_WIDTH, 
            minHeight: (MARGIN * 2) + (visiblePages * CONTENT_HEIGHT) 
          }}
        >

          {/* Page Break Lines */}
          {Array.from({ length: Math.max(0, visiblePages - 1) }).map((_, i) => {
            const breakPosition = MARGIN + ((i + 1) * CONTENT_HEIGHT)
            return (
              <div
                key={i}
                className="absolute left-0 right-0 border-b border-dashed border-slate-300 pointer-events-none flex items-center"
                style={{ top: breakPosition }}
              >
                <span className="absolute right-10 text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-white px-2 translate-y-[-50%]">
                  Page Break
                </span>
              </div>
            )
          })}

          {/* Editor Layer */}
          <div
            ref={editorRef}
            className="relative z-10"
            style={{
              paddingTop: MARGIN,
              paddingBottom: MARGIN,
              paddingLeft: MARGIN,
              paddingRight: MARGIN,
              minHeight: (MARGIN * 2) + (visiblePages * CONTENT_HEIGHT),
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* ================= FLOATING AI BUTTON ================= */}
      {onOpenCopilot && (
        <button
          onClick={onOpenCopilot}
          className="fixed bottom-6 right-6 bg-[#1a4731] text-white p-4 rounded-full shadow-xl hover:bg-green-800"
        >
          <Bot className="w-5 h-5" />
        </button>
      )}

      {/* ================= STYLES ================= */}
      <style>{`
        .ProseMirror {
          outline: none;
          max-width: 602px;
          margin: 0 auto;
          font-family: "Times New Roman";
          font-size: 16px;
          line-height: 32px;
        }

        .ProseMirror p {
          text-align: justify;
          text-indent: 0.5in;
          margin: 0;
          min-height: 32px;
        }

        .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 {
          text-align: center;
          text-transform: uppercase;
          margin: 32px 0;
          line-height: 32px;
          padding: 0;
        }

        .ProseMirror ul, .ProseMirror ol {
          margin: 0;
          padding: 0 0 0 0.5in;
        }

        .ProseMirror li {
          margin: 0;
          line-height: 32px;
          min-height: 32px;
        }

        .ProseMirror p[style*="page-break-before"] {
          text-indent: 0;
          text-align: center;
          position: relative;
        }
        .ProseMirror p[style*="page-break-before"]::before {
          content: "---------------------- Page Break (Export) ----------------------";
          color: #94a3b8;
          font-family: monospace;
          font-size: 12px;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}