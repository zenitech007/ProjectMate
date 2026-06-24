/**
 * PageBreakExtension.ts
 *
 * TipTap node for ProjectMate's manual page-break marker. Chapter HTML stores
 * page breaks as PAGE_BREAK_HTML divs (services/outlineReconciler.ts) and
 * exportService converts them into real DOCX/PDF page breaks. Without this
 * node in the schema, ProseMirror drops the divs the first time a user edits
 * a chapter (onUpdate → editor.getHTML()), and exports lose all page breaks.
 *
 * The rendered form must stay byte-for-byte identical to PAGE_BREAK_HTML:
 * outlineReconciler strips trailing breaks via String.endsWith(PAGE_BREAK_HTML).
 */
import { Node } from '@tiptap/core';
import { PAGE_BREAK_ATTR, PAGE_BREAK_CLASS } from '../../services/outlineReconciler';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insert a page-break marker at the current position. */
      setPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: 'pageBreak',

  group: 'block',
  atom: true,

  // Above HardBreak (100) so our Mod-Enter outranks its hard-break binding;
  // below Paragraph (1000) so paragraph stays the schema's default block.
  priority: 101,

  parseHTML() {
    return [{ tag: `div[${PAGE_BREAK_ATTR}]` }];
  },

  renderHTML() {
    // Attribute order matters: serialization must equal PAGE_BREAK_HTML.
    return ['div', { [PAGE_BREAK_ATTR]: '', class: PAGE_BREAK_CLASS }];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => this.editor.commands.setPageBreak(),
    };
  },
});
