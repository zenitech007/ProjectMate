import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Loader2, Wand2, ChevronRight, BookOpen,
  AlertCircle, Zap, GripVertical, Bot, Send, Sparkles, X, CheckCircle2
} from 'lucide-react';
import { UserProfile, Project, ProjectOutline } from '../../types';
import {
  generateChapterContentStream,
  generateSectionContentStream,
  elaborateContentStream
} from '../../services/geminiService';
import { cleanHTML } from '../../services/htmlCleaner';
import { exportToDocx, exportToPdf } from '../../services/exportService';
import { useFirestore } from '../../hooks/useFirestore';
import PaymentModal from '../Payments/PaymentModal';
import WordEditor from './WordEditor';
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
  const titleHTML = `<h1>${chapterTitle.toUpperCase()}</h1>`;
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
  const pageBreak = existing.trim()
    ? '<div data-page-break="" class="pm-page-break"></div>'
    : '';
  // Section heading (h2), then cleaned body (AI should not repeat the heading)
  const sectionHTML = `<h2>${sectionTitle}</h2>${cleanHTML(bodyHTML)}`;
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
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-200 hover:text-slate-400 shrink-0 touch-none"
      >
        <GripVertical className="h-3 w-3" />
      </span>
      <button
        onClick={() => onSelect(chapterTitle)}
        className={`flex-1 text-left text-[10px] truncate transition-colors leading-relaxed ${activeChapter === chapterTitle
            ? 'text-green-700 font-bold'
            : 'text-slate-400 hover:text-slate-700 font-medium'
          }`}
      >
        {section}
      </button>
      {generatingSection === section ? (
        <Loader2 className="h-3 w-3 animate-spin text-green-600 shrink-0" />
      ) : (
        <button
          onClick={e => { e.stopPropagation(); onGenerate(section); }}
          title={`Generate "${section}"`}
          className="shrink-0 p-1 text-slate-200 hover:text-green-600 hover:bg-green-50 rounded opacity-0 group-hover/s:opacity-100 transition-all"
        >
          <Wand2 className="h-3 w-3" />
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
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showPayment, setShowPayment] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const isCancelled = useRef(false);
  const generationLockRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const lastGeneratedHtml = useRef<string | null>(null);
  const lastExportContext = useRef<{
    type: 'chapter' | 'section';
    chapter: string;
    section?: string;
    html: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
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

        const cleanProject = { ...proj, outline: cleanOutline };
        setProject(cleanProject);

        // Always just set the active chapter — never auto-generate. User must explicitly trigger.
        const firstChapter = cleanOutline[0]?.title || '';
        // If a chapter was pending, still select it but do NOT auto-generate
        const pending = Object.values(cleanProject.chapters || {}).find(c => c.status === 'pending');
        setActiveChapter(pending ? pending.title : firstChapter);
      })
      .catch(() => setError("Failed to load project. Please try again."));
  }, [projectId]);

  // Clear lastGeneratedHtml when switching chapters to prevent stale exports
  useEffect(() => {
    lastGeneratedHtml.current = null;
    lastExportContext.current = null;
  }, [activeChapter]);

  // ── Autosave ────────────────────────────────────────────────────────────────
  const triggerAutosave = useCallback((updated: Project) => {
    setSaveStatus('saving');
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(async () => {
      try {
        await updateProject(updated.id, { chapters: updated.chapters, outline: updated.outline });
        setSaveStatus('saved');
      } catch {
        setSaveStatus('unsaved');
      }
    }, 2500);
  }, [updateProject]);

  // ── Access gate ─────────────────────────────────────────────────────────────
  const checkAccess = (): boolean => {
    const t = activeChapter.toUpperCase();
    const isFreeChapter = t.includes('CHAPTER 1') || t.includes('CHAPTER ONE');
    if (!isFreeChapter && user.credits < 1 && !user.isPremium) {
      setShowPayment(true);
      return false;
    }
    return true;
  };

  // ADD this helper — generates a chapter by title without relying on activeChapter state timing:
  const handleGenerateChapterForChapter = async (chapterTitle: string) => {
    if (!project || generationLockRef.current) return;
    const t = chapterTitle.toUpperCase();
    const isFreeChapter = t.includes('CHAPTER 1') || t.includes('CHAPTER ONE');
    if (!isFreeChapter && user.credits < 1 && !user.isPremium) { setShowPayment(true); return; }

    generationLockRef.current = true;
    setGenerating(true);
    setGeneratingSection(chapterTitle);
    isCancelled.current = false;

    try {
      let streamedBody = '';
      await generateChapterContentStream(project.topic, chapterTitle, project.department, chunk => {
        if (isCancelled.current) throw new Error('CANCELLED');
        streamedBody = chunk;
        const html = wrapChapterContent(chapterTitle, streamedBody);
        lastGeneratedHtml.current = html; // ← store only the new chapter HTML
        lastExportContext.current = {
          type: 'chapter',
          chapter: chapterTitle,
          html
        };
        setProject(prev => {
          if (!prev) return prev;
          const chapters = { ...prev.chapters };
          chapters[chapterTitle] = { title: chapterTitle, content: html, status: 'completed' };
          return { ...prev, chapters };
        });
      });
      setProject(current => { if (current) triggerAutosave(current); return current; });
      showToast('Chapter generated');
    } catch (e: any) {
      if (e.message !== 'CANCELLED') showToast('Generation interrupted');
    } finally {
      setGenerating(false);
      setGeneratingSection(null);
      generationLockRef.current = false;
    }
  };

  // ── Generate a specific section without relying on activeChapter state ──────
  const handleGenerateSectionForChapter = async (chapterTitle: string, sectionTitle: string) => {
    if (!project || generationLockRef.current) return;
    const t = chapterTitle.toUpperCase();
    const isFreeChapter = t.includes('CHAPTER 1') || t.includes('CHAPTER ONE');
    if (!isFreeChapter && user.credits < 1 && !user.isPremium) { setShowPayment(true); return; }

    generationLockRef.current = true;
    setGenerating(true);
    setGeneratingSection(sectionTitle);
    isCancelled.current = false;

    const existing = project.chapters[chapterTitle]?.content || '';

    try {
      let streamedBody = '';
      await generateSectionContentStream(
        project.topic,
        chapterTitle,
        sectionTitle,
        project.department,
        chunk => {
          if (isCancelled.current) throw new Error('CANCELLED');
          streamedBody = chunk;
          const sectionHtml = `<h2>${sectionTitle}</h2>${cleanHTML(streamedBody)}`;
          lastGeneratedHtml.current = sectionHtml; // ← store only new section HTML
          lastExportContext.current = {
            type: 'section',
            chapter: chapterTitle,
            section: sectionTitle,
            html: sectionHtml
          };
          // appendSection adds the heading once — AI must NOT repeat it
          const html = appendSection(existing, sectionTitle, streamedBody);
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[chapterTitle] = { title: chapterTitle, content: html, status: 'completed' };
            return { ...prev, chapters };
          });
        }
      );
      setProject(current => { if (current) triggerAutosave(current); return current; });
      showToast(`"${sectionTitle}" generated`);
    } catch (e: any) {
      if (e.message !== 'CANCELLED') showToast('Generation interrupted');
    } finally {
      setGenerating(false);
      setGeneratingSection(null);
      generationLockRef.current = false;
    }
  };

  // ── Manually generate entire active chapter ─────────────────────────────────
  const handleGenerateChapter = async () => {
    if (!project || !checkAccess() || generationLockRef.current) return;
    generationLockRef.current = true;
    setGenerating(true);
    setGeneratingSection(activeChapter);
    isCancelled.current = false;

    try {
      let streamedBody = '';
      await generateChapterContentStream(
        project.topic,
        activeChapter,
        project.department,
        chunk => {
          if (isCancelled.current) throw new Error('CANCELLED');
          streamedBody = chunk;
          const html = wrapChapterContent(activeChapter, streamedBody);
          lastGeneratedHtml.current = html; // ← update lastGeneratedHtml
          lastExportContext.current = {
            type: 'chapter',
            chapter: activeChapter,
            html
          };
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[activeChapter] = { title: activeChapter, content: html, status: 'completed' };
            return { ...prev, chapters };
          });
        }
      );
      setProject(current => { if (current) triggerAutosave(current); return current; });
      showToast('Chapter generated');
    } catch (e: any) {
      if (e.message !== 'CANCELLED') showToast('Generation interrupted');
    } finally {
      setGenerating(false);
      setGeneratingSection(null);
      generationLockRef.current = false;
    }
  };

  // ── Generate a specific section (appends with page break) ──────────────────
  const handleGenerateSection = async (sectionTitle: string) => {
    if (!project || !checkAccess()) return;
    setGenerating(true);
    setGeneratingSection(sectionTitle);
    isCancelled.current = false;

    const existing = project.chapters[activeChapter]?.content || '';

    try {
      let streamedBody = '';
      await generateSectionContentStream(
        project.topic,
        activeChapter,
        sectionTitle,
        project.department,
        chunk => {
          if (isCancelled.current) throw new Error('CANCELLED');
          streamedBody = chunk;
          const sectionHtml = `<h2>${sectionTitle}</h2>${cleanHTML(streamedBody)}`;
          lastGeneratedHtml.current = sectionHtml; // ← store only new section HTML
          lastExportContext.current = {
            type: 'section',
            chapter: activeChapter,
            section: sectionTitle,
            html: sectionHtml
          };
          // appendSection adds the heading once — AI must NOT repeat it
          const html = appendSection(existing, sectionTitle, streamedBody);
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[activeChapter] = { title: activeChapter, content: html, status: 'completed' };
            return { ...prev, chapters };
          });
        }
      );
      setProject(current => { if (current) triggerAutosave(current); return current; });
      showToast(`"${sectionTitle}" generated`);
    } catch (e: any) {
      if (e.message !== 'CANCELLED') showToast('Generation interrupted');
    } finally {
      setGenerating(false);
      setGeneratingSection(null);
    }
  };

  // ── AI Copilot ──────────────────────────────────────────────────────────────
  const handleCopilot = async () => {
    if (!copilotQuery.trim() || !project) return;
    setGenerating(true);
    setIsCopilotOpen(false);
    lastGeneratedHtml.current = null;
    lastExportContext.current = null;
    const existing = project.chapters[activeChapter]?.content || '';

    try {
      let streamedBody = '';
      await elaborateContentStream(
        project.topic,
        `Instruction: ${copilotQuery}\nContext: ${existing}`,
        chunk => {
          streamedBody = chunk;
          const pageBreak = existing.trim()
            ? '<div data-page-break="" class="pm-page-break"></div>'
            : '';
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[activeChapter] = {
              title: activeChapter,
              content: existing + pageBreak + cleanHTML(streamedBody),
              status: 'completed'
            };
            return { ...prev, chapters };
          });
        }
      );
      setCopilotQuery('');
      setProject(current => { if (current) triggerAutosave(current); return current; });
    } catch (e) {
      console.error('Copilot error:', e);
    } finally {
      setGenerating(false);
    }
  };

  // ── Manual edit ─────────────────────────────────────────────────────────────
  const handleEdit = (val: string) => {
    if (!project) return;
    lastGeneratedHtml.current = null; // Clear so exports fall back to full edited content
    lastExportContext.current = null;
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

  // ── Reorder outline sections ─────────────────────────────────────────────────
  const handleDragEnd = (chapterIdx: number, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !project) return;
    const ch = project.outline[chapterIdx];
    const prefix = `${ch.title}-`;
    const oldIdx = ch.sections.indexOf((active.id as string).replace(prefix, ''));
    const newIdx = ch.sections.indexOf((over.id as string).replace(prefix, ''));
    const newSections = arrayMove(ch.sections, oldIdx, newIdx);
    const newOutline = [...project.outline];
    newOutline[chapterIdx] = { ...ch, sections: newSections };
    const updated = { ...project, outline: newOutline };
    setProject(updated);
    triggerAutosave(updated);
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
      {showPayment && <PaymentModal user={user} onClose={() => setShowPayment(false)} />}

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-100 bg-slate-900 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-200">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
          <span className="text-[11px] font-black uppercase tracking-widest">{toast}</span>
        </div>
      )}

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────────── */}
      <aside className="w-68 bg-white border-r border-slate-100 flex flex-col shadow-lg z-40 shrink-0">

        {/* Header */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-100 shrink-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-slate-400 hover:text-green-700 transition-colors font-black text-[10px] uppercase tracking-widest group"
          >
            <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Library
          </button>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 truncate max-w-24 ml-2">
            {project.department}
          </span>
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
                      className={`flex-1 text-left text-[11px] font-black uppercase tracking-wide truncate transition-all leading-snug ${activeChapter === chapter.title ? 'text-green-700' : 'text-slate-600 hover:text-slate-900'
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
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-green-600 shrink-0" />
                    ) : (
                      <button
                        onClick={() => {
                          setActiveChapter(chapter.title);
                          handleGenerateChapterForChapter(chapter.title);
                        }}
                        title={`Auto-draft ${chapter.title}`}
                        className="shrink-0 p-1 text-slate-200 hover:text-green-600 hover:bg-green-50 rounded opacity-0 group-hover/ch:opacity-100 transition-all"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
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
                              handleGenerateSectionForChapter(chapter.title, sec);
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

      {/* ── MAIN EDITOR ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <WordEditor
          value={currentContent}
          onChange={handleEdit}
          generating={generating}
          saveStatus={saveStatus}
          activeChapter={activeChapter}
          onExportDocx={() => {
            let exportHtml = '';
            let exportOutline: ProjectOutline[] = [];

            if (lastExportContext.current) {
              const ctx = lastExportContext.current;

              exportHtml = ctx.html;

              exportOutline = [{
                title: ctx.type === 'chapter'
                  ? ctx.chapter
                  : ctx.section || ctx.chapter,
                sections: []
              }];
            } else {
              // fallback = full chapter (manual edits)
              exportHtml = project.chapters?.[activeChapter]?.content || '';

              exportOutline = project.outline.filter(ch => ch.title === activeChapter);
            }

            const exportProject = {
              ...project,
              outline: exportOutline,
              chapters: {
                [activeChapter]: {
                  title: activeChapter,
                  content: exportHtml,
                  status: 'completed' as const,
                }
              }
            };

            exportToDocx(exportProject);
          }}
          onExportPdf={() => {
            let exportHtml = '';
            let exportOutline: ProjectOutline[] = [];

            if (lastExportContext.current) {
              const ctx = lastExportContext.current;
              exportHtml = ctx.html;
              exportOutline = [{
                title: ctx.type === 'chapter'
                  ? ctx.chapter
                  : ctx.section || ctx.chapter,
                sections: []
              }];
            } else {
              exportHtml = project.chapters?.[activeChapter]?.content || '';
              exportOutline = project.outline.filter(ch => ch.title === activeChapter);
            }

            const exportProject = {
              ...project,
              outline: exportOutline,
              chapters: {
                [activeChapter]: {
                  title: activeChapter,
                  content: exportHtml,
                  status: 'completed' as const,
                }
              }
            };

            exportToPdf(exportProject);
          }}
          onOpenCopilot={() => setIsCopilotOpen(true)}
          onCancelGeneration={() => { isCancelled.current = true; }}
        />

        {/* ── AI Copilot panel ──────────────────────────────────────────── */}
        {isCopilotOpen && (
          <div className="absolute bottom-6 right-6 w-80 bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.2)] border border-slate-100 p-5 z-50 animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between mb-4">
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
            <textarea
              value={copilotQuery}
              onChange={e => setCopilotQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCopilot(); }}
              placeholder="E.g. Write a conclusion for this section… (Ctrl+Enter to send)"
              className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-green-700 outline-none resize-none mb-3"
            />
            <button
              onClick={handleCopilot}
              disabled={!copilotQuery.trim() || generating}
              className="w-full bg-[#1a4731] text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-green-800 transition-all disabled:opacity-50"
            >
              <Send className="h-3 w-3" /> Generate Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectEditor;