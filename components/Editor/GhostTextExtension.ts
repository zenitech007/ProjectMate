/**
 * GhostTextExtension.ts
 *
 * A TipTap extension that renders inline "ghost text" suggestions
 * at the current cursor position. Users can:
 *   - Press Tab to accept the suggestion (inserts it into the document)
 *   - Press Escape to dismiss
 *
 * Usage:
 *   editor.commands.setSuggestion('some continuation text');
 *   editor.commands.acceptSuggestion();
 *   editor.commands.dismissSuggestion();
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface GhostTextStorage {
  suggestion: string | null;
}

const ghostTextKey = new PluginKey('ghostText');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ghostText: {
      setSuggestion: (text: string | null) => ReturnType;
      acceptSuggestion: () => ReturnType;
      dismissSuggestion: () => ReturnType;
    };
  }
}

export const GhostText = Extension.create<{}, GhostTextStorage>({
  name: 'ghostText',

  addStorage() {
    return { suggestion: null };
  },

  addCommands() {
    return {
      setSuggestion:
        (text: string | null) =>
        ({ editor }) => {
          editor.storage.ghostText.suggestion = text;
          // Dispatch an empty transaction to trigger decoration re-render
          editor.view.dispatch(editor.state.tr);
          return true;
        },

      acceptSuggestion:
        () =>
        ({ editor, chain }) => {
          const text = editor.storage.ghostText.suggestion;
          if (!text) return false;
          editor.storage.ghostText.suggestion = null;
          return chain().insertContent(text).run();
        },

      dismissSuggestion:
        () =>
        ({ editor }) => {
          if (!editor.storage.ghostText.suggestion) return false;
          editor.storage.ghostText.suggestion = null;
          editor.view.dispatch(editor.state.tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.storage.suggestion) {
          return this.editor.commands.acceptSuggestion();
        }
        return false; // Let Tab do its default thing (e.g. indent in lists)
      },
      Escape: () => {
        if (this.storage.suggestion) {
          return this.editor.commands.dismissSuggestion();
        }
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: ghostTextKey,
        props: {
          decorations(state) {
            const suggestion = extension.storage.suggestion;
            if (!suggestion) return DecorationSet.empty;

            const { from } = state.selection;

            const widget = Decoration.widget(
              from,
              () => {
                const span = document.createElement('span');
                span.className = 'ghost-text-suggestion';
                span.textContent = suggestion;

                const hint = document.createElement('span');
                hint.className = 'ghost-text-hint';
                hint.textContent = ' Tab';

                span.appendChild(hint);
                return span;
              },
              { side: 1 }, // render after cursor
            );

            return DecorationSet.create(state.doc, [widget]);
          },
        },
      }),
    ];
  },
});
