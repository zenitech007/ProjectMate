
import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  FileText,
  Clock,
  ChevronRight,
  BookOpen,
  Zap,
  Loader2,
  Trash2,
  LayoutDashboard,
  History,
  GraduationCap,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  Bookmark,
  X,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { UserProfile, TopicHistoryItem } from '../../types';
import { useFirestore } from '../../hooks/useFirestore';

interface DashboardProps {
  user: UserProfile;
}

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const navigate = useNavigate();
  const { projects, topicHistory, loading, deleteProject } = useFirestore(user.uid);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{id: string, topic: string} | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const toastTimer = useRef<number | null>(null);

  const handleHistorySelect = (item: TopicHistoryItem) => {
    navigate('/wizard', { state: { prefilledHistory: item } });
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  };

  const handleDeleteClick = (e: React.MouseEvent, projectId: string, topic: string) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDelete({ id: projectId, topic });
  };

  const confirmDeletion = async () => {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteProject(confirmDelete.id);
      showToast('Project deleted successfully');
    } catch (err) {
      showToast('Failed to delete project. Please try again.', 'error');
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const filteredProjects = projects.filter(p => 
    p.topic.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-3 duration-200">
          {toast.type === 'error' ? <AlertCircle className="h-3.5 w-3.5 text-rose-400" /> : <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />}
          <span className="text-[11px] font-black uppercase tracking-widest">{toast.msg}</span>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Delete Project?</h3>
            <p className="text-slate-500 mb-6">Are you sure you want to delete "{confirmDelete.topic}"? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={confirmDeletion} disabled={deleting} className="px-5 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20 disabled:opacity-50 flex items-center gap-2">
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. PROFESSIONAL HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-0 md:h-24 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-green-700">
              <LayoutDashboard className="h-5 w-5" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Scholar Hub</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Welcome, {user.displayName?.split(' ')[0] || 'Researcher'}
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-3"></div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {projects.length} Active Manuscripts
              </span>
            </div>
            <Link
              to="/wizard"
              className="inline-flex items-center bg-[#1a4731] text-white px-6 py-3.5 rounded-2xl font-bold hover:bg-[#153a28] transition-all shadow-xl shadow-green-900/20 group"
            >
              <Plus className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform duration-300" />
              New Research
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid lg:grid-cols-12 gap-8 items-start">

          {/* 2. PRIMARY RESEARCH LIST (8 Columns) */}
          <section className="lg:col-span-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-green-50 rounded-xl">
                  <BookOpen className="h-5 w-5 text-green-700" />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">In-Progress Manuscripts</h2>
              </div>

              <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-400 focus-within:border-green-400 focus-within:ring-1 focus-within:ring-green-400 transition-all w-full sm:w-64">
                <Search className="h-4 w-4 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="SEARCH LIBRARY"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-xs font-bold uppercase tracking-widest outline-none bg-transparent w-full placeholder:text-slate-300 text-slate-700"
                />
              </div>
            </div>

            {loading ? (
              <div className="bg-white rounded-[2.5rem] border border-slate-100 p-24 flex flex-col items-center justify-center shadow-sm">
                <Loader2 className="h-10 w-10 text-green-700 animate-spin mb-4" />
                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Synchronizing Research Database...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-[3rem] p-16 text-center">
                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Bookmark className="h-10 w-10 text-slate-200" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">No Active Research</h3>
                <p className="text-slate-500 mb-8 max-w-sm mx-auto font-medium">Your academic library is currently empty. Start your first research project with our AI-guided wizard.</p>
                <Link to="/wizard" className="inline-flex items-center text-green-700 font-black text-sm uppercase tracking-widest hover:underline">
                  Initiate Research Wizard <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </Link>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-[3rem] p-16 text-center">
                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Search className="h-10 w-10 text-slate-200" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">No Results Found</h3>
                <p className="text-slate-500 max-w-sm mx-auto font-medium">We couldn't find any projects matching "{searchQuery}".</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-6">
                {filteredProjects.map((p) => (
                  <div key={p.id} className="relative group h-full">
                    <Link
                      to={`/editor/${p.id}`}
                      className="flex flex-col h-full bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:border-green-100 transition-all duration-500 overflow-hidden"
                    >
                      {/* Folder Header Decoration */}
                      <div className={`h-2 w-full ${p.status === 'completed' ? 'bg-green-600' : 'bg-amber-400'}`}></div>

                      <div className="p-8 flex flex-col h-full">
                        <div className="flex justify-between items-start mb-6">
                          <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:bg-[#1a4731] group-hover:text-white transition-all duration-300">
                            <FileText className="h-6 w-6" />
                          </div>
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] shadow-sm ${p.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                            {p.status}
                          </span>
                        </div>

                        <div className="grow mb-6">
                          <h3 className="academic-font text-lg font-bold text-slate-900 leading-tight group-hover:text-green-800 transition-colors line-clamp-2">
                            {p.topic}
                          </h3>
                          <div className="flex items-center mt-3 space-x-2">
                            <div className="bg-slate-50 px-2 py-1 rounded-lg flex items-center">
                              <GraduationCap className="h-3 w-3 text-slate-400 mr-1.5" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.department}</span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                          <div className="flex items-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
                            <Clock className="h-3 w-3 mr-1.5" />
                            {new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                          <div className="flex items-center text-green-700 text-xs font-black uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                            Open Folio <ChevronRight className="h-3 w-3 ml-1" />
                          </div>
                        </div>
                      </div>
                    </Link>

                    <button
                      onClick={(e) => handleDeleteClick(e, p.id, p.topic)}
                      className="absolute top-6 right-6 p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 z-20"
                      title="Delete Project"
                      aria-label={`Delete project: ${p.topic}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. INTELLIGENCE & STATS SIDEBAR (4 Columns) */}
          <aside className="lg:col-span-4 space-y-8">

            {/* PREMIUN / CREDITS MODULE */}
            <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-10">
                  <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md">
                    <Zap className="h-6 w-6 text-[#facc15] fill-[#facc15]" />
                  </div>
                  {user.isPremium ? (
                    <div className="bg-green-500/20 text-green-400 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border border-green-500/30">
                      Premium Scholar
                    </div>
                  ) : (
                    <div className="bg-white/10 text-white/60 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em]">
                      Free Access
                    </div>
                  )}
                </div>

                <div className="space-y-1 mb-8">
                  <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Available Power</p>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-6xl font-black tracking-tighter">{user.credits}</span>
                    <span className="text-white/40 font-bold text-sm uppercase">Credits</span>
                  </div>
                </div>

                <Link
                  to="/upgrade"
                  className="w-full py-4 bg-[#facc15] text-slate-900 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center hover:bg-white transition-all shadow-xl shadow-[#facc15]/10"
                >
                  Top Up Research Power
                </Link>
              </div>

              {/* Decorative elements */}
              <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-[#facc15]/10 rounded-full blur-[60px] group-hover:bg-[#facc15]/20 transition-all duration-700"></div>
              <div className="absolute top-0 left-0 w-full h-full bg-linear-to-br from-white/5 to-transparent pointer-events-none"></div>
            </div>

            {/* RESEARCH LOGS (HISTORY) */}
            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-slate-50 rounded-lg">
                    <History className="h-4 w-4 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Research Logs</h3>
                </div>
              </div>

              {topicHistory.length === 0 ? (
                <div className="text-center py-10 opacity-40">
                  <div className="h-12 w-12 bg-slate-50 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <History className="h-6 w-6 text-slate-300" />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Recent Searches</p>
                </div>
              ) : (
                <div className="space-y-0 relative">
                  {/* Vertical timeline line */}
                  <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-100"></div>

                  <div className="space-y-4 relative">
                    {topicHistory.slice(0, 5).map((item, idx) => (
                      <div
                        key={item.id}
                        onClick={() => handleHistorySelect(item)}
                        className="pl-10 relative group cursor-pointer"
                      >
                        {/* Dot */}
                        <div className="absolute left-3 top-2 w-2 h-2 rounded-full bg-slate-200 border-2 border-white ring-4 ring-transparent group-hover:ring-green-50 group-hover:bg-green-600 transition-all"></div>

                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-transparent group-hover:border-green-100 group-hover:bg-white transition-all">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.department}</p>
                          <p className="text-xs font-bold text-slate-600 group-hover:text-green-700 transition-colors line-clamp-1">{item.topics[0]?.title || 'Research Session'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {topicHistory.length > 5 && (
                    <button
                      onClick={() => setShowFullHistory(true)}
                      className="w-full mt-6 py-3.5 bg-slate-50 hover:bg-green-50 text-slate-500 hover:text-green-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center group border border-transparent hover:border-green-100"
                    >
                      View Complete Logs ({topicHistory.length}) <ChevronRight className="h-3 w-3 ml-1.5 group-hover:translate-x-1 transition-transform" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* QUICK TIP / STATUS */}
            <div className="bg-[#1a4731] rounded-4xl p-6 text-white/90">
              <div className="flex items-start space-x-4">
                <SlidersHorizontal className="h-5 w-5 text-green-400 mt-1" />
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest mb-1 text-green-400">Scholar Note</h4>
                  <p className="text-[11px] leading-relaxed font-medium text-white/70 italic">
                    All generated chapters use APA 7th Edition as the default referencing standard. Ensure you cross-reference with your faculty's specific handbook.
                  </p>
                </div>
              </div>
            </div>

          </aside>
        </div>
      </main>

      {/* FULL RESEARCH LOGS MODAL */}
      {showFullHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowFullHistory(false)}
          ></div>
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative z-10 max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 sm:p-8 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-green-50 rounded-xl">
                  <History className="h-5 w-5 text-green-700" />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Complete Research Logs</h2>
              </div>
              <button
                onClick={() => setShowFullHistory(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                {topicHistory.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setShowFullHistory(false);
                      handleHistorySelect(item);
                    }}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-2xl border border-slate-100 hover:border-green-200 hover:shadow-md hover:bg-green-50/30 transition-all cursor-pointer"
                  >
                    <div className="flex-1 min-w-0 mb-3 sm:mb-0 pr-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-[10px] font-black text-green-700 uppercase tracking-widest bg-green-100/50 px-2.5 py-1 rounded-full">
                          {item.department}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-700 group-hover:text-green-800 transition-colors line-clamp-2">
                        {item.topics[0]?.title || 'Research Session'}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm border border-slate-100 group-hover:border-green-200 group-hover:bg-green-600 group-hover:text-white text-slate-400 transition-all shrink-0">
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
