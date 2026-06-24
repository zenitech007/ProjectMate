import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Plus, Trash2, GripVertical, Lock, Check, AlertCircle,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ProjectOutline } from '../../types';
import {
  StructureEdits, SectionDraft, outlineToDrafts, validateStructureEdits,
} from '../../services/outlineReconciler';

/**
 * StructureEditor — full-screen (mobile) / centered modal (desktop) editor
 * for the project's chapter/section structure. Draft-based: nothing touches
 * the project until the user taps Save, when the full draft is handed to
 * onSave as StructureEdits (the caller validates content deletions and
 * applies). REFERENCES/APPENDICES rows are locked.
 */

interface StructureEditorProps {
  outline: ProjectOutline[];
  onSave: (edits: StructureEdits) => void;
  onClose: () => void;
  /** disable Save (e.g. while an AI stream is running) */
  saveDisabled?: boolean;
}

// Draft rows need stable ids for dnd + React keys while names mutate.
let nextRowId = 0;
const genId = () => `sr-${++nextRowId}`;

interface DraftRow extends SectionDraft { id: string; }
interface DraftChapter {
  originalTitle: string;
  title: string;
  locked: boolean;
  rows: DraftRow[];
}

const SortableRow: React.FC<{
  row: DraftRow;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}> = ({ row, onRename, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 py-1"
    >
      <button
        type="button"
        aria-label={`Reorder ${row.name || 'section'}`}
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-300 hover:text-slate-500 shrink-0 touch-none bg-transparent border-0 p-2"
      >
        <GripVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      <input
        value={row.name}
        onChange={e => onRename(row.id, e.target.value)}
        placeholder="Section name"
        aria-label="Section name"
        maxLength={100}
        className="flex-1 min-w-0 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-green-700 focus:bg-white outline-none transition-all"
      />
      <button
        type="button"
        onClick={() => onDelete(row.id)}
        aria-label={`Delete section ${row.name || ''}`}
        className="shrink-0 p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

const StructureEditor: React.FC<StructureEditorProps> = ({ outline, onSave, onClose, saveDisabled }) => {
  // Snapshot semantics: drafts seed once from the outline at mount. Callers must conditionally MOUNT this component (not toggle visibility) so a fresh outline re-seeds.
  const [drafts, setDrafts] = useState<DraftChapter[]>(() =>
    outlineToDrafts(outline).map(ch => ({
      originalTitle: ch.originalTitle,
      title: ch.title,
      locked: ch.locked,
      rows: ch.sections.map(s => ({ ...s, id: genId() })),
    })),
  );

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const isDraggingRef = useRef(false);
  useEffect(() => {
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.defaultPrevented || isDraggingRef.current) return; if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const edits: StructureEdits = useMemo(
    () => drafts.map(ch => ({
      originalTitle: ch.originalTitle,
      title: ch.title,
      locked: ch.locked,
      sections: ch.rows.map(({ name, originalName }) => ({ name, originalName })),
    })),
    [drafts],
  );

  const errors = useMemo(() => validateStructureEdits(edits), [edits]);

  const renameChapter = (idx: number, title: string) =>
    setDrafts(d => d.map((ch, i) => (i === idx ? { ...ch, title } : ch)));

  const renameRow = (idx: number, id: string, name: string) =>
    setDrafts(d => d.map((ch, i) =>
      i === idx ? { ...ch, rows: ch.rows.map(r => (r.id === id ? { ...r, name } : r)) } : ch));

  const deleteRow = (idx: number, id: string) =>
    setDrafts(d => d.map((ch, i) =>
      i === idx ? { ...ch, rows: ch.rows.filter(r => r.id !== id) } : ch));

  const addRow = (idx: number) => {
    const id = genId();
    setDrafts(d => d.map((ch, i) =>
      i === idx
        ? { ...ch, rows: [...ch.rows, { id, name: '', originalName: null }] }
        : ch));
  };

  const onDragEnd = (idx: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDrafts(d => d.map((ch, i) => {
      if (i !== idx) return ch;
      const from = ch.rows.findIndex(r => r.id === active.id);
      const to = ch.rows.findIndex(r => r.id === over.id);
      if (from === -1 || to === -1) return ch;
      return { ...ch, rows: arrayMove(ch.rows, from, to) };
    }));
  };

  const canSave = errors.length === 0 && !saveDisabled;

  return (
    <div role="dialog" aria-modal="true" aria-label="Customize structure" className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white w-full h-[92dvh] md:h-auto md:max-h-[85vh] md:max-w-2xl md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-700">Customize Structure</h2>
          <button ref={closeBtnRef} onClick={onClose} aria-label="Close" className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-6 custom-scrollbar">
          {drafts.map((ch, idx) => (
            <div key={`${idx}-${ch.originalTitle}`}>
              {ch.locked ? (
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg text-slate-400">
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="text-xs font-black uppercase tracking-widest">{ch.title}</span>
                </div>
              ) : (
                <>
                  <input
                    value={ch.title}
                    onChange={e => renameChapter(idx, e.target.value)}
                    maxLength={100}
                    aria-label={`Chapter title (was ${ch.originalTitle})`}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-black uppercase tracking-wide text-slate-800 focus:ring-2 focus:ring-green-700 outline-none transition-all"
                  />
                  <div className="mt-2 pl-2 border-l-2 border-slate-100 space-y-0.5">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={() => { isDraggingRef.current = true; }}
                      onDragEnd={e => { isDraggingRef.current = false; onDragEnd(idx, e); }}
                      // setTimeout: PointerSensor's Escape keydown fires before/around dnd-kit's cancel callback in the same event cascade; deferring the flag-clear to the next macrotask guarantees the modal's window-level keydown listener (same Escape press) still sees isDraggingRef.current === true.
                      onDragCancel={() => { setTimeout(() => { isDraggingRef.current = false; }, 0); }}
                    >
                      <SortableContext items={ch.rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                        {ch.rows.map(row => (
                          <SortableRow
                            key={row.id}
                            row={row}
                            onRename={(id, name) => renameRow(idx, id, name)}
                            onDelete={id => deleteRow(idx, id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                    <button
                      type="button"
                      onClick={() => addRow(idx)}
                      className="flex items-center gap-1.5 mt-1 px-2 py-2 text-green-700 hover:bg-green-50 rounded-lg text-xs font-black uppercase tracking-widest transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add section
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 shrink-0 space-y-3">
          {errors.length > 0 && (
            <div className="flex items-start gap-2 text-red-600 text-xs font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{errors[0]}</span>
            </div>
          )}
          {saveDisabled && (
            <p className="text-xs text-slate-400 font-medium">Finish or cancel the running AI generation before saving structure changes.</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 border-2 border-slate-200 text-slate-600 rounded-xl font-black text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => canSave && onSave(edits)}
              disabled={!canSave}
              className="flex-1 py-3.5 bg-[#1a4731] text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:bg-[#153a28] transition-colors disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Save Structure
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StructureEditor;
