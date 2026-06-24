/**
 * editorExtensions.ts — single source of truth for the TipTap extension list
 * used by WordEditor. Kept out of the component so tests can verify schema
 * round-trips (generateJSON/generateHTML) against the exact extensions the
 * editor runs with: any node the schema can't represent is silently dropped
 * from chapter HTML on the first manual edit (onUpdate → editor.getHTML()).
 */
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import { GhostText } from './GhostTextExtension';
import { PageBreak } from './PageBreakExtension';

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

export const buildEditorExtensions = () => [
  StarterKit.configure({
    // TipTap v3 StarterKit bundles Link and Underline by default. We add
    // our own configured versions below, so disable the bundled ones to
    // avoid the "Duplicate extension names found" warning.
    link: false,
    underline: false,
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
  PageBreak,         // persists data-page-break divs; Ctrl/Cmd+Enter inserts one
];
