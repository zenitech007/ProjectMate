import React, { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, Node, mergeAttributes, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { Extension, Mark } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import {
  Bold, Italic, Underline as UIcon,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo2, Redo2,
  FileText, FileDown, Bot, Loader2, X
} from 'lucide-react'

// ─── Layout constants (A4 at 96dpi) ────────────────────────────────────────
const A4_WIDTH = 794           // 210mm
const MARGIN = 96              // 1 inch
const LINE_HEIGHT = 32         // double-spaced body line
const A4_HEIGHT = 1123         // 297mm at 96dpi
const PAGE_GAP = 48            // visual gap between pages
const A4_CYCLE = A4_HEIGHT + PAGE_GAP

// ─── TipTap PageBreak node ──────────────────────────────────────────────────
const PageBreakView = (props: any) => {
  const [height, setHeight] = useState(PAGE_GAP)
  const nodeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = nodeRef.current
    if (!el) return

    const update = () => {
      const editorEl = el.closest('.ProseMirror')
      if (!editorEl) return
      
      const editorRect = editorEl.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      
      const offsetTop = elRect.top - editorRect.top
      
      let remainder = A4_CYCLE - (offsetTop % A4_CYCLE)
      if (remainder < PAGE_GAP) {
        remainder += A4_CYCLE
      }
      
      setHeight(prev => Math.abs(prev - remainder) > 1 ? remainder : prev)
    }

    update()
    
    const editorEl = el.closest('.ProseMirror')
    let observer: ResizeObserver | null = null
    if (editorEl) {
      observer = new ResizeObserver(update)
      observer.observe(editorEl)
      observer.observe(el)
    }
    
    const interval = setInterval(update, 500)
    return () => {
      clearInterval(interval)
      if (observer) observer.disconnect()
    }
  }, [])

  return (
    <NodeViewWrapper>
      <div ref={nodeRef} className="pm-page-break-container" style={{ height: `${height}px` }}>
        <div style={{ height: `${height - PAGE_GAP}px` }} />
        <div className="pm-page-break-gap"><span>PAGE BREAK</span></div>
      </div>
    </NodeViewWrapper>
  )
}

const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,  // not editable internally

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },

  renderHTML() {
    return ['div', { 'data-page-break': '', class: 'pm-page-break' }]
  },

  addKeyboardShortcuts() {
    return {
      // Ctrl+Enter inserts a page break
      'Mod-Enter': () => this.editor.commands.insertContent({ type: 'pageBreak' }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBreakView)
  }
})

// ─── Allow inline style attribute on paragraph/heading ─────────────────────
const AllowStyle = Extension.create({
  name: 'allowStyle',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        style: {
          default: null,
          parseHTML: el => el.getAttribute('style'),
          renderHTML: attrs => attrs.style ? { style: attrs.style } : {},
        },
      },
    }]
  },
})

interface Props {
  value: string
  onChange: (val: string) => void
  generating?: boolean
  saveStatus?: 'saved' | 'saving' | 'unsaved'
  activeChapter?: string
  onExportDocx?: (currentHtml: string) => void
  onExportPdf?: (currentHtml: string) => void
  onOpenCopilot?: () => void
  onCancelGeneration?: () => void
}

export default function WordEditor({
  value,
  onChange,
  generating = false,
  saveStatus = 'saved',
  activeChapter,
  onExportDocx,
  onExportPdf,
  onOpenCopilot,
  onCancelGeneration,
}: Props) {

  const [visiblePages, setVisiblePages] = useState(1)
  const editorWrapRef = useRef<HTMLDivElement>(null)
  const prevValueRef = useRef<string>('')

  const editor = useEditor({
    extensions: [
      StarterKit,
      PageBreak,
      AllowStyle,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: value,
    editable: !generating,
    onUpdate({ editor }) {
      const MAX_PAGE_HEIGHT = A4_HEIGHT - MARGIN * 2
      const MAX_TOTAL_HEIGHT = visiblePages * MAX_PAGE_HEIGHT

      if (editorWrapRef.current && editorWrapRef.current.scrollHeight > MAX_TOTAL_HEIGHT) {
        editor.chain().focus().insertContent({ type: 'pageBreak' }).run()
      }

      const html = editor.getHTML()
      prevValueRef.current = html
      onChange(html)
    },
  })

  // Sync external value changes (AI streaming) into the editor
  useEffect(() => {
    if (!editor || !value) return
    // Only update if value actually changed (avoids cursor jumps on user edits)
    if (value === prevValueRef.current) return
    prevValueRef.current = value
    // Preserve cursor position by using insertContent only when streaming
    if (generating) {
      editor.commands.setContent(value, { emitUpdate: false })
    } else {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [value, editor])

  // Update editable state when generating changes
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!generating)
  }, [generating, editor])

  // Pagination: measure content height and grow page count
  useEffect(() => {
    if (!editorWrapRef.current) return
    const observer = new ResizeObserver(() => {
      const contentH = editorWrapRef.current!.scrollHeight
      const needed = Math.max(1, Math.ceil(contentH / A4_CYCLE))
      setVisiblePages(p => Math.max(p, needed))
    })
    observer.observe(editorWrapRef.current)
    return () => observer.disconnect()
  }, [])

  if (!editor) return null

  const totalDocHeight = visiblePages * A4_CYCLE

  function getVisibleHTML() {
    const container = editorWrapRef.current
    if (!container) return ''

    const pages = Array.from(container.children)

    return pages.map((page: any) => {
      return page.innerHTML
    }).join('')
  }

  return (
    <div className="h-full flex flex-col bg-[#e8e8e8] select-none">

      {/* ══════════════════ TOOLBAR ══════════════════ */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-1 sticky top-0 z-50 shadow-sm flex-wrap">

        {/* Undo / Redo */}
        <TBtn onClick={() => editor.chain().focus().undo().run()} title="Undo (Ctrl+Z)">
          <Undo2 className="w-4 h-4" />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} title="Redo (Ctrl+Y)">
          <Redo2 className="w-4 h-4" />
        </TBtn>

        <Sep />

        {/* Style selector */}
        <select
          className="h-8 px-2 border border-slate-200 rounded text-xs text-slate-600 bg-white cursor-pointer"
          value={
            editor.isActive('heading', { level: 1 }) ? 'h1' :
            editor.isActive('heading', { level: 2 }) ? 'h2' :
            editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
          }
          onChange={e => {
            const v = e.target.value
            if (v === 'h1') editor.chain().focus().setHeading({ level: 1 }).run()
            else if (v === 'h2') editor.chain().focus().setHeading({ level: 2 }).run()
            else if (v === 'h3') editor.chain().focus().setHeading({ level: 3 }).run()
            else editor.chain().focus().setParagraph().run()
          }}
        >
          <option value="p">Normal</option>
          <option value="h1">Chapter Title</option>
          <option value="h2">Section</option>
          <option value="h3">Sub-section</option>
        </select>

        <Sep />

        {/* B / I / U */}
        <TBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold (Ctrl+B)"
        ><Bold className="w-4 h-4" /></TBtn>
        <TBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic (Ctrl+I)"
        ><Italic className="w-4 h-4" /></TBtn>
        <TBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline (Ctrl+U)"
        ><UIcon className="w-4 h-4" /></TBtn>

        <Sep />

        {/* Alignment */}
        <TBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align left">
          <AlignLeft className="w-4 h-4" />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Center">
          <AlignCenter className="w-4 h-4" />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align right">
          <AlignRight className="w-4 h-4" />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify">
          <AlignJustify className="w-4 h-4" />
        </TBtn>

        <Sep />

        {/* Lists */}
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <ListOrdered className="w-4 h-4" />
        </TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <List className="w-4 h-4" />
        </TBtn>

        <Sep />

        {/* Page break button */}
        <button
          onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()}
          title="Insert page break (Ctrl+Enter)"
          className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 border border-slate-200 rounded hover:bg-slate-100 transition-colors"
        >
          ⏎ Page Break
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Save status */}
        <span className={`text-[10px] font-bold uppercase tracking-widest mr-3 ${
          saveStatus === 'saved' ? 'text-green-600' :
          saveStatus === 'saving' ? 'text-slate-400' : 'text-amber-500'
        }`}>
          {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? '…' : '● Unsaved'}
        </span>

        {/* AI Copilot */}
        {onOpenCopilot && (
          <TBtn onClick={onOpenCopilot} title="AI Draft">
            <Bot className="w-4 h-4 text-[#1a4731]" />
          </TBtn>
        )}

        <Sep />

        {/* Export */}
        {onExportDocx && (
          <button
            onClick={() => onExportDocx(getVisibleHTML())}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-black hover:bg-blue-100 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> Word
          </button>
        )}
        {onExportPdf && (
          <button
            onClick={() => onExportPdf(getVisibleHTML())}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-[11px] font-black hover:bg-red-100 transition-colors"
          >
            <FileDown className="w-3.5 h-3.5" /> PDF
          </button>
        )}
      </div>

      {/* ══════════════════ GENERATING BAR ══════════════════ */}
      {generating && (
        <div className="bg-[#1a4731] px-5 py-2.5 flex items-center justify-between z-40 shrink-0">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-green-300" />
            <span className="text-[11px] font-black uppercase tracking-widest text-green-200">
              AI is writing…
            </span>
          </div>
          {onCancelGeneration && (
            <button
              onClick={onCancelGeneration}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white px-3 py-1 rounded-lg transition-all border border-red-500/30"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
          )}
        </div>
      )}

      {/* ══════════════════ A4 DOCUMENT ══════════════════ */}
      <div className="flex-1 overflow-y-auto py-8 px-4">

        {/* Chapter label */}
        {activeChapter && (
          <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4 select-none">
            {activeChapter}
          </p>
        )}

        {/* The A4 paper */}
        <div
          className="relative mx-auto shadow-[0_4px_40px_rgba(0,0,0,0.15)] select-text"
          style={{ width: A4_WIDTH, minHeight: totalDocHeight, backgroundColor: 'transparent' }}
        >
          {/* Background continuous pages layer */}
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden rounded">
            {Array.from({ length: visiblePages }).map((_, i) => (
              <React.Fragment key={i}>
                <div 
                  className="absolute left-0 right-0 bg-white" 
                  style={{ top: i * A4_CYCLE, height: A4_HEIGHT }} 
                />
                <div 
                  className="absolute left-0 right-0 bg-[#e8e8e8] border-t border-b border-[#c0c0c0] shadow-[inset_0_4px_8px_rgba(0,0,0,0.06),inset_0_-4px_8px_rgba(0,0,0,0.06)]"
                  style={{ top: i * A4_CYCLE + A4_HEIGHT, height: PAGE_GAP }}
                />
              </React.Fragment>
            ))}
          </div>

          {/* Editor content */}
          <div
            ref={editorWrapRef}
            className="relative z-10"
            style={{ minHeight: totalDocHeight }}
          >
            {Array.from({ length: visiblePages }).map((_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: i * A4_CYCLE,
                  left: 0,
                  right: 0,
                  height: A4_HEIGHT,
                  overflow: 'hidden',   // 🔥 THIS IS THE KEY
                  padding: MARGIN,
                }}
              >
                {i === 0 && <EditorContent editor={editor} />}
              </div>
            ))}
          </div>
        </div>

        <div className="h-16" />
      </div>

      {/* ══════════════════ PROSEMIRROR STYLES ══════════════════ */}
      <style>{`
        .ProseMirror {
          outline: none;
          font-family: "Times New Roman", Times, serif;
          font-size: 16px;
          line-height: ${LINE_HEIGHT}px;
          color: #111;
          min-height: ${A4_HEIGHT - MARGIN * 2}px;
        }

        /* Body paragraphs */
        .ProseMirror p {
          font-family: "Times New Roman", Times, serif;
          font-size: 16px;
          line-height: ${LINE_HEIGHT}px;
          text-align: justify;
          text-indent: 0.5in;
          margin: 0 0 0 0;
          min-height: ${LINE_HEIGHT}px;
        }

        /* Chapter title (h1) */
        .ProseMirror h1 {
          font-family: "Times New Roman", Times, serif;
          font-size: 18px;
          font-weight: bold;
          text-align: center;
          text-transform: uppercase;
          text-indent: 0;
          margin: ${LINE_HEIGHT}px 0;
          line-height: ${LINE_HEIGHT}px;
        }

        /* Section heading (h2) */
        .ProseMirror h2 {
          font-family: "Times New Roman", Times, serif;
          font-size: 16px;
          font-weight: bold;
          text-align: left;
          text-transform: uppercase;
          text-indent: 0;
          margin: ${LINE_HEIGHT / 2}px 0 0;
          line-height: ${LINE_HEIGHT}px;
        }

        /* Sub-section (h3) */
        .ProseMirror h3 {
          font-family: "Times New Roman", Times, serif;
          font-size: 16px;
          font-weight: bold;
          text-align: left;
          text-indent: 0;
          margin: ${LINE_HEIGHT / 2}px 0 0;
          line-height: ${LINE_HEIGHT}px;
        }

        /* Lists */
        .ProseMirror ul, .ProseMirror ol {
          padding-left: 0.5in;
          margin: 0;
        }
        .ProseMirror li {
          line-height: ${LINE_HEIGHT}px;
          min-height: ${LINE_HEIGHT}px;
        }
        .ProseMirror li p {
          text-indent: 0;
          margin: 0;
        }

        .pm-page-break {
          page-break-after: always;
        }

        /* Page break node dynamically aligned to A4 boundary */
        .pm-page-break-container {
          display: block;
          position: relative;
          user-select: none;
          pointer-events: none;
          break-after: page;
        }
        .pm-page-break-gap {
          display: flex;
          align-items: center;
          justify-content: center;
          width: calc(100% + ${MARGIN * 2}px);
          margin-left: -${MARGIN}px;
          height: ${PAGE_GAP}px;
          background: #e8e8e8;
          box-shadow: inset 0 4px 8px rgba(0,0,0,0.06), inset 0 -4px 8px rgba(0,0,0,0.06);
          border-top: 1px solid #c0c0c0;
          border-bottom: 1px solid #c0c0c0;
        }
        .pm-page-break-gap span {
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #b0b8c8;
          background: #e8e8e8;
          padding: 4px 16px;
          border-radius: 20px;
          border: 1px solid #d0d8e8;
        }

        /* Placeholder */
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
          font-style: italic;
        }

        @media print {
          .pm-page-break-container {
            page-break-after: always;
          }

          .ProseMirror {
            width: 794px;
          }
        }
      `}</style>
    </div>
  )
}

// ── Tiny reusable toolbar button ─────────────────────────────────────────────
const TBtn: React.FC<{
  onClick: () => void
  active?: boolean
  title?: string
  children: React.ReactNode
}> = ({ onClick, active, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-1.5 rounded transition-colors ${
      active ? 'bg-green-100 text-green-700' : 'text-slate-600 hover:bg-slate-100'
    }`}
  >
    {children}
  </button>
)

const Sep = () => <div className="w-px h-5 bg-slate-200 mx-1 shrink-0" />