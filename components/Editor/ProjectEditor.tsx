import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Loader2, Wand2, ChevronRight, BookOpen,
  AlertCircle, Zap, GripVertical, Bot, Send, Sparkles, X, CheckCircle2, Settings2
} from 'lucide-react';
import { UserProfile, Project, ProjectOutline } from '../../types';
import {
  generateChapterContentStream,
  generateSectionContentStream,
  elaborateContentStream
} from '../../services/geminiService';
import { cleanHTML, cleanDocumentHTML } from '../../services/htmlCleaner';
import {
  PAGE_BREAK_HTML,
  escapeHTML,
  reorderChapterSectionsInHTML,
  StructureEdits,
  findContentBearingDeletions,
  applyStructureChanges,
  validateStructureEdits,
} from '../../services/outlineReconciler';
import { exportToDocx, exportToPdf } from '../../services/exportService';
import { useFirestore } from '../../hooks/useFirestore';
// Lazy — defers vendor-paystack (~116 kB) until the user actually clicks "Top up".
const PaymentModal = lazy(() => import('../Payments/PaymentModal'));
import WordEditor, { useEditorStore } from './WordEditor';
import StructureEditor from './StructureEditor';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ProjectEditorProps {
  user: UserProfile;
}

// ─── Helper: build a chapter's full HTML from streamed AI text ───────────────
// Wraps the generated content with the chapter title as an <h1> at the top.
// The AI is told NOT to include the chapter title, so this adds it cleanly once.
const wrapChapterContent = (chapterTitle: string, bodyHTML: string): string => {
  const titleHTML = `<h1>${escapeHTML(chapterTitle.toUpperCase())}</h1>`;
  return titleHTML + cleanHTML(bodyHTML);
};

// ─── Helper: append a section to existing chapter HTML ──────────────────────
// Adds a page break before the section heading, then the body.
// The AI is told NOT to repeat the section title, so we add it once here.
const appendSection = (
  existing: string,
  sectionTitle: string,
  bodyHTML: string
): string => {
  // Only add page break if there's already content
  const pageBreak = existing.trim() ? PAGE_BREAK_HTML : '';
  // Section heading (h2), then cleaned body (AI should not repeat the heading)
  const sectionHTML = `<h2>${escapeHTML(sectionTitle)}</h2>${cleanHTML(bodyHTML)}`;
  return existing + pageBreak + sectionHTML;
};

// ─── Sortable section row ────────────────────────────────────────────────────
const SortableSection: React.FC<{
  id: string;
  section: string;
  chapterTitle: string;
  activeChapter: string;
  generatingSection: string | null;
  onSelect: (title: string) => void;
  onGenerate: (section: string) => void;
}> = ({ id, section, chapterTitle, activeChapter, generatingSection, onSelect, onGenerate }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      className="flex items-center group/s gap-1 py-0.5"
    >
      <button
        type="button"
        aria-label={`Reorder section ${section}`}
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-400 md:text-slate-200 hover:text-slate-500 md:hover:text-slate-400 shrink-0 touch-none bg-transparent border-0 p-0"
      >
        <GripVertical className="h-3.5 w-3.5 md:h-3 md:w-3" aria-hidden="true" />
      </button>
      <button
        onClick={() => onSelect(chapterTitle)}
        className={`flex-1 text-left text-[10px] truncate transition-colors leading-relaxed ${
          activeChapter === chapterTitle
            ? 'text-green-700 font-bold'
            : 'text-slate-400 hover:text-slate-700 font-medium'
        }`}
      >
        {section}
      </button>
      {generatingSection === section ? (
        <Loader2 className="h-4 w-4 md:h-3 md:w-3 animate-spin text-green-600 shrink-0" aria-label="Generating section" />
      ) : (
        <button
          onClick={e => { e.stopPropagation(); onGenerate(section); }}
          title={`Generate "${section}"`}
          aria-label={`Generate section ${section}`}
          className="shrink-0 p-1.5 md:p-1 text-green-600 bg-green-50 md:text-slate-200 md:bg-transparent hover:text-green-700 hover:bg-green-100 md:hover:text-green-600 md:hover:bg-green-50 rounded opacity-100 md:opacity-0 md:group-hover/s:opacity-100 transition-all"
        >
          <Wand2 className="h-4 w-4 md:h-3 md:w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

// ─── Main ProjectEditor ──────────────────────────────────────────────────────
const ProjectEditor: React.FC<ProjectEditorProps> = ({ user }) => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { getProject, updateProject } = useFirestore(user.uid);

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeChapter, setActiveChapter] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [generationMode, setGenerationMode] = useState<'full' | 'append' | null>(null);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showPayment, setShowPayment] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isStructureOpen, setIsStructureOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Synchronous lock — prevents two clicks within the same render from both
  // entering a generate handler (state `generating` flips async).
  const isGeneratingRef = useRef(false);
  // AbortController for the active stream — set when a generate starts,
  // aborted on unmount / user cancel / overlapping cancel.
  const abortControllerRef = useRef<AbortController | null>(null);
  // Snapshot of the chapter's content immediately before we mutate it,
  // so a mid-stream failure can be rolled back.
  const chapterBackupRef = useRef<{ title: string; content: string } | null>(null);
  const autosaveTimer = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const lastFailedProject = useRef<Project | null>(null);

  // Cleanup on unmount: stop the in-flight stream and pending timers.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toastTimer = useRef<number | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  // ── Load project ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    getProject(projectId)
      .then(proj => {
        if (!proj) { setError("Project not found."); return; }

        // Strip any AI-generated preliminary/outline chapters from the sidebar
        // The wizard already handles these as static pages; only chapter content matters
        const cleanOutline = proj.outline.filter(ch => {
          const t = ch.title.toUpperCase();
          return !t.includes('PRELIMINARY') && !t.includes('FRONT MATTER')
            && !t.includes('TABLE OF CONTENTS') && !t.includes('LIST OF');
        });

        // Defense-in-depth: re-sanitize chapter HTML loaded from Firestore.
        // Content was already cleaned before save, but any future code path
        // that writes to /projects (sharing, SDK call, migration) reaches
        // the editor through here, so we cleanse on render.
        const cleanChapters: typeof proj.chapters = {};
        for (const [k, ch] of Object.entries(proj.chapters || {})) {
          cleanChapters[k] = ch.content
            ? { ...ch, content: cleanDocumentHTML(ch.content) }
            : ch;
        }
        const cleanProject = { ...proj, outline: cleanOutline, chapters: cleanChapters };
        setProject(cleanProject);

        // Select the first pending chapter (if any) or default to the first chapter.
        // NOTE: generation is NOT auto-triggered — the user must click the
        // generate button explicitly. Auto-triggering on mount was causing
        // Cloud Functions to fire every time the editor loaded.
        const pending = Object.values(cleanProject.chapters || {}).find(c => c.status === 'pending');
        setActiveChapter(
          pending ? pending.title : (cleanOutline[0]?.title || '')
        );
      })
      .catch(() => setError("Failed to load project. Please try again."));
  }, [projectId, getProject]);

  // ── Autosave ────────────────────────────────────────────────────────────────
  const triggerAutosave = useCallback((updated: Project) => {
    setSaveStatus('saving');
    lastFailedProject.current = null;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(async () => {
      if (!isMountedRef.current) return;
      try {
        await updateProject(updated.id, { chapters: updated.chapters, outline: updated.outline });
        if (isMountedRef.current) {
          setSaveStatus('saved');
          lastFailedProject.current = null;
        }
      } catch {
        if (isMountedRef.current) {
          setSaveStatus('unsaved');
          lastFailedProject.current = updated;
        }
      }
    }, 2500);
  }, [updateProject]);

  const retrySave = useCallback(async () => {
    const proj = lastFailedProject.current || project;
    if (!proj) return;
    setSaveStatus('saving');
    try {
      await updateProject(proj.id, { chapters: proj.chapters, outline: proj.outline });
      setSaveStatus('saved');
      lastFailedProject.current = null;
    } catch {
      setSaveStatus('unsaved');
    }
  }, [updateProject, project]);

  // ── Access gate ─────────────────────────────────────────────────────────────
  const checkAccess = (): boolean => {
    // The user already used a credit to unlock this project topic.
    // Therefore, they have full access to generate all chapters, sections, and appendices.
    return true;
  };

  // ── Generate entire chapter by title ─────────────────────────────────────────
  // Accepts explicit chapterTitle to avoid stale-closure bugs when called via setTimeout
  const handleGenerateChapter = async (chapterTitle?: string) => {
    const target = chapterTitle || activeChapter;
    if (!project || isGeneratingRef.current || !checkAccess()) return;
    // Synchronous lock — flips before any async work to block overlapping clicks.
    isGeneratingRef.current = true;

    // Flush a pending autosave timer so a stale debounced write can't clobber
    // the cleared content mid-stream.
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      // Flush the pending write before generating — the server reads the
      // project doc (outline) and the stream result will overwrite chapter
      // state, so a discarded debounce here would lose edits server-side.
      try {
        await updateProject(project.id, { chapters: project.chapters, outline: project.outline });
      } catch {
        if (isMountedRef.current) {
          setSaveStatus('unsaved');
          lastFailedProject.current = project;
        }
      }
    }

    // Snapshot the chapter so a mid-stream failure can be rolled back.
    chapterBackupRef.current = {
      title: target,
      content: project.chapters[target]?.content || '',
    };

    // Clear content before generation to prevent blank first page bug
    setProject(prev => {
      if (!prev) return prev;
      const chapters = { ...prev.chapters };
      chapters[target] = { title: target, content: '', status: 'pending' };
      return { ...prev, chapters };
    });
    setGenerating(true);
    setGenerationMode('full');
    setGeneratingSection(target);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let streamedBody = '';
      await generateChapterContentStream(
        project.id,
        project.topic,
        target,
        project.department,
        chunk => {
          if (controller.signal.aborted) return;
          streamedBody = chunk;
          const html = wrapChapterContent(target, streamedBody);
          // Functional update so the latest chapters state is used, not a
          // snapshot captured before this stream started.
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[target] = { title: target, content: html, status: 'completed' };
            return { ...prev, chapters };
          });
        },
        controller.signal,
      );
      // Success — clear the rollback snapshot, then autosave.
      chapterBackupRef.current = null;
      setProject(current => { if (current) triggerAutosave(current); return current; });
      if (isMountedRef.current) showToast('Chapter generated');
    } catch (e: any) {
      const isAbort = e?.name === 'AbortError' || controller.signal.aborted;
      // Restore the pre-stream content on any failure (including abort) so
      // we never leave the chapter wiped or partially written.
      const backup = chapterBackupRef.current;
      if (backup && backup.title === target) {
        setProject(prev => {
          if (!prev) return prev;
          const chapters = { ...prev.chapters };
          const wasGenerated = !!backup.content;
          chapters[target] = {
            title: target,
            content: backup.content,
            status: wasGenerated ? 'completed' : 'empty',
          };
          return { ...prev, chapters };
        });
      }
      chapterBackupRef.current = null;
      // Persist the restored state — the pre-stream flush/clear means no
      // timer is armed, and without this a tab close would lose the restore
      // (and any structure edit that rode the same in-memory state).
      setProject(current => { if (current) triggerAutosave(current); return current; });
      if (!isAbort && isMountedRef.current) showToast(e?.message || 'Generation interrupted');
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      isGeneratingRef.current = false;
      if (isMountedRef.current) {
        setGenerating(false);
        setGenerationMode(null);
        setGeneratingSection(null);
      }
    }
  };

  // ── Generate a specific section (appends with page break) ──────────────────
  // Accepts explicit chapterTitle to avoid stale-closure bugs from setTimeout
  const handleGenerateSection = async (sectionTitle: string, chapterTitle?: string) => {
    const target = chapterTitle || activeChapter;
    if (!project || isGeneratingRef.current || !checkAccess()) return;
    isGeneratingRef.current = true;

    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      // Flush the pending write before generating — the server reads the
      // project doc (outline) and the stream result will overwrite chapter
      // state, so a discarded debounce here would lose edits server-side.
      try {
        await updateProject(project.id, { chapters: project.chapters, outline: project.outline });
      } catch {
        if (isMountedRef.current) {
          setSaveStatus('unsaved');
          lastFailedProject.current = project;
        }
      }
    }

    // Capture the chapter's content at stream start. Every chunk re-renders
    // by appending against this fixed base, so any concurrent edit attempt
    // (which is also blocked by handleEdit's generating guard) can't be
    // silently overwritten by a stale snapshot.
    const baseAtStart = project.chapters[target]?.content || '';
    chapterBackupRef.current = { title: target, content: baseAtStart };

    setGenerating(true);
    setGenerationMode('append');
    setGeneratingSection(sectionTitle);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let streamedBody = '';
      await generateSectionContentStream(
        project.id,
        project.topic,
        target,
        sectionTitle,
        project.department,
        chunk => {
          if (controller.signal.aborted) return;
          streamedBody = chunk;
          // appendSection adds the heading once — AI must NOT repeat it
          const html = appendSection(baseAtStart, sectionTitle, streamedBody);
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[target] = { title: target, content: html, status: 'completed' };
            return { ...prev, chapters };
          });
        },
        controller.signal,
      );
      chapterBackupRef.current = null;
      setProject(current => { if (current) triggerAutosave(current); return current; });
      if (isMountedRef.current) showToast(`"${sectionTitle}" generated`);
    } catch (e: any) {
      const isAbort = e?.name === 'AbortError' || controller.signal.aborted;
      // Roll back to the content as it was at stream start.
      const backup = chapterBackupRef.current;
      if (backup && backup.title === target) {
        setProject(prev => {
          if (!prev) return prev;
          const chapters = { ...prev.chapters };
          chapters[target] = {
            title: target,
            content: backup.content,
            status: backup.content ? 'completed' : 'empty',
          };
          return { ...prev, chapters };
        });
      }
      chapterBackupRef.current = null;
      // Persist the restored state — the pre-stream flush/clear means no
      // timer is armed, and without this a tab close would lose the restore
      // (and any structure edit that rode the same in-memory state).
      setProject(current => { if (current) triggerAutosave(current); return current; });
      if (!isAbort && isMountedRef.current) showToast(e?.message || 'Generation interrupted');
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      isGeneratingRef.current = false;
      if (isMountedRef.current) {
        setGenerating(false);
        setGenerationMode(null);
        setGeneratingSection(null);
      }
    }
  };

  // ── AI Copilot ──────────────────────────────────────────────────────────────
  // Inserts AI content at the current cursor position — no page breaks.
  const handleCopilot = async () => {
    if (!copilotQuery.trim() || !project || isGeneratingRef.current) return;
    const editor = useEditorStore.getState().editor;
    if (!editor) return;

    isGeneratingRef.current = true;
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      // Flush the pending write before generating — the server reads the
      // project doc (outline) and the stream result will overwrite chapter
      // state, so a discarded debounce here would lose edits server-side.
      try {
        await updateProject(project.id, { chapters: project.chapters, outline: project.outline });
      } catch {
        if (isMountedRef.current) {
          setSaveStatus('unsaved');
          lastFailedProject.current = project;
        }
      }
    }

    // Snapshot HTML before & after cursor using ProseMirror DOMSerializer
    const { from } = editor.state.selection;
    const docSize = editor.state.doc.content.size;
    const { DOMSerializer } = await import('@tiptap/pm/model');
    const serializer = DOMSerializer.fromSchema(editor.schema);
    const toHTML = (fragment: any) => {
      const div = document.createElement('div');
      div.appendChild(serializer.serializeFragment(fragment));
      return div.innerHTML;
    };
    const htmlBefore = toHTML(editor.state.doc.slice(0, from).content);
    const htmlAfter  = toHTML(editor.state.doc.slice(from, docSize).content);
    const fullBefore = editor.getHTML(); // for AI context prompt

    // Snapshot the chapter so we can roll back on stream failure.
    chapterBackupRef.current = {
      title: activeChapter,
      content: project.chapters[activeChapter]?.content || '',
    };

    setGenerating(true);
    setGenerationMode('append');
    setIsCopilotOpen(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const chapterOutline = project.outline.find(ch => ch.title === activeChapter);
      const sectionNames = chapterOutline?.sections?.join(', ') || 'N/A';

      await elaborateContentStream(
        project.id,
        project.topic,
        `Chapter: ${activeChapter}\nSections in this chapter: ${sectionNames}\nInstruction: ${copilotQuery}\n\nExisting content (last 3000 chars for context):\n${fullBefore.slice(-3000)}`,
        chunk => {
          if (controller.signal.aborted) return;
          // Splice cleaned AI text between the before/after cursor snapshots
          const fullHTML = htmlBefore + cleanHTML(chunk) + htmlAfter;
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[activeChapter] = {
              title: activeChapter,
              content: fullHTML,
              status: 'completed',
            };
            return { ...prev, chapters };
          });
        },
        controller.signal,
      );
      chapterBackupRef.current = null;
      setCopilotQuery('');
      setProject(current => { if (current) triggerAutosave(current); return current; });
    } catch (e: any) {
      const isAbort = e?.name === 'AbortError' || controller.signal.aborted;
      const backup = chapterBackupRef.current;
      if (backup && backup.title === activeChapter) {
        setProject(prev => {
          if (!prev) return prev;
          const chapters = { ...prev.chapters };
          chapters[activeChapter] = {
            title: activeChapter,
            content: backup.content,
            status: backup.content ? 'completed' : 'empty',
          };
          return { ...prev, chapters };
        });
      }
      chapterBackupRef.current = null;
      // Persist the restored state — the pre-stream flush/clear means no
      // timer is armed, and without this a tab close would lose the restore
      // (and any structure edit that rode the same in-memory state).
      setProject(current => { if (current) triggerAutosave(current); return current; });
      if (!isAbort) {
        console.error('Copilot error:', e);
        if (isMountedRef.current) showToast(e?.message || 'Generation interrupted');
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      isGeneratingRef.current = false;
      if (isMountedRef.current) {
        setGenerating(false);
        setGenerationMode(null);
      }
    }
  };

  // ── Manual edit ─────────────────────────────────────────────────────────────
  const handleEdit = (val: string) => {
    if (!project) return;
    // While a stream is writing into this chapter, drop incoming edits.
    // TipTap is set non-editable but a debounced onChange queued just
    // before the lock can still fire — without this guard it would
    // overwrite the streaming content (and be wiped on the next chunk).
    if (isGeneratingRef.current) return;
    setSaveStatus('unsaved');
    const chapters = { ...project.chapters };
    chapters[activeChapter] = {
      ...(chapters[activeChapter] || { title: activeChapter }),
      content: val,
      status: 'completed'
    };
    const updated = { ...project, chapters };
    setProject(updated);
    triggerAutosave(updated);
  };

  // ── Inline suggestion fetcher (ghost text) ─────────────────────────────────
  const handleFetchSuggestion = useCallback(async (context: string, signal?: AbortSignal): Promise<string | null> => {
    if (!project || generating) return null;
    const { fetchSuggestion } = await import('../../services/geminiService');
    return fetchSuggestion(project.id, project.topic, context, signal);
  }, [project, generating]);

  // ── Reorder outline sections ─────────────────────────────────────────────────
  // Reorders both the sidebar outline AND the section blocks inside the
  // chapter's HTML, so the rendered document and export match the new order.
  const handleDragEnd = (chapterIdx: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !project) return;
    if (isGeneratingRef.current) return; // Don't reorder while a stream is writing
    const ch = project.outline[chapterIdx];
    const prefix = `${ch.title}-`;
    const oldIdx = ch.sections.indexOf((active.id as string).replace(prefix, ''));
    const newIdx = ch.sections.indexOf((over.id as string).replace(prefix, ''));
    if (oldIdx === -1 || newIdx === -1) return;
    const newSections = arrayMove(ch.sections, oldIdx, newIdx);
    const newOutline = [...project.outline];
    newOutline[chapterIdx] = { ...ch, sections: newSections };

    // Re-stitch the chapter HTML so section blocks follow the new order.
    const chapterContent = project.chapters[ch.title]?.content || '';
    const reorderedContent = reorderChapterSectionsInHTML(chapterContent, newSections);
    const newChapters = { ...project.chapters };
    if (reorderedContent !== chapterContent) {
      newChapters[ch.title] = {
        ...(newChapters[ch.title] || { title: ch.title, status: 'empty' }),
        title: ch.title,
        content: reorderedContent,
      };
    }

    const updated = { ...project, outline: newOutline, chapters: newChapters };
    setProject(updated);
    triggerAutosave(updated);
  };

  // ── Structure editing ────────────────────────────────────────────────────
  const closeStructureEditor = useCallback(() => setIsStructureOpen(false), []);

  const handleStructureSave = async (edits: StructureEdits) => {
    if (!project || isGeneratingRef.current) return;

    if (validateStructureEdits(edits).length > 0) return; // modal's Save gate should prevent this

    const deletions = findContentBearingDeletions(project, edits);
    if (deletions.length > 0) {
      const shown = deletions.slice(0, 10);
      const more = deletions.length - shown.length;
      const list = shown.map(d => `• ${d.section}  (${d.chapter})`).join('\n')
        + (more > 0 ? `\n…and ${more} more section${more === 1 ? '' : 's'}` : '');
      const ok = window.confirm(
        `These sections already have content that will be permanently removed:\n\n${list}\n\nDelete them?`
      );
      if (!ok) return;
    }

    try {
      const applied = applyStructureChanges(project, edits);
      const updated = { ...project, outline: applied.outline, chapters: applied.chapters };
      setProject(updated);
      // Keep the open chapter selected across a rename. Object.hasOwn because
      // chapter titles are user-controlled keys (a chapter titled "constructor"
      // must not hit Object.prototype).
      if (Object.hasOwn(applied.renamedChapters, activeChapter)) {
        setActiveChapter(applied.renamedChapters[activeChapter]);
      } else if (!Object.hasOwn(applied.chapters, activeChapter)) {
        setActiveChapter(applied.outline[0]?.title || '');
      }
      setIsStructureOpen(false);
      // Persist IMMEDIATELY (not debounced): generation reads the outline
      // server-side, so a pending debounce here would let a quick
      // "customize → generate" race serve the model a stale structure.
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      setSaveStatus('saving');
      try {
        await updateProject(updated.id, { chapters: updated.chapters, outline: updated.outline });
        if (isMountedRef.current) setSaveStatus('saved');
      } catch {
        if (isMountedRef.current) {
          setSaveStatus('unsaved');
          lastFailedProject.current = updated;
        }
      }
      showToast('Structure updated');
    } catch (e) {
      console.error('Structure apply failed:', e);
      showToast('Could not apply structure changes');
    }
  };

  // ── Error / loading ─────────────────────────────────────────────────────────
  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4 p-6">
      <AlertCircle className="h-12 w-12 text-red-500" />
      <h2 className="text-xl font-black text-slate-900">{error}</h2>
      <button onClick={() => navigate('/dashboard')} className="bg-green-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-800">
        Back to Dashboard
      </button>
    </div>
  );

  if (!project) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-10 w-10 text-green-700 animate-spin" />
        <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">Opening Document…</p>
      </div>
    </div>
  );

  const currentContent = project.chapters?.[activeChapter]?.content || '';
  const chapterDone = (t: string) => project.chapters?.[t]?.status === 'completed' && !!project.chapters?.[t]?.content;

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {showPayment && (
        <Suspense fallback={null}>
          <PaymentModal user={user} onClose={() => setShowPayment(false)} />
        </Suspense>
      )}

      {isStructureOpen && project && (
        <StructureEditor
          outline={project.outline}
          onSave={handleStructureSave}
          onClose={closeStructureEditor}
          saveDisabled={generating}
        />
      )}

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-100 bg-slate-900 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-200">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
          <span className="text-[11px] font-black uppercase tracking-widest">{toast}</span>
        </div>
      )}

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────────── */}
      <aside className={`absolute md:relative z-50 h-full w-68 bg-white border-r border-slate-100 flex flex-col shadow-2xl md:shadow-lg shrink-0 transition-transform duration-300 ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>

        {/* Header */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-100 shrink-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-slate-400 hover:text-green-700 transition-colors font-black text-[10px] uppercase tracking-widest group"
          >
            <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Library
          </button>
          <div className="flex items-center gap-1 ml-2 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 truncate max-w-20">
              {project.department}
            </span>
            <button
              onClick={() => setIsStructureOpen(true)}
              disabled={generating}
              title="Customize structure"
              aria-label="Customize chapter and section structure"
              className="shrink-0 p-1.5 text-slate-400 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-40"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* TOC */}
        <div className="flex-1 overflow-y-auto py-5 px-4 space-y-6 custom-scrollbar">
          <div>
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] mb-3 flex items-center gap-1.5">
              <BookOpen className="h-3 w-3" /> Contents
            </p>

            <div className="space-y-4">
              {project.outline.map((chapter, idx) => (
                <div key={chapter.title}>

                  {/* Chapter row */}
                  <div className="flex items-center gap-1 group/ch mb-1">
                    <button
                      onClick={() => setActiveChapter(chapter.title)}
                      className={`flex-1 text-left text-[11px] font-black uppercase tracking-wide truncate transition-all leading-snug ${
                        activeChapter === chapter.title ? 'text-green-700' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {chapterDone(chapter.title) && (
                          <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />
                        )}
                        {chapter.title}
                      </span>
                    </button>

                    {/* Generate chapter button */}
                    {generatingSection === chapter.title ? (
                      <Loader2 className="h-4 w-4 md:h-3.5 md:w-3.5 animate-spin text-green-600 shrink-0" aria-label={`Generating ${chapter.title}`} />
                    ) : (
                      <button
                        onClick={() => {
                          setActiveChapter(chapter.title);
                          setTimeout(() => handleGenerateChapter(chapter.title), 80);
                        }}
                        title={`Auto-draft ${chapter.title}`}
                        aria-label={`Auto-draft ${chapter.title}`}
                        className="shrink-0 p-1.5 md:p-1 text-green-600 bg-green-50 md:text-slate-200 md:bg-transparent hover:text-green-700 hover:bg-green-100 md:hover:text-green-600 md:hover:bg-green-50 rounded opacity-100 md:opacity-0 md:group-hover/ch:opacity-100 transition-all"
                      >
                        <Sparkles className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  {/* Section rows */}
                  <div className="pl-3 border-l border-slate-100 space-y-0.5">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={e => handleDragEnd(idx, e)}
                    >
                      <SortableContext
                        items={chapter.sections.map(s => `${chapter.title}-${s}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        {chapter.sections.map(section => (
                          <SortableSection
                            key={section}
                            id={`${chapter.title}-${section}`}
                            section={section}
                            chapterTitle={chapter.title}
                            activeChapter={activeChapter}
                            generatingSection={generatingSection}
                            onSelect={t => setActiveChapter(t)}
                            onGenerate={sec => {
                              setActiveChapter(chapter.title);
                              setTimeout(() => handleGenerateSection(sec, chapter.title), 80);
                            }}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Credits footer */}
        {!user.isPremium && (
          <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Credits</span>
              <span className="text-xl font-black text-slate-900">{user.credits}</span>
            </div>
            <button
              onClick={() => setShowPayment(true)}
              className="w-full bg-[#facc15] text-[#1a4731] py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-yellow-300 transition-all"
            >
              <Zap className="h-3 w-3 fill-current" /> Top Up
            </button>
          </div>
        )}
      </aside>

      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden" 
          onClick={() => setIsMobileSidebarOpen(false)} 
        />
      )}

      <button
        onClick={() => setIsMobileSidebarOpen(true)}
        className="md:hidden absolute bottom-6 left-6 z-30 bg-[#1a4731] text-white p-3.5 rounded-full shadow-xl hover:bg-green-800 transition-all"
      >
        <BookOpen className="h-6 w-6" />
      </button>

      {/* ── MAIN EDITOR ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <WordEditor
          value={currentContent}
          onChange={handleEdit}
          generating={generating}
          generationMode={generationMode}
          saveStatus={saveStatus}
          onRetrySave={retrySave}
          onExportDocx={() => exportToDocx(project)}
          onExportPdf={() => exportToPdf(project)}
          onOpenCopilot={() => setIsCopilotOpen(prev => !prev)}
          onCancelGeneration={() => { abortControllerRef.current?.abort(); }}
          onFetchSuggestion={handleFetchSuggestion}
          suggestionsEnabled={!generating}
          hideToolbar={isMobileSidebarOpen}
        />

        {/* ── AI Copilot panel (Enhanced) ────────────────────────────────── */}
        {isCopilotOpen && (
          <div className="absolute bottom-20 md:bottom-24 left-4 right-4 md:left-auto md:right-6 md:w-96 bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.2)] border border-slate-100 z-50 animate-in zoom-in-95 slide-in-from-bottom-4 duration-200 max-h-[70vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="bg-[#1a4731] p-1.5 rounded-lg">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">AI Assistant</span>
              </div>
              <button onClick={() => setIsCopilotOpen(false)} className="text-slate-300 hover:text-slate-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="px-5 pb-3 flex flex-wrap gap-2 shrink-0">
              {[
                { label: 'Continue writing', icon: ChevronRight, prompt: 'Continue writing from where the text left off. Maintain the same academic tone, style, and APA citation format.' },
                { label: 'Add citations', icon: BookOpen, prompt: 'Add more APA 7th edition in-text citations and references from recent Nigerian scholars to strengthen the academic argument.' },
                { label: 'Expand paragraph', icon: Sparkles, prompt: 'Expand the last paragraph with more depth, analysis, supporting evidence, and Nigerian-context examples.' },
                { label: 'Write conclusion', icon: CheckCircle2, prompt: 'Write a concluding paragraph that summarizes the key arguments, findings, and implications discussed in this section.' },
              ].map(({ label, icon: Icon, prompt }) => (
                <button
                  key={label}
                  onClick={() => setCopilotQuery(prompt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-green-50 hover:border-green-200 hover:text-green-700 transition-all"
                >
                  <Icon className="h-3 w-3" /> {label}
                </button>
              ))}
            </div>

            {/* Context indicator */}
            <div className="px-5 pb-2 shrink-0">
              <p className="text-[9px] text-slate-400 font-medium">
                Working on: <span className="font-bold text-slate-600">{activeChapter}</span>
                {' · '}{(currentContent.length / 1000).toFixed(1)}k chars
              </p>
            </div>

            {/* Custom instruction textarea */}
            <div className="px-5 pb-5 flex flex-col gap-3">
              <textarea
                value={copilotQuery}
                onChange={e => setCopilotQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); handleCopilot(); } }}
                placeholder="Or type a custom instruction... (Ctrl+Enter to send)"
                className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-green-700 outline-none resize-none"
              />
              <button
                onClick={handleCopilot}
                disabled={!copilotQuery.trim() || generating}
                className="w-full bg-[#1a4731] text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-green-800 transition-all disabled:opacity-50"
              >
                <Send className="h-3 w-3" /> Generate Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectEditor;