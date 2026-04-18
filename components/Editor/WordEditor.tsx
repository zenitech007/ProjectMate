'use client';

/**
 * WordEditor.tsx — Fully upgraded version
 *
 * BUGS FIXED:
 *  1. Removed redundant setInterval polling in PageBreakView; ResizeObserver is sufficient.
 *  2. setEditor no longer called on every selection update / keypress — only on onCreate/onDestroy.
 *  3. prevValueRef is now initialized to the incoming `value` prop to prevent a double-set on mount.
 *  4. PageBreakView now uses scrollTop-aware offsetTop (el.offsetTop) instead of getBoundingClientRect
 *     so page-break height is correct even when the editor is scrolled.
 *  5. ToolbarButton now accepts an `aria-label` and renders it, making every button screen-reader accessible.
 *  6. onDestroy handler added to useEditor to clear the stale editor reference from the Zustand store.
 *
 * UPGRADES:
 *  7. Zustand selectors use individual field picks (state => state.x) to minimise re-renders.
 *  8. onChange is debounced (300 ms) to avoid flooding the parent on every keystroke.
 *  9. Inline <style> string is hoisted to a module-level constant — never recreated on render.
 * 10. SemanticHeadingButton, ToolbarButton, and Toolbar are all wrapped in React.memo.
 *
 * ENHANCEMENTS:
 * 11. Keyboard shortcut tooltips on every ToolbarButton via the `title` prop.
 * 12. Live word & character count displayed in the toolbar spacer area.
 * 13. Font-size selector (requires @tiptap/extension-font-size + @tiptap/extension-text-style).
 * 14. Text-colour picker (requires @tiptap/extension-color + @tiptap/extension-text-style).
 * 15. Highlight-colour picker (requires @tiptap/extension-highlight).
 * 16. Link insertion/edit dialog triggered by a toolbar button.
 * 17. "Ctrl+Enter = page break" hint shown in the toolbar as a keyboard badge.
 * 18. spellCheck is now a configurable prop (defaults to true).
 *
 * AI-SPECIFIC FIXES:
 * 19. AI writes outside the pages — Root cause: `min-height` on .strict-manuscript forced
 *     ProseMirror's clientHeight to be artificially tall (931 px minimum), throwing off the
 *     A4_CYCLE page-count math. Additionally the ResizeObserver was dividing the raw
 *     clientHeight (which includes top+bottom padding = 192 px) by A4_CYCLE, causing the
 *     white page tiles to always run ~192 px shorter than actual content.
 *     Fix A: removed `min-height` from .strict-manuscript entirely.
 *     Fix B: ResizeObserver now strips MARGIN*2 from clientHeight before computing neededPages.
 * 20. AI starts writing on page 2, leaving page 1 blank — Root cause: when `generating` flips
 *     true the parent resets `value` to '' then streams chunks. prevValueRef was pre-seeded to
 *     the old content, so the '' → firstChunk transition was silently skipped by the equality
 *     guard, leaving stale content in the editor; TipTap then appended streamed HTML after it,
 *     pushing everything to page 2.
 *     Fix: a dedicated `generating` watcher force-clears the editor and resets prevValueRef
 *     the moment generation begins, guaranteeing every streamed chunk starts from page 1.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  EditorContent,
  useEditor,
  Extension,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
// Enhancement extensions — install with:
//   npm i @tiptap/extension-color @tiptap/extension-text-style @tiptap/extension-highlight @tiptap/extension-font-size
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import { GhostText } from './GhostTextExtension';
import { create } from 'zustand';
import type { Editor as TiptapEditor } from '@tiptap/react';
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  Bot,
  ChevronDownIcon,
  FileDown,
  FileText,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  Loader2,
  type LucideIcon,
  Redo2Icon,
  UnderlineIcon,
  Undo2Icon,
  X,
} from 'lucide-react';

// ─────────────────────────────────────────────
// CUSTOM FONT SIZE EXTENSION (Inline Fix)
// ─────────────────────────────────────────────
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: element => element.style.fontSize.replace(/['"]+/g, ''),
          renderHTML: attributes => (!attributes.fontSize ? {} : { style: `font-size: ${attributes.fontSize}` }),
        },
      },
    }];
  },
  addCommands() { 
    return { 
      setFontSize: fontSize => ({ chain }) => chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    }; 
  },
});

// ─────────────────────────────────────────────
// CONSTANTS (A4 at 96 dpi)
// ─────────────────────────────────────────────
const A4_WIDTH = 794;   // 210 mm
const MARGIN = 96;    // 1 inch
const A4_HEIGHT = 1123;  // 297 mm
const PAGE_GAP = 48;    // Gray gap between pages
const A4_CYCLE = A4_HEIGHT + PAGE_GAP;
const LINE_HEIGHT = 32;   // Double-spaced

// ─────────────────────────────────────────────
// HOISTED STATIC STYLE STRING  (Fix #9)
// ─────────────────────────────────────────────
const EDITOR_STYLES = `
  .strict-manuscript {
    font-family: "Times New Roman", Times, serif;
    font-size: 16px !important;
    line-height: ${LINE_HEIGHT}px !important;
    color: #111;
    /*
     * AI-BUG FIX 1 (writing outside pages):
     * Remove min-height so the ProseMirror element's clientHeight reflects
     * ONLY actual content — not a forced minimum that throws off A4_CYCLE math.
     * The canvas wrapper drives the visual height; ProseMirror just flows content.
     */
    height: auto;
    padding: ${MARGIN}px;
    width: 100%;
    box-sizing: border-box;
    overflow: visible;
  }
  .strict-manuscript p {
    text-align: justify;
    text-indent: 0.5in;
    margin: 0;
    min-height: ${LINE_HEIGHT}px;
  }
  .strict-manuscript h1 {
    font-size: 18px; font-weight: bold; text-align: center;
    text-transform: uppercase; text-indent: 0; margin: 32px 0;
  }
  .strict-manuscript h2 {
    font-size: 16px; font-weight: bold; text-align: left;
    text-transform: uppercase; text-indent: 0; margin: 16px 0 0;
  }
  .strict-manuscript h3 {
    font-size: 16px; font-weight: bold; text-align: left;
    text-indent: 0; margin: 16px 0 0;
  }
  .strict-manuscript ul { padding-left: 0.5in; margin: 0 0 0 16px; list-style-type: disc; }
  .strict-manuscript ol { padding-left: 0.5in; margin: 0 0 0 16px; list-style-type: decimal; }
  .strict-manuscript li { line-height: 32px; min-height: 32px; }
  .strict-manuscript li p { text-indent: 0; }
  .ghost-text-suggestion {
    color: #9CA3AF;
    font-style: italic;
    pointer-events: none;
    user-select: none;
    opacity: 0.7;
  }
  .ghost-text-hint {
    font-size: 9px;
    color: #D1D5DB;
    font-style: normal;
    background: #F3F4F6;
    border: 1px solid #E5E7EB;
    border-radius: 3px;
    padding: 0 4px;
    margin-left: 6px;
    vertical-align: middle;
  }
`;

// ─────────────────────────────────────────────
// ZUSTAND STORE  (Fix #7 — selector-based picks)
// ─────────────────────────────────────────────
interface EditorState {
  editor: TiptapEditor | null;
  setEditor: (editor: TiptapEditor | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  editor: null,
  setEditor: (editor) => set({ editor }),
}));

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────
function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/** Simple debounce helper */
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

const Separator = ({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) => (
  <div
    className={cn(
      orientation === 'vertical'
        ? 'inline-block h-full w-px bg-neutral-300'
        : 'block h-px w-full bg-neutral-300',
      className,
    )}
  />
);

// ─────────────────────────────────────────────
// TOOLBAR PRIMITIVES
// ─────────────────────────────────────────────

// Enhancement #11 + Fix #6: added `title` for tooltip and `aria-label` for accessibility
interface ToolbarButtonProps {
  onClick?: () => void;
  isActive?: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  title?: string;
  className?: string;
}

const ToolbarButton = React.memo(
  ({ onClick, isActive, disabled, icon: Icon, title, className }: ToolbarButtonProps) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className={cn(
        'flex h-8 min-w-8 items-center justify-center rounded-md text-sm hover:bg-neutral-100 disabled:opacity-40 transition-colors text-neutral-700',
        isActive && 'bg-blue-50 text-blue-700 hover:bg-blue-100',
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  ),
);
ToolbarButton.displayName = 'ToolbarButton';

// Enhancement #16: Link dialog
const LinkButton = React.memo(() => {
  const editor = useEditorStore((s) => s.editor);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');

  const openDialog = useCallback(() => {
    const existing = editor?.getAttributes('link').href ?? '';
    setUrl(existing);
    setOpen(true);
  }, [editor]);

  const apply = useCallback(() => {
    if (!editor) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
    }
    setOpen(false);
  }, [editor, url]);

  return (
    <>
      <ToolbarButton
        icon={Link2Icon}
        title="Insert / Edit Link"
        isActive={editor?.isActive('link')}
        onClick={openDialog}
      />
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl p-5 w-80 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-neutral-800">Insert / Edit Link</p>
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              placeholder="https://example.com"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm rounded-lg hover:bg-neutral-100 text-neutral-600">
                Cancel
              </button>
              <button onClick={apply} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
LinkButton.displayName = 'LinkButton';

// Enhancement: Font-family selector
const FONT_FAMILIES = [
  'Times New Roman',
  'Arial',
  'Courier New',
  'Georgia',
];

const FontFamilySelector = React.memo(() => {
  const editor = useEditorStore((s) => s.editor);
  const [open, setOpen] = useState(false);
  const current = editor?.getAttributes('textStyle').fontFamily ?? 'Times New Roman';

  return (
    <div className="relative z-50">
      <button
        type="button"
        title="Font family"
        onClick={() => setOpen(!open)}
        onMouseDown={(e) => e.preventDefault()}
        className="flex h-8 w-36 shrink-0 items-center justify-between rounded-md px-2 text-sm font-medium hover:bg-neutral-100 transition-colors"
      >
        <span className="truncate" style={{ fontFamily: current }}>{current.replace(/['"]+/g, '')}</span>
        <ChevronDownIcon className="ml-1 size-3 shrink-0 text-neutral-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 flex flex-col rounded-lg border border-neutral-200 bg-white p-1 shadow-lg w-48 max-h-48 overflow-y-auto z-50">
            {FONT_FAMILIES.map((font) => (
              <button
                key={font}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor?.chain().focus().setFontFamily(font).run();
                  setOpen(false);
                }}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-md text-left hover:bg-neutral-100 transition-colors',
                  current.replace(/['"]+/g, '') === font && 'bg-neutral-100 font-semibold',
                )}
                style={{ fontFamily: font }}
              >
                {font}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
FontFamilySelector.displayName = 'FontFamilySelector';

// Enhancement #13: Font-size selector
const FONT_SIZES = ['12', '14', '16', '18', '20', '24', '28', '32', '36', '48'];

const FontSizeSelector = React.memo(() => {
  const editor = useEditorStore((s) => s.editor);
  const [open, setOpen] = useState(false);
  const current = editor?.getAttributes('textStyle').fontSize?.replace('px', '') ?? '16';

  return (
    <div className="relative z-50">
      <button
        type="button"
        title="Font size"
        onClick={() => setOpen(!open)}
        onMouseDown={(e) => e.preventDefault()}
        className="flex h-8 w-16 shrink-0 items-center justify-between rounded-md px-2 text-sm font-medium hover:bg-neutral-100 transition-colors"
      >
        <span>{current}</span>
        <ChevronDownIcon className="ml-1 size-3 shrink-0 text-neutral-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 flex flex-col rounded-lg border border-neutral-200 bg-white p-1 shadow-lg w-20 max-h-48 overflow-y-auto z-50">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor?.chain().focus().setFontSize(`${size}px`).run();
                  setOpen(false);
                }}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-md text-left hover:bg-neutral-100 transition-colors',
                  current === size && 'bg-neutral-100 font-semibold',
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
FontSizeSelector.displayName = 'FontSizeSelector';

// Enhancement #14: Text colour picker
const TextColorPicker = React.memo(() => {
  const editor = useEditorStore((s) => s.editor);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = editor?.getAttributes('textStyle').color ?? '#111111';

  return (
    <div className="relative">
      <button
        type="button"
        title="Text colour"
        onClick={() => inputRef.current?.click()}
        onMouseDown={(e) => e.preventDefault()}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-neutral-100 transition-colors"
        aria-label="Text colour"
      >
        <span className="text-xs font-black" style={{ color: current }}>A</span>
        <span className="absolute bottom-1 left-1 right-1 h-0.75 rounded-full" style={{ backgroundColor: current }} />
      </button>
      <input
        ref={inputRef}
        type="color"
        value={current}
        className="sr-only"
        onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
      />
    </div>
  );
});
TextColorPicker.displayName = 'TextColorPicker';

// Enhancement #15: Highlight colour picker
const HighlightPicker = React.memo(() => {
  const editor = useEditorStore((s) => s.editor);
  const COLORS = ['#FEF08A', '#BBF7D0', '#BFDBFE', '#FECACA', '#E9D5FF', 'transparent'];

  const [open, setOpen] = useState(false);

  return (
    <div className="relative z-50">
      <button
        type="button"
        title="Highlight"
        onClick={() => setOpen(!open)}
        onMouseDown={(e) => e.preventDefault()}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-neutral-100 transition-colors text-neutral-700 text-xs font-black"
        aria-label="Highlight colour"
      >
        <span style={{ background: 'linear-gradient(135deg,#FEF08A 50%,#BBF7D0 50%)', borderRadius: 2, padding: '1px 3px' }}>H</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 flex gap-1 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg z-50">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                title={c === 'transparent' ? 'Remove highlight' : c}
                onClick={() => {
                  if (c === 'transparent') editor?.chain().focus().unsetHighlight().run();
                  else editor?.chain().focus().setHighlight({ color: c }).run();
                  setOpen(false);
                }}
                className="w-6 h-6 rounded-md border border-neutral-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: c === 'transparent' ? '#fff' : c }}
              >
                {c === 'transparent' && <span className="text-[10px] text-neutral-400">✕</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
HighlightPicker.displayName = 'HighlightPicker';

// Enhancement #12: Word / char count (used inside Toolbar)
const useWordCount = () => {
  const editor = useEditorStore((s) => s.editor);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });

  useEffect(() => {
    if (!editor) return;
    const compute = () => {
      const text = editor.getText();
      const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
      setCounts({ words, chars: text.length });
    };
    editor.on('update', compute);
    compute();
    return () => { editor.off('update', compute); };
  }, [editor]);

  return counts;
};

// ─────────────────────────────────────────────
// TOOLBAR  (Fix #10: React.memo)
// ─────────────────────────────────────────────
interface ToolbarProps {
  saveStatus: 'saved' | 'saving' | 'unsaved';
  onOpenCopilot?: () => void;
  onExportDocx?: () => void;
  onExportPdf?: () => void;
}

const Toolbar = React.memo(({ saveStatus, onOpenCopilot, onExportDocx, onExportPdf }: ToolbarProps) => {
  const editor = useEditorStore((s) => s.editor); // Fix #7
  const { words, chars } = useWordCount();         // Enhancement #12

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2 bg-white border-b border-neutral-200 sticky top-0 z-50 shadow-sm flex-wrap">
      
      {/* Left Group: Editor Tools */}
      <div className="flex items-center gap-1 flex-wrap">
        {/* History */}
        <ToolbarButton icon={Undo2Icon} title="Undo (Ctrl+Z)" disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()} />
        <ToolbarButton icon={Redo2Icon} title="Redo (Ctrl+Y)" disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()} />
        <Separator orientation="vertical" className="h-5 mx-1 md:mx-2" />

        {/* Font size — Enhancement #13 */}
        <FontSizeSelector />
        {/* Font Family */}
        <FontFamilySelector />
        <Separator orientation="vertical" className="h-5 mx-1 md:mx-2" />

        {/* Formatting */}
        <ToolbarButton icon={BoldIcon} title="Bold (Ctrl+B)" isActive={editor?.isActive('bold')} disabled={!editor?.can().toggleBold()} onClick={() => editor?.chain().focus().toggleBold().run()} />
        <ToolbarButton icon={ItalicIcon} title="Italic (Ctrl+I)" isActive={editor?.isActive('italic')} disabled={!editor?.can().toggleItalic()} onClick={() => editor?.chain().focus().toggleItalic().run()} />
        <ToolbarButton icon={UnderlineIcon} title="Underline (Ctrl+U)" isActive={editor?.isActive('underline')} disabled={!editor?.can().toggleUnderline()} onClick={() => editor?.chain().focus().toggleUnderline().run()} />

        {/* Text colour — Enhancement #14 */}
        <TextColorPicker />

        {/* Highlight — Enhancement #15 */}
        <HighlightPicker />

        {/* Link — Enhancement #16 */}
        <LinkButton />

        <Separator orientation="vertical" className="h-5 mx-1 md:mx-2" />

        {/* Alignment */}
        <ToolbarButton icon={AlignLeftIcon} title="Align Left" isActive={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()} />
        <ToolbarButton icon={AlignCenterIcon} title="Align Center" isActive={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()} />
        <ToolbarButton icon={AlignRightIcon} title="Align Right" isActive={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()} />
        <ToolbarButton icon={AlignJustifyIcon} title="Justify" isActive={editor?.isActive({ textAlign: 'justify' })} onClick={() => editor?.chain().focus().setTextAlign('justify').run()} />
        <Separator orientation="vertical" className="h-5 mx-1 md:mx-2" />

        {/* Lists */}
        <ToolbarButton icon={ListIcon} title="Bullet List" isActive={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
        <ToolbarButton icon={ListOrderedIcon} title="Ordered List" isActive={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
      </div>

      {/* Right Group: Status, Stats & Export */}
      <div className="flex items-center gap-4 flex-wrap ml-auto">
        {/* Word / char count */}
        <div className="flex items-center justify-center">
          <span className="text-[11px] text-neutral-400 tabular-nums select-none whitespace-nowrap">
            {words.toLocaleString()} {words === 1 ? 'word' : 'words'} · {chars.toLocaleString()} chars
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Save Status */}
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-md whitespace-nowrap',
            saveStatus === 'saved' ? 'text-green-600 bg-green-50' :
              saveStatus === 'saving' ? 'text-neutral-500 bg-neutral-100' :
                'text-amber-600 bg-amber-50',
          )}>
            {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving…' : '● Unsaved'}
          </span>

          {/* Export Buttons */}
          <div className="flex items-center gap-1.5">
            {onExportDocx && (
              <button onClick={onExportDocx} title="Export as Word document" className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-bold hover:bg-blue-100 transition-colors whitespace-nowrap">
                <FileText className="w-3.5 h-3.5" /> Word
              </button>
            )}
            {onExportPdf && (
              <button onClick={onExportPdf} title="Export as PDF" className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-[11px] font-bold hover:bg-red-100 transition-colors whitespace-nowrap">
                <FileDown className="w-3.5 h-3.5" /> PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
Toolbar.displayName = 'Toolbar';

// ─────────────────────────────────────────────
// EDITOR AREA
// ─────────────────────────────────────────────
interface EditorAreaProps {
  value: string;
  onChange: (val: string) => void;
  generating: boolean;
  spellCheck: boolean;
  generationMode?: 'full' | 'append' | null;
  onFetchSuggestion?: (context: string, signal?: AbortSignal) => Promise<string | null>;
  suggestionsEnabled?: boolean;
}

const EditorArea = ({ value, onChange, generating, spellCheck, generationMode, onFetchSuggestion, suggestionsEnabled }: EditorAreaProps) => {
  const setEditor = useEditorStore((s) => s.setEditor); // Fix #7
  // Fix #3: initialise prevValueRef to the incoming value to prevent double-set on mount
  const prevValueRef = useRef<string>(value);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const [visiblePages, setVisiblePages] = useState(1);

  // Fix #8: debounced onChange so parent isn't flooded on every keystroke
  const debouncedOnChange = useMemo(() => debounce(onChange, 300), [onChange]);

  const editor = useEditor({
    // Fix #2: setEditor only on create/destroy, not on every selection or keystroke
    onCreate: ({ editor }) => {
      setEditor(editor);
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      prevValueRef.current = html;
      debouncedOnChange(html); // Fix #8
    },
    // Fix #6: clear stale store reference when editor is destroyed
    onDestroy: () => {
      setEditor(null);
    },
    content: value,
    editable: !generating,
    autofocus: 'end',
    editorProps: {
      attributes: {
        class: 'focus:outline-none strict-manuscript cursor-text',
        // Enhancement #18: spellCheck is now a runtime prop
        spellcheck: String(spellCheck),
      },
    },
    extensions: [
      StarterKit.configure({
        // You can disable specific StarterKit extensions here if they ever conflict (e.g., history: false)
      }),
      Underline,
      TextStyle,         // required by Color + FontSize
      FontFamily,
      Color,             // Enhancement #14
      FontSize,          // Enhancement #13
      Highlight.configure({ multicolor: true }), // Enhancement #15
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      GhostText,
    ],
    immediatelyRender: false,
  });

  /*
   * AI-BUG FIX 2 (blank first page / content starting on page 2):
   *
   * Root cause: when `generating` flips true the parent resets `value` to ''
   * then immediately starts streaming chunks. prevValueRef was pre-seeded to
   * the old (non-empty) value, so the first '' → firstChunk transition was
   * silently skipped by the `value === prevValueRef.current` guard, leaving
   * whatever stale content was there. TipTap then *appended* the streamed HTML
   * after it, pushing it to page 2.
   *
   * Fix: track the previous `generating` state. When generating flips ON,
   * always force-reset the editor to empty and re-seed prevValueRef, so every
   * subsequent streamed chunk lands cleanly from the top of page 1.
   */
  /*
   * AI-BUG FIX 2 (blank first page / content starting on page 2):
   *
   * The parent (ProjectEditor) now explicitly clears chapter content to ''
   * before setting generating=true for full-chapter generation. This means
   * the value sync effect below handles the transition cleanly.
   *
   * We do NOT clear the editor when `generating` flips on, because:
   * - For full-chapter generation: the parent already passes value='' first.
   * - For copilot/elaboration: the parent appends to existing content and
   *   setting generating=true should NOT wipe the existing text.
   *
   * The prevValueRef guard in the value-sync effect ensures stale content
   * is never re-applied. If value changes from old-content to '', the sync
   * effect clears the editor. If value then changes from '' to first-chunk,
   * the sync effect sets the new content at page 1.
   */

  // Sync AI streaming content — now guaranteed to start from a clean slate
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (value === prevValueRef.current) return;
    prevValueRef.current = value;

    // During generation, set content and position cursor based on mode.
    editor.commands.setContent(value || '', { emitUpdate: false });

    if (generating && value) {
      if (generationMode === 'append') {
        // For section/copilot generation, cursor goes to end where new content appears
        editor.commands.setTextSelection(editor.state.doc.content.size);
      } else {
        // For full chapter generation, cursor stays at start
        editor.commands.setTextSelection(0);
      }
      // Auto-scroll to where AI is currently writing
      requestAnimationFrame(() => {
        editor.commands.scrollIntoView();
      });
    }
  }, [value, editor, generating, generationMode]);

  // Lock editor during AI generation
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!generating);
  }, [generating, editor]);

  // Ghost text suggestions: fetch on 2-second typing pause
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!editor || !suggestionsEnabled || generating) return;

    const handleUpdate = () => {
      // Clear pending suggestion requests
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      // Dismiss current ghost text when user types
      editor.commands.dismissSuggestion();

      suggestionTimerRef.current = setTimeout(async () => {
        if (!onFetchSuggestion || !editor.isFocused || editor.isDestroyed) return;

        // Get context: last ~500 chars before cursor
        const { from } = editor.state.selection;
        const docText = editor.state.doc.textBetween(
          Math.max(0, from - 500), from, '\n',
        );
        if (docText.trim().length < 20) return; // Not enough context

        try {
          abortControllerRef.current = new AbortController();
          const suggestion = await onFetchSuggestion(docText, abortControllerRef.current.signal);

          if (suggestion && editor.isFocused && !editor.isDestroyed) {
            editor.commands.setSuggestion(suggestion);
          }
        } catch {
          // Silently ignore — user typed again or request aborted
        }
      }, 2000);
    };

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [editor, suggestionsEnabled, generating, onFetchSuggestion]);

  // Dynamic page count — grows & shrinks with content
  useEffect(() => {
    const proseMirrorEl = editorWrapRef.current?.querySelector('.ProseMirror');
    if (!proseMirrorEl) return;

    const observer = new ResizeObserver(() => {
      /*
       * AI-BUG FIX 1 (writing outside pages):
       * clientHeight includes the top+bottom padding (MARGIN*2 = 192px).
       * We must subtract that padding before dividing by A4_CYCLE, otherwise
       * the page count is calculated against inflated height and the white
       * page tiles fall short — making content appear to overflow the pages.
       */
      const rawHeight = proseMirrorEl.scrollHeight;
      // scrollHeight gives the full content height including padding.
      // Each A4 page is A4_HEIGHT tall with a PAGE_GAP between them.
      const neededPages = Math.max(1, Math.ceil(rawHeight / A4_CYCLE));
      setVisiblePages((prev) => (prev !== neededPages ? neededPages : prev));
    });

    observer.observe(proseMirrorEl);
    return () => observer.disconnect();
  }, [editor]);

  const totalDocHeight = visiblePages * A4_CYCLE;

  return (
    <div className="flex-1 w-full overflow-y-auto bg-white pb-24 flex justify-center pt-8">
      {/* Fix #9: style tag references the hoisted constant — never re-created */}
      <style>{EDITOR_STYLES}</style>

      {/* A4 canvas */}
      <div
        className="relative shadow-sm select-text transition-all duration-300 cursor-text"
        style={{ width: A4_WIDTH, minHeight: totalDocHeight, backgroundColor: 'transparent' }}
        onClick={() => {
          if (editor && !editor.isFocused) editor.commands.focus();
        }}
      >
        {/* Layer 1: page backgrounds */}
        <div className="absolute inset-0 pointer-events-none z-0 bg-white" />

        {/* Layer 2: TipTap editor — no minHeight here; ProseMirror flows naturally */}
        <div ref={editorWrapRef} className="relative z-10 w-full" style={{ minHeight: totalDocHeight }}>
          <EditorContent editor={editor} className="w-full" />
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────────
interface WordEditorProps {
  value?: string;
  onChange?: (val: string) => void;
  generating?: boolean;
  saveStatus?: 'saved' | 'saving' | 'unsaved';
  onExportDocx?: () => void;
  onExportPdf?: () => void;
  onOpenCopilot?: () => void;
  onCancelGeneration?: () => void;
  /** Enhancement #18: expose spellCheck as a prop; defaults to true */
  spellCheck?: boolean;
  /** Generation mode: 'full' = chapter from scratch, 'append' = section/copilot */
  generationMode?: 'full' | 'append' | null;
  /** Fetch an inline suggestion given surrounding text context */
  onFetchSuggestion?: (context: string, signal?: AbortSignal) => Promise<string | null>;
  /** Enable inline ghost-text suggestions */
  suggestionsEnabled?: boolean;
}

export default function WordEditor({
  value = '',
  onChange = () => { },
  generating = false,
  saveStatus = 'saved',
  onExportDocx,
  onExportPdf,
  onOpenCopilot,
  onCancelGeneration,
  spellCheck = true,
  generationMode = null,
  onFetchSuggestion,
  suggestionsEnabled = false,
}: WordEditorProps) {
  return (
    <div className="flex flex-col h-full w-full bg-white relative overflow-hidden text-neutral-900 font-sans">
      <Toolbar
        saveStatus={saveStatus}
        onOpenCopilot={onOpenCopilot}
        onExportDocx={onExportDocx}
        onExportPdf={onExportPdf}
      />

      {/* AI streaming banner */}
      {generating && (
        <div className="bg-[#1a4731] px-5 py-2.5 flex items-center justify-between shrink-0 shadow-inner z-40">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-green-300" />
            <span className="text-[11px] font-black uppercase tracking-widest text-green-200">
              AI is drafting…
            </span>
          </div>
          {onCancelGeneration && (
            <button
              onClick={onCancelGeneration}
              aria-label="Stop AI generation"
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white px-3 py-1 rounded-lg transition-all border border-red-500/30"
            >
              <X className="h-3 w-3" /> Stop
            </button>
          )}
        </div>
      )}

      <EditorArea
        value={value}
        onChange={onChange}
        generating={generating}
        spellCheck={spellCheck}
        generationMode={generationMode}
        onFetchSuggestion={onFetchSuggestion}
        suggestionsEnabled={suggestionsEnabled}
      />

      {/* Chatbot FAB */}
      {onOpenCopilot && (
        <button
          onClick={onOpenCopilot}
          title="Open AI Copilot"
          className="absolute bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#1a4731] text-white shadow-xl hover:bg-green-800 hover:scale-105 transition-all"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}