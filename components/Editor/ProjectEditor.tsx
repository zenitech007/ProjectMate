import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Loader2, Wand2, ChevronRight,
  AlertCircle, Zap, GripVertical, Bot, Send, Sparkles, X
} from 'lucide-react';
import { UserProfile, Project, ProjectOutline } from '../../types';
import { generateChapterContentStream, generateSectionContentStream, elaborateContentStream } from '../../services/geminiService';
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

// ─── Sortable section row in TOC ─────────────────────────────────────────────
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
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center group/s gap-1 py-0.5"
    >
      <span {...attributes} {...listeners} className="cursor-grab text-slate-200 hover:text-slate-400 shrink-0">
        <GripVertical className="h-3 w-3" />
      </span>
      <button
        onClick={() => onSelect(chapterTitle)}
        className={`flex-1 text-left text-[10px] truncate transition-colors ${activeChapter === chapterTitle ? 'text-green-700 font-bold' : 'text-slate-400 hover:text-slate-700 font-medium'
          }`}
      >
        {section}
      </button>
      {generatingSection === section ? (
        <Loader2 className="h-3 w-3 animate-spin text-green-600 shrink-0" />
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onGenerate(section); }}
          title={`Generate ${section}`}
          className="shrink-0 p-1 text-slate-200 hover:text-green-600 hover:bg-green-50 rounded opacity-0 group-hover/s:opacity-100 transition-all"
        >
          <Wand2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const ProjectEditor: React.FC<ProjectEditorProps> = ({ user }) => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { getProject, updateProject } = useFirestore(user.uid);

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeChapter, setActiveChapter] = useState<string>('CHAPTER ONE: INTRODUCTION');
  const [generating, setGenerating] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showPayment, setShowPayment] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');

  const isCancelled = useRef(false);
  const autosaveTimer = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Load project ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    getProject(projectId)
      .then(proj => {
        if (proj) {
          // Filter out any generated outline elements that resemble preliminary pages
          const filteredOutline = proj.outline.filter(ch =>
            !ch.title.toUpperCase().includes('PRELIMINARY PAGES') &&
            !ch.title.toUpperCase().includes('FRONT MATTER')
          );

          const filteredProject = { ...proj, outline: filteredOutline };
          setProject(filteredProject);

          // If wizard set a chapter to 'pending', open it and start generating
          const pendingChapter = Object.values(filteredProject.chapters || {}).find(c => c.status === 'pending');
          if (pendingChapter) {
            setActiveChapter(pendingChapter.title);
            // Kick off generation after mount
            setTimeout(() => startChapterGeneration(filteredProject, pendingChapter.title), 500);
          } else {
            // Start directly on Chapter One (or first outline element)
            setActiveChapter(filteredOutline[0]?.title || 'CHAPTER ONE: INTRODUCTION');
          }
        } else {
          setError("Project not found or you don't have access.");
        }
      })
      .catch(() => setError("Failed to load project. Please try again."));
  }, [projectId]);

  // ── Autosave ────────────────────────────────────────────────────────────────
  const triggerAutosave = (updated: Project) => {
    if (generating) return;
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
  };

  // ── Write content into the active chapter ───────────────────────────────────
  const writeToChapter = (chapterTitle: string, html: string, status: 'completed' | 'empty' = 'completed') => {
    setProject(prev => {
      if (!prev) return prev;
      const chapters = { ...prev.chapters };
      chapters[chapterTitle] = { title: chapterTitle, content: html, status };
      return { ...prev, chapters };
    });
  };

  // ── Credit / premium gate ───────────────────────────────────────────────────
  const checkAccess = () => {
    const isFree = activeChapter.toUpperCase().includes('CHAPTER 1')
      || activeChapter.toUpperCase().includes('CHAPTER ONE');

    if (!isFree && user.credits < 1 && !user.isPremium) {
      setShowPayment(true);
      return false;
    }
    return true;
  };

  // ── Generate entire chapter (called by wizard 'pending' flag) ───────────────
  const startChapterGeneration = async (proj: Project, chapterTitle: string) => {
    if (!proj) return;
    setGenerating(true);
    setGeneratingSection(chapterTitle);
    isCancelled.current = false;
    let accumulated = '';

    try {
      await generateChapterContentStream(
        proj.topic,
        chapterTitle,
        proj.department,
        (chunk) => {
          if (isCancelled.current) throw new Error('CANCELLED');
          accumulated = chunk;
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[chapterTitle] = { title: chapterTitle, content: cleanHTML(chunk), status: 'completed' };
            return { ...prev, chapters };
          });
        }
      );
      // Final save
      setProject(current => {
        if (current) triggerAutosave(current);
        return current;
      });
    } catch (e: any) {
      if (e.message !== 'CANCELLED') console.error('Chapter generation failed:', e);
    } finally {
      setGenerating(false);
      setGeneratingSection(null);
    }
  };

  // ── Generate a specific section (appends to chapter content) ───────────────
  const handleGenerateSection = async (sectionTitle: string) => {
    if (!project || !checkAccess()) return;
    setActiveChapter(activeChapter); // ensure we're on the right chapter
    setGenerating(true);
    setGeneratingSection(sectionTitle);
    isCancelled.current = false;

    const existing = project.chapters[activeChapter]?.content || '';
    const pageBreak = existing ? '<p style="page-break-before: always;"></p>' : '';
    const header = `<h3>${sectionTitle}</h3>`;

    try {
      await generateSectionContentStream(
        project.topic,
        activeChapter,
        sectionTitle,
        project.department,
        (chunk) => {
          if (isCancelled.current) throw new Error('CANCELLED');
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[activeChapter] = {
              title: activeChapter,
              content: existing + pageBreak + header + cleanHTML(chunk),
              status: 'completed'
            };
            return { ...prev, chapters };
          });
        }
      );
      setProject(current => { if (current) triggerAutosave(current); return current; });
    } catch (e: any) {
      if (e.message !== 'CANCELLED') alert('Generation was interrupted. Please try again.');
    } finally {
      setGenerating(false);
      setGeneratingSection(null);
    }
  };

  // ── Generate entire active chapter ─────────────────────────────────────────
  const handleGenerateEntireChapter = async () => {
    if (!project || !checkAccess()) return;
    setGenerating(true);
    setGeneratingSection(activeChapter);
    isCancelled.current = false;

    try {
      await generateChapterContentStream(
        project.topic,
        activeChapter,
        project.department,
        (chunk) => {
          if (isCancelled.current) throw new Error('CANCELLED');
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[activeChapter] = { title: activeChapter, content: cleanHTML(chunk), status: 'completed' };
            return { ...prev, chapters };
          });
        }
      );
      setProject(current => { if (current) triggerAutosave(current); return current; });
    } catch (e: any) {
      if (e.message !== 'CANCELLED') alert('Generation interrupted.');
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
    const existing = project.chapters[activeChapter]?.content || '';
    const pageBreak = existing ? '<p style="page-break-before: always;"></p>' : '';

    try {
      await elaborateContentStream(
        project.topic,
        `Instruction: ${copilotQuery}\nContext: ${existing}`,
        (chunk) => {
          setProject(prev => {
            if (!prev) return prev;
            const chapters = { ...prev.chapters };
            chapters[activeChapter] = {
              title: activeChapter,
              content: existing + pageBreak + cleanHTML(chunk),
              status: 'completed'
            };
            return { ...prev, chapters };
          });
        }
      );
      setCopilotQuery('');
      setProject(current => { if (current) triggerAutosave(current); return current; });
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  // ── Manual edit ─────────────────────────────────────────────────────────────
  const handleEdit = (val: string) => {
    if (!project) return;
    setSaveStatus('unsaved');
    const chapters = { ...project.chapters };
    chapters[activeChapter] = { ...(chapters[activeChapter] || { title: activeChapter }), content: val, status: 'completed' };
    const updated = { ...project, chapters };
    setProject(updated);
    triggerAutosave(updated);
  };

  // ── Reorder outline ─────────────────────────────────────────────────────────
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

  // ── Error / loading states ──────────────────────────────────────────────────
  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
      <h2 className="text-xl font-black text-slate-900 mb-2">{error}</h2>
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

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-100">
      {showPayment && <PaymentModal user={user} onClose={() => setShowPayment(false)} />}

      {/* ── LEFT SIDEBAR: Table of Contents ─────────────────────── */}
      <aside className="w-72 bg-white border-r border-slate-100 flex flex-col shadow-xl z-40 shrink-0">

        {/* Sidebar header */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-100">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-slate-400 hover:text-green-700 transition-all font-black text-[10px] uppercase tracking-widest group"
          >
            <ChevronLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            Library
          </button>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">
              {project.department}
            </span>
          </div>
        </div>

        {/* TOC scroll area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-8">

          {/* Chapters */}
          <div>
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] mb-4 flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3" /> Chapters
            </p>
            <div className="space-y-6">
              {project.outline.map((chapter, idx) => (
                <div key={chapter.title}>
                  {/* Chapter title row */}
                  <div className="flex items-center justify-between group/ch mb-2">
                    <button
                      onClick={() => setActiveChapter(chapter.title)}
                      className={`flex-1 text-left text-[11px] font-black uppercase tracking-wide transition-all ${activeChapter === chapter.title ? 'text-green-700' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      {chapter.title}
                    </button>
                    {/* Generate entire chapter button */}
                    {generatingSection === chapter.title ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-green-600 shrink-0" />
                    ) : (
                      <button
                        onClick={() => {
                          setActiveChapter(chapter.title);
                          setTimeout(handleGenerateEntireChapter, 100);
                        }}
                        title={`Generate all of ${chapter.title}`}
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
                      onDragEnd={(e) => handleDragEnd(idx, e)}
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
                            onSelect={setActiveChapter}
                            onGenerate={(sec) => {
                              setActiveChapter(chapter.title);
                              setTimeout(() => handleGenerateSection(sec), 100);
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

        {/* Bottom: credits / upgrade */}
        {!user.isPremium && (
          <div className="p-4 border-t border-slate-100 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Credits</span>
              <span className="text-lg font-black text-slate-900">{user.credits}</span>
            </div>
            <button
              onClick={() => setShowPayment(true)}
              className="w-full bg-[#facc15] text-[#1a4731] py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center hover:bg-yellow-300 transition-all shadow-sm gap-1.5"
            >
              <Zap className="h-3 w-3 fill-current" /> Top Up Credits
            </button>
          </div>
        )}
      </aside>

      {/* ── MAIN: Word Editor ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <WordEditor
          value={currentContent}
          onChange={handleEdit}
          onExportDocx={() => exportToDocx(project)}
          onExportPdf={() => exportToPdf(project)}
          onOpenCopilot={() => setIsCopilotOpen(true)}
        />

        {/* ── AI COPILOT PANEL ─────────────────────────────────────── */}
        {isCopilotOpen && (
          <div className="absolute bottom-6 right-6 w-80 bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-slate-100 p-5 z-50 animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-[#1a4731] p-1.5 rounded-lg">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">AI Thesis Assistant</span>
              </div>
              <button onClick={() => setIsCopilotOpen(false)} className="text-slate-300 hover:text-slate-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={copilotQuery}
              onChange={(e) => setCopilotQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCopilot(); }}
              placeholder="E.g. Write a conclusion for this section... (Ctrl+Enter to send)"
              className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-green-700 outline-none resize-none mb-3"
            />
            <button
              onClick={handleCopilot}
              disabled={!copilotQuery.trim()}
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