
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  Sparkles, 
  Loader2, 
  Lock, 
  FileText,
  Save,
  FileDown,
  ChevronDown,
  ChevronRight,
  XCircle,
  Zap,
  Check,
  FileJson,
  GripVertical,
  Settings,
  X
} from 'lucide-react';
import { UserProfile, Project } from '../../types';
import { generateChapterContentStream, generateSectionContentStream } from '../../services/geminiService';
import { exportToDocx, exportToPdf } from '../../services/exportService';
import { useFirestore } from '../../hooks/useFirestore';
import PaymentModal from '../Payments/PaymentModal';

interface ProjectEditorProps {
  user: UserProfile;
}

const ProjectEditor: React.FC<ProjectEditorProps> = ({ user }) => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { getProject, updateProject } = useFirestore();
  const [project, setProject] = useState<Project | null>(null);
  const [activeChapter, setActiveChapter] = useState<string>('Chapter 1');
  const [generating, setGenerating] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [expandedChapter, setExpandedChapter] = useState<string | null>('Chapter 1');
  const [showPayment, setShowPayment] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draggedSection, setDraggedSection] = useState<{ chapterTitle: string, index: number } | null>(null);
  
  const isCancelled = useRef(false);
  const autosaveTimeout = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Tracks the content of the currently viewed chapter
  const currentContent = project?.content?.[activeChapter] || '';

  // Loads project data on mount
  useEffect(() => {
    if (projectId) {
      getProject(projectId).then(setProject);
    }
  }, [projectId]);

  // Autosizes textarea to match content height for an "infinite paper" feel
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [currentContent, activeChapter]);

  // Debounced autosave mechanism
  const triggerAutosave = (updatedProject: Project) => {
    setSaveStatus('saving');
    if (autosaveTimeout.current) window.clearTimeout(autosaveTimeout.current);
    
    autosaveTimeout.current = window.setTimeout(async () => {
      try {
        await updateProject(updatedProject.id, { content: updatedProject.content, settings: updatedProject.settings });
        setSaveStatus('saved');
      } catch (e) {
        setSaveStatus('unsaved');
      }
    }, 5000); 
  };

  const handleManualSave = async () => {
    if (!project) return;
    setSaveStatus('saving');
    try {
      await updateProject(project.id, { content: project.content, outline: project.outline, settings: project.settings });
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('unsaved');
      alert("Failed to save project.");
    }
  };

  const handleCancelGeneration = () => {
    isCancelled.current = true;
    setGenerating(null);
  };

  // Drag and Drop Handlers for Sections
  const handleDragStart = (chapterTitle: string, index: number) => {
    if (generating) return;
    setDraggedSection({ chapterTitle, index });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetChapterTitle: string, targetIndex: number) => {
    if (!draggedSection || !project || draggedSection.chapterTitle !== targetChapterTitle) {
      setDraggedSection(null);
      return;
    }

    const chapterIndex = project.outline.findIndex(c => c.title === targetChapterTitle);
    if (chapterIndex === -1 || draggedSection.index === targetIndex) {
      setDraggedSection(null);
      return;
    }

    const newOutline = [...project.outline];
    const newSections = [...newOutline[chapterIndex].sections];
    
    const [movedItem] = newSections.splice(draggedSection.index, 1);
    newSections.splice(targetIndex, 0, movedItem);
    
    newOutline[chapterIndex] = {
      ...newOutline[chapterIndex],
      sections: newSections
    };

    const updatedProject = { ...project, outline: newOutline };
    setProject(updatedProject);
    setSaveStatus('saving');
    
    try {
      await updateProject(project.id, { outline: newOutline });
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('unsaved');
    }
    setDraggedSection(null);
  };

  const updateSettings = (key: keyof Project['settings'], value: any) => {
    if (!project) return;
    const updatedSettings = { ...project.settings, [key]: value };
    const updatedProject = { ...project, settings: updatedSettings };
    setProject(updatedProject);
    setSaveStatus('unsaved');
    triggerAutosave(updatedProject);
  };

  // Generates a full chapter using AI
  const handleGenerateChapter = async () => {
    if (!project) return;

    const isPremiumRequired = !['Chapter 1', 'Preliminary Pages'].includes(activeChapter);
    if (!user.isPremium && isPremiumRequired) {
      setShowPayment(true);
      return;
    }

    setGenerating('chapter');
    isCancelled.current = false;

    try {
      await generateChapterContentStream(
        project.topic, 
        activeChapter, 
        project.department, 
        (chunkedText) => {
          if (isCancelled.current) throw new Error('CANCELLED');
          setProject(prev => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              content: { ...prev.content, [activeChapter]: chunkedText }
            };
            return updated;
          });
        }
      );
      
      setProject(prev => {
        if (prev) triggerAutosave(prev);
        return prev;
      });
    } catch (e: any) {
      if (e.message !== 'CANCELLED') {
        alert("Generation failed. Please check your connection.");
      }
    } finally {
      setGenerating(null);
    }
  };

  // Generates content for a specific section within a chapter
  const handleGenerateSection = async (sectionTitle: string) => {
    if (!project) return;

    const isPremiumRequired = !['Chapter 1', 'Preliminary Pages'].includes(activeChapter);
    if (!user.isPremium && isPremiumRequired) {
      setShowPayment(true);
      return;
    }

    setGenerating(sectionTitle);
    isCancelled.current = false;
    
    const currentChapterContent = project.content[activeChapter] || '';
    const sectionHeader = currentChapterContent ? `\n\n${sectionTitle.toUpperCase()}\n` : `${sectionTitle.toUpperCase()}\n`;
    
    try {
      let accumulatedText = "";
      await generateSectionContentStream(
        project.topic,
        activeChapter,
        sectionTitle,
        project.department,
        (chunk) => {
          if (isCancelled.current) throw new Error('CANCELLED');
          accumulatedText = chunk;
          setProject(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              content: { 
                ...prev.content, 
                [activeChapter]: currentChapterContent + sectionHeader + accumulatedText 
              }
            };
          });
        }
      );

      setProject(prev => {
        if (prev) triggerAutosave(prev);
        return prev;
      });
    } catch (e: any) {
      if (e.message !== 'CANCELLED') {
        alert("Section generation failed.");
      }
    } finally {
      setGenerating(null);
    }
  };

  const handleManualEdit = (val: string) => {
    if (!project) return;
    setSaveStatus('unsaved');
    const updated = {
      ...project,
      content: { ...project.content, [activeChapter]: val }
    };
    setProject(updated);
    triggerAutosave(updated);
  };

  if (!project) return (
    <div className="flex items-center justify-center min-h-[500px]">
      <div className="flex flex-col items-center">
        <Loader2 className="h-10 w-10 text-green-700 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Loading project workspace...</p>
      </div>
    </div>
  );

  const isLocked = !user.isPremium && ['Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5', 'References'].includes(activeChapter);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-100">
      {showPayment && <PaymentModal user={user} onClose={() => setShowPayment(false)} />}
      
      {/* Sidebar - Outline & Chapters */}
      <div className="w-80 bg-white border-r border-slate-200 overflow-y-auto hidden md:flex flex-col shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-green-700 transition-colors p-1 hover:bg-white rounded-lg">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="flex flex-col items-end">
             <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Workspace</span>
             <div className="flex items-center space-x-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${saveStatus === 'saving' ? 'bg-orange-400 animate-pulse' : saveStatus === 'unsaved' ? 'bg-red-400' : 'bg-green-500'}`}></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{saveStatus}</span>
             </div>
          </div>
        </div>
        
        <div className="p-4 space-y-2 flex-grow overflow-y-auto custom-scrollbar">
          {project.outline.map((chapter) => (
            <div key={chapter.title} className="space-y-1">
              <button
                onClick={() => {
                  setActiveChapter(chapter.title);
                  setExpandedChapter(expandedChapter === chapter.title ? null : chapter.title);
                }}
                disabled={!!generating}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl transition-all group disabled:opacity-50 ${
                  activeChapter === chapter.title 
                    ? 'bg-green-700 text-white shadow-lg shadow-green-100' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center overflow-hidden">
                  <FileText className={`mr-3 h-4 w-4 flex-shrink-0 ${activeChapter === chapter.title ? 'text-white' : 'text-slate-400 group-hover:text-green-600'}`} />
                  <span className="font-semibold text-sm truncate">{chapter.title}</span>
                </div>
                <div className="flex items-center space-x-1">
                  {expandedChapter === chapter.title ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </button>

              {expandedChapter === chapter.title && (
                <div className="pl-6 space-y-1 py-2 animate-in slide-in-from-top-2 duration-300">
                  {chapter.sections.map((section, idx) => (
                    <div
                      key={section}
                      draggable={!generating}
                      onDragStart={() => handleDragStart(chapter.title, idx)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(chapter.title, idx)}
                      className={`flex flex-col p-2.5 px-3 rounded-lg transition-all border mb-1 group/section cursor-move ${
                        generating === section 
                          ? 'bg-green-50 border-green-200 text-green-700' 
                          : 'border-transparent text-slate-500 hover:bg-slate-50'
                      } ${draggedSection?.index === idx && draggedSection?.chapterTitle === chapter.title ? 'opacity-40 border-green-300' : ''}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center overflow-hidden mr-2">
                          <GripVertical className="h-3 w-3 text-slate-300 mr-2 flex-shrink-0 opacity-0 group-hover/section:opacity-100 transition-opacity" />
                          <span className="text-[11px] font-medium leading-tight truncate">
                            {section}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateSection(section);
                          }}
                          disabled={!!generating}
                          className={`flex items-center space-x-1 px-2 py-1.5 rounded-md text-[9px] font-bold uppercase transition-all shadow-sm ${
                            generating === section 
                              ? 'bg-green-600 text-white' 
                              : 'bg-white border border-slate-200 text-green-700 opacity-0 group-hover/section:opacity-100 hover:bg-green-50'
                          } disabled:opacity-50 flex-shrink-0`}
                        >
                          {generating === section ? (
                            <>
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              <span>Writing...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="h-2.5 w-2.5" />
                              <span>Generate</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {!user.isPremium && (
          <div className="p-6">
            <div className="bg-slate-900 rounded-2xl p-5 text-white relative overflow-hidden shadow-2xl">
              <div className="relative z-10">
                <h4 className="font-bold text-xs mb-1 uppercase tracking-widest text-green-400">Premium Upgrade</h4>
                <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">Unlock complete chapters, references, and Microsoft Word exports.</p>
                <button 
                  onClick={() => setShowPayment(true)}
                  className="w-full bg-green-600 text-white py-2.5 rounded-lg text-xs font-bold hover:bg-green-700 transition-all flex items-center justify-center"
                >
                  Unlock Now (₦5,000)
                </button>
              </div>
              <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-green-500/20 rounded-full blur-xl"></div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area - Editor */}
      <div className="flex-1 flex flex-col min-w-0 bg-white relative">
        <div className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center space-x-4 flex-1">
            <h2 className="text-xs font-bold text-slate-900 truncate max-w-[150px] lg:max-w-xs hidden sm:block uppercase tracking-wider">
              {project.topic}
            </h2>
            <button 
              onClick={handleManualSave}
              disabled={saveStatus === 'saved' || !!generating}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${saveStatus === 'unsaved' ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-50 cursor-not-allowed'}`}
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Save Project</span>
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <div className="hidden sm:flex items-center space-x-1 mr-2">
               <button 
                  onClick={() => exportToDocx(project)}
                  disabled={!user.isPremium || !!generating}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${user.isPremium ? 'text-blue-700 bg-blue-50 hover:bg-blue-100' : 'text-slate-300 bg-slate-50 cursor-not-allowed'} disabled:opacity-50`}
                >
                  <FileDown className="h-4 w-4" />
                  <span>Word</span>
                </button>
                <button 
                  onClick={() => exportToPdf(project)}
                  disabled={!user.isPremium || !!generating}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${user.isPremium ? 'text-red-700 bg-red-50 hover:bg-red-100' : 'text-slate-300 bg-slate-50 cursor-not-allowed'} disabled:opacity-50`}
                >
                  <FileJson className="h-4 w-4" />
                  <span>PDF</span>
                </button>
            </div>
            
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="p-2.5 text-slate-400 hover:text-green-700 transition-colors bg-slate-50 border border-slate-200 rounded-xl"
            >
              <Settings className="h-5 w-5" />
            </button>

            {!generating ? (
              <button 
                onClick={handleGenerateChapter}
                disabled={!!generating || isLocked}
                className="flex items-center bg-green-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-green-800 transition-all shadow-lg shadow-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                AI Full Chapter
              </button>
            ) : (
              <button 
                onClick={handleCancelGeneration}
                className="flex items-center bg-red-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-lg shadow-red-100"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </button>
            )}
          </div>
        </div>

        {generating && (
          <div className="absolute top-16 left-0 right-0 z-20 bg-green-700 text-white px-6 py-2 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-300">
            <div className="flex items-center space-x-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs font-bold tracking-wide uppercase">AI writing: {generating === 'chapter' ? activeChapter : generating}</span>
            </div>
          </div>
        )}

        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4 sm:p-12 bg-slate-100 scroll-smooth custom-scrollbar relative"
        >
          {showSettings && (
            <div className="absolute top-4 right-4 z-40 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-slate-900 flex items-center">
                   <Settings className="h-4 w-4 mr-2" />
                   Project Settings
                </h3>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 font-medium">Page Numbers</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={project.settings.showPageNumbers}
                      onChange={(e) => updateSettings('showPageNumbers', e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-700"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 font-medium">Show Header</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={project.settings.showHeader}
                      onChange={(e) => updateSettings('showHeader', e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-700"></div>
                  </label>
                </div>
                <div className="pt-4 mt-4 border-t border-slate-100">
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                    Changes are saved automatically and will be reflected in DOCX/PDF exports.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="max-w-4xl mx-auto flex justify-center">
            {isLocked ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center shadow-xl max-w-lg mx-auto mt-20">
                <div className="bg-slate-100 p-6 rounded-full w-fit mx-auto mb-6">
                  <Lock className="h-10 w-10 text-slate-400" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">Chapter Locked</h3>
                <p className="text-slate-500 mb-8 leading-relaxed">Literature Review, Methodology, and subsequent chapters require a premium upgrade to unlock AI generation and editing.</p>
                <button 
                  onClick={() => setShowPayment(true)}
                  className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-black transition-all shadow-xl"
                >
                  Unlock Full Project (₦5,000)
                </button>
              </div>
            ) : (
              <div 
                className="bg-white shadow-2xl border border-slate-200 rounded-sm flex flex-col relative w-full overflow-hidden" 
                style={{ 
                  width: '8.27in', 
                  minHeight: '11.69in', 
                  boxShadow: '0 0 40px rgba(0,0,0,0.1)'
                }}
              >
                {project.settings.showHeader && (
                  <div className="px-[1in] py-6 border-b border-slate-50 text-[10px] text-slate-300 flex justify-between uppercase font-black tracking-widest">
                    <span className="truncate max-w-[50%]">{project.topic}</span>
                    <span>{activeChapter}</span>
                  </div>
                )}

                <div className="text-center pt-16 pb-8 border-b border-dashed border-slate-100 bg-slate-50/20 px-[1in]">
                  <h1 className="academic-font text-2xl uppercase font-bold tracking-widest leading-normal">{activeChapter}</h1>
                  <p className="academic-font text-sm uppercase tracking-[0.2em] mt-4 text-slate-400 font-bold leading-relaxed">{project.topic}</p>
                </div>

                <textarea
                  ref={textareaRef}
                  value={currentContent}
                  onChange={(e) => handleManualEdit(e.target.value)}
                  placeholder={generating ? "AI is generating content for you..." : "Type your research content here..."}
                  className="w-full px-[1in] py-12 outline-none academic-font text-justify leading-[2.2] text-[12pt] bg-transparent resize-none placeholder:text-slate-300 transition-all border-none focus:ring-0 overflow-hidden"
                  spellCheck={false}
                  style={{
                    fontFamily: "'Tinos', 'Times New Roman', serif",
                    minHeight: "8in",
                    boxSizing: 'border-box'
                  }}
                />
                
                <div className="px-[1in] py-12 mt-auto flex justify-between items-center bg-transparent border-t border-slate-50/50">
                   <div className="text-[10px] text-slate-300 uppercase font-black tracking-widest">Standard Nigerian University Project Template</div>
                   {project.settings.showPageNumbers && (
                     <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Page {activeChapter === 'Chapter 1' ? 1 : '...'}
                     </div>
                   )}
                   <div className="flex items-center text-[10px] font-bold text-slate-300 uppercase tracking-widest space-x-3">
                      {saveStatus === 'saved' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Save className="h-3.5 w-3.5" />}
                      <span>{saveStatus}</span>
                   </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectEditor;
