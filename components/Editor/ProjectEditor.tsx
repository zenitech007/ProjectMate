
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, Sparkles, Loader2, Save, Wand2, Trash2, 
  FileText, FileJson, Zap, XCircle, Check, Undo2, Redo2,
  PlusCircle, BookOpen, ArrowRight, Expand, Bot, Send,
  Wand, AlertCircle
} from 'lucide-react';
import { UserProfile, Project, ProjectOutline } from '../../types';
import { generateSectionContentStream, elaborateContentStream } from '../../services/geminiService';
import { cleanHTML } from '../../services/htmlCleaner';
import { exportToDocx, exportToPdf } from '../../services/exportService';
import { useFirestore } from '../../hooks/useFirestore';
import PaymentModal from '../Payments/PaymentModal';
import WordEditor from './WordEditor';
import TableOfContents from './TableOfContents';

interface ProjectEditorProps {
  user: UserProfile;
}

const ProjectEditor: React.FC<ProjectEditorProps> = ({ user }) => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { getProject, updateProject } = useFirestore(user.uid);
  
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeChapter, setActiveChapter] = useState<string>('');
  const [generating, setGenerating] = useState<boolean>(false);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [elaborating, setElaborating] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showPayment, setShowPayment] = useState(false);
  
  // AI Copilot States
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState('');
  
  const isCancelled = useRef(false);
  const autosaveTimeout = useRef<number | null>(null);
  const quillRef = useRef<any>(null);

  useEffect(() => {
    if (projectId) {
      getProject(projectId).then(proj => {
        if (proj) {
          setProject(proj);
          setActiveChapter('Title Page');
        } else {
          setError("Project not found or you don't have access.");
        }
      }).catch(err => {
        console.error("Failed to load project:", err);
        setError("Failed to load project. Please try again.");
      });
    }
  }, [projectId]);

  const triggerAutosave = (updatedProject: Project) => {
    // BUG-12: Autosave should not trigger during streaming
    if (generating || elaborating) return;

    setSaveStatus('saving');
    if (autosaveTimeout.current) window.clearTimeout(autosaveTimeout.current);
    autosaveTimeout.current = window.setTimeout(async () => {
      try {
        await updateProject(updatedProject.id, { 
          chapters: updatedProject.chapters,
          outline: updatedProject.outline
        });
        setSaveStatus('saved');
      } catch (e) {
        setSaveStatus('unsaved');
      }
    }, 3000); 
  };

  const handleGenerateSection = async (sectionTitle: string = "Entire Section") => {
    if (!project) return;
    
    const chapters = project.chapters || {};
    const freeChapters = ['CHAPTER ONE: INTRODUCTION', 'Title Page', 'Certification', 'Dedication', 'Acknowledgement', 'Abstract'];
    const isPremiumRequired = !freeChapters.some(c => activeChapter.toUpperCase().includes(c.toUpperCase()));
    
    // Issue 14: Ensure user.credits is validated
    if (isPremiumRequired && !user.isPremium && user.credits < 1) {
      setShowPayment(true);
      return;
    }

    setGenerating(true);
    setGeneratingSection(sectionTitle);
    isCancelled.current = false;

    const baseContent = chapters[activeChapter]?.content || '';
    const sectionHeader = sectionTitle !== "Entire Section" ? `<br><h3>${sectionTitle}</h3>` : "";
    
    try {
      await generateSectionContentStream(
        project.topic,
        activeChapter,
        sectionTitle,
        project.department,
        (chunkedHTML) => {
          if (isCancelled.current) throw new Error('CANCELLED');
          setProject(prev => {
            if (!prev) return prev;
            const updatedChapters = { ...(prev.chapters || {}) };
            updatedChapters[activeChapter] = {
              ...(updatedChapters[activeChapter] || { title: activeChapter }),
              content: baseContent + sectionHeader + chunkedHTML,
              status: 'completed'
            };
            return { ...prev, chapters: updatedChapters };
          });
        }
      );
      
      setProject(current => {
        if (current) triggerAutosave(current);
        return current;
      });
    } catch (e: any) {
      if (e.message !== 'CANCELLED') alert("Generation interrupted.");
    } finally {
      setGenerating(false);
      setGeneratingSection(null);
    }
  };

  const handleCopilotDraft = async () => {
    if (!copilotQuery.trim() || !project) return;
    
    setGenerating(true);
    setIsCopilotOpen(false);
    
    const baseContent = project.chapters[activeChapter]?.content || '';
    const promptPrefix = `<br><b>AI Research Update:</b><br>`;
    
    try {
      await elaborateContentStream(
        project.topic,
        `Instruction: ${copilotQuery}. Context: ${baseContent}`,
        (chunkedHTML) => {
          setProject(prev => {
            if (!prev) return prev;
            const updatedChapters = { ...(prev.chapters || {}) };
            updatedChapters[activeChapter] = {
              ...(updatedChapters[activeChapter] || { title: activeChapter }),
              content: baseContent + promptPrefix + chunkedHTML,
              status: 'completed'
            };
            return { ...prev, chapters: updatedChapters };
          });
        }
      );
      setCopilotQuery('');
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const handleManualEdit = (val: string) => {
    if (!project) return;
    setSaveStatus('unsaved');
    
    const updatedChapters = { ...(project.chapters || {}) };
    updatedChapters[activeChapter] = {
      ...(updatedChapters[activeChapter] || { title: activeChapter }),
      content: val,
      status: 'completed'
    };
    
    const updatedProject = { ...project, chapters: updatedChapters };
    setProject(updatedProject);
    triggerAutosave(updatedProject);
  };

  const handleCleanContent = () => {
    if (!project || !project.chapters[activeChapter]) return;
    
    const currentContent = project.chapters[activeChapter].content;
    const cleaned = cleanHTML(currentContent);
    
    if (cleaned !== currentContent) {
      handleManualEdit(cleaned);
    }
  };

  const handleReorderOutline = (newOutline: ProjectOutline[]) => {
    if (!project) return;
    setSaveStatus('unsaved');
    const updatedProject = { ...project, outline: newOutline };
    setProject(updatedProject);
    triggerAutosave(updatedProject);
  };

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-6">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
      <h2 className="text-xl font-black text-slate-900 mb-2">{error}</h2>
      <button 
        onClick={() => navigate('/dashboard')}
        className="bg-green-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-800 transition-all"
      >
        Back to Dashboard
      </button>
    </div>
  );

  if (!project) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <div className="flex flex-col items-center">
        <Loader2 className="h-10 w-10 text-green-700 animate-spin mb-4" />
        <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest">Opening Document...</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-100">
      {showPayment && <PaymentModal user={user} onClose={() => setShowPayment(false)} />}
      
      {/* Sidebar: Table of Contents */}
      <div className="w-84 bg-white border-r border-slate-200 flex flex-col shadow-2xl z-40">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
          <button 
            onClick={() => navigate('/dashboard')} 
            className="flex items-center text-slate-400 hover:text-green-700 transition-all font-black text-[10px] uppercase tracking-widest group"
          >
            <ChevronLeft className="h-4 w-4 mr-1 group-hover:-translate-x-1 transition-transform" />
            Library
          </button>
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleCleanContent} 
              className="text-slate-400 hover:text-amber-600 transition-colors" 
              title="Clean & Fix HTML"
            >
              <Wand className="h-4 w-4" />
            </button>
            <button onClick={() => exportToDocx(project)} className="text-slate-400 hover:text-blue-600 transition-colors" title="Export Word">
              <FileText className="h-4 w-4" />
            </button>
            <button onClick={() => exportToPdf(project)} className="text-slate-400 hover:text-red-600 transition-colors" title="Export PDF">
              <FileJson className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <TableOfContents 
          outline={project.outline} 
          activeChapter={activeChapter} 
          onSelect={setActiveChapter} 
          onGenerateSection={handleGenerateSection}
          onReorderOutline={handleReorderOutline}
          generatingSection={generatingSection}
        />

        {!user.isPremium && (
          <div className="p-4 bg-slate-900">
            <button onClick={() => setShowPayment(true)} className="w-full bg-[#facc15] text-[#1a4731] py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center hover:bg-white transition-all shadow-xl">
              <Zap className="h-3 w-3 mr-2 fill-current" />
              Go Premium
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-slate-100">
        
        {/* Editor Wrapper */}
        <div className="flex-1 flex flex-col overflow-hidden">
           <WordEditor 
             ref={quillRef}
             value={project?.chapters?.[activeChapter]?.content || ''} 
             onChange={handleManualEdit} 
             readOnly={generating || elaborating} 
           />
           
           {/* AI COPILOT FLOATING BUTTON */}
           <div className="fixed bottom-10 right-10 z-50">
              <button 
                onClick={() => setIsCopilotOpen(!isCopilotOpen)}
                className="bg-[#1a4731] text-white p-5 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all group flex items-center space-x-3"
              >
                <Bot className="h-6 w-6 group-hover:rotate-12 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest overflow-hidden max-w-0 group-hover:max-w-xs transition-all">Draft with AI</span>
              </button>
              
              {isCopilotOpen && (
                <div className="absolute bottom-20 right-0 w-80 bg-white rounded-3xl shadow-[0_30px_100px_rgba(0,0,0,0.2)] border border-slate-100 p-6 animate-in zoom-in-90 slide-in-from-bottom-5 duration-300">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center">
                    <Sparkles className="h-3 w-3 mr-2 text-green-600" />
                    AI Thesis Assistant
                  </h4>
                  <textarea 
                    value={copilotQuery}
                    onChange={(e) => setCopilotQuery(e.target.value)}
                    placeholder="E.g. Write a conclusion for this section based on the above points..."
                    className="w-full h-24 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-green-700 outline-none resize-none mb-4"
                  />
                  <button 
                    onClick={handleCopilotDraft}
                    className="w-full bg-green-700 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center hover:bg-green-800 transition-all shadow-lg"
                  >
                    Generate Now
                    <Send className="ml-2 h-3 w-3" />
                  </button>
                </div>
              )}
           </div>

           {/* Saving Notification Overlay */}
           {generating && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center space-x-4 z-50">
               <Loader2 className="h-4 w-4 animate-spin text-green-400" />
               <span className="text-[10px] font-black uppercase tracking-widest">AI is Writing...</span>
               <button 
                 onClick={() => isCancelled.current = true}
                 className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-red-500/30"
               >
                 Cancel
               </button>
             </div>
           )}

           {saveStatus === 'saving' && (
             <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full shadow-sm border border-slate-100 flex items-center space-x-2 z-50 animate-pulse">
               <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
               <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Autosaving...</span>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default ProjectEditor;
