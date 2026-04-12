import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, Sparkles, Loader2, BookCheck,
  User, IdCard, GraduationCap, FileText,
  Edit3, RefreshCw, Home, ArrowRight, CheckCircle2, Rocket
} from 'lucide-react';
import { doc, runTransaction, collection, serverTimestamp, increment } from 'firebase/firestore';
import { InstitutionType, Faculty, Departments, UserProfile, ProjectOutline, Chapter, TopicHistoryItem } from '../../types';
import { generateTopics, generateOutline } from '../../services/geminiService';
import { useFirestore } from '../../hooks/useFirestore';
import { db } from '../../firebase';
import PaymentModal from '../Payments/PaymentModal';

interface ProjectWizardProps { user: UserProfile; }

const ProjectWizard: React.FC<ProjectWizardProps> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addTopicHistory } = useFirestore(user.uid);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  // Step 1 State
  const [customTopic, setCustomTopic] = useState('');
  const [institutionType, setInstitutionType] = useState<InstitutionType | ''>('');
  const [institutionName, setInstitutionName] = useState('');
  const [faculty, setFaculty] = useState<string>('');
  const [department, setDepartment] = useState('');
  const [isManualFaculty, setIsManualFaculty] = useState(false);
  const [isManualDepartment, setIsManualDepartment] = useState(false);

  // Step 2 State (AI Topics)
  const [topics, setTopics] = useState<{ title: string }[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');

  // Step 3 State
  const [studentName, setStudentName] = useState(user.displayName || '');
  const [matricNumber, setMatricNumber] = useState('');
  const [supervisorName, setSupervisorName] = useState('');

  // Step 4 State
  const [outline, setOutline] = useState<ProjectOutline[]>([]);

  useEffect(() => {
    const state = location.state as { prefilledHistory?: TopicHistoryItem };
    if (state?.prefilledHistory) {
      const h = state.prefilledHistory;
      setFaculty(h.faculty);
      setDepartment(h.department);
      setTopics(h.topics.map(t => ({ title: t.title })));
      if (!Faculty.includes(h.faculty)) setIsManualFaculty(true);
      if (h.faculty && Departments[h.faculty as keyof typeof Departments] && !Departments[h.faculty as keyof typeof Departments].includes(h.department)) setIsManualDepartment(true);
      if (!Departments[h.faculty as keyof typeof Departments]) setIsManualDepartment(true);
      setStep(2);
    }
  }, [location.state]);

  const toggleManualFaculty = () => {
    const newValue = !isManualFaculty;
    setIsManualFaculty(newValue);
    setFaculty('');
    setDepartment('');
    setIsManualDepartment(newValue);
  };

  const handleFetchTopics = async () => {
    if (!institutionName.trim() || !faculty.trim() || !department.trim()) return;
    setLoading(true);
    try {
      const result = await generateTopics(institutionType, institutionName, faculty, department);
      setTopics(result);
      await addTopicHistory(faculty, department, result.map((t: any) => ({ title: t.title, brief: '' })));
      setStep(2);
    } catch (error: any) {
      alert(error.message || 'Failed to generate topics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTopicSelect = async (topicTitle: string) => {
    if (!topicTitle.trim()) return;
    setSelectedTopic(topicTitle);
    setLoading(true);
    const result = await generateOutline(topicTitle);
    
    // Filter out preliminary pages right at generation
    const filteredOutline = result.filter(ch => 
      !ch.title.toUpperCase().includes('PRELIMINARY PAGES') &&
      !ch.title.toUpperCase().includes('FRONT MATTER')
    );
    
    setOutline(filteredOutline);
    setLoading(false);
    setStep(3); 
  };

  const handleFinishWizard = async () => {
    if (user.credits < 1 && !user.isPremium) {
      setShowPayment(true);
      return;
    }
    setSaving(true);
    try {
      const chapterMap: Record<string, Chapter> = {};

      outline.forEach(ch => {
        let status: Chapter['status'] = 'empty';
        // Auto-draft chapter 1 by default
        if (ch.title.toUpperCase().includes('CHAPTER 1') || ch.title.toUpperCase().includes('CHAPTER ONE')) {
          status = 'pending';
        }
        chapterMap[ch.title] = { title: ch.title, content: '', status };
      });

      const newProjectData = {
        userId: user.uid,
        topic: selectedTopic,
        studentName: studentName.trim(),
        matricNumber: matricNumber.trim(),
        supervisorName: supervisorName.trim(),
        institutionType: institutionType as InstitutionType,
        institutionName: institutionName.trim() || 'N/A', 
        faculty: faculty.trim() || 'N/A',
        department: department.trim() || 'N/A',
        chapters: chapterMap,
        outline,
        settings: { showPageNumbers: true, showHeader: true, academicFormat: 'standard' },
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: serverTimestamp()
      };

      const userRef = doc(db, 'users', user.uid);
      const projectsCollectionRef = collection(db, 'projects');

      const projectId = await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists() || (userDoc.data() as UserProfile).credits < 1) {
          if (!user.isPremium) throw new Error("Insufficient credits.");
        }
        const newProjectRef = doc(projectsCollectionRef);
        
        if (!user.isPremium) {
          transaction.update(userRef, {
            credits: increment(-1),
            lifetime_projects: increment(1)
          });
        } else {
          transaction.update(userRef, { lifetime_projects: increment(1) });
        }
        
        transaction.set(newProjectRef, newProjectData);
        return newProjectRef.id;
      });

      navigate(`/editor/${projectId}`);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to initialize project.");
    } finally {
      setSaving(false);
    }
  };

  // UI Step Indicator Component
  const Stepper = () => (
    <div className="flex items-center justify-center mb-12">
      <div className="flex items-center w-full max-w-xl">
        {[1, 2, 3, 4].map((num) => (
          <React.Fragment key={num}>
            <div className="relative flex flex-col items-center group">
              <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-black transition-all duration-300 ${
                step >= num 
                  ? 'bg-[#1a4731] text-white shadow-[0_0_20px_rgba(26,71,49,0.3)] ring-4 ring-[#1a4731]/10' 
                  : 'bg-white border-2 border-slate-200 text-slate-400'
              }`}>
                {step > num ? <CheckCircle2 className="h-5 w-5" /> : num}
              </div>
            </div>
            {num !== 4 && (
              <div className="flex-1 px-2">
                <div className={`h-1 rounded-full transition-all duration-500 ${
                  step > num ? 'bg-[#1a4731]' : 'bg-slate-200'
                }`} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-4xl mx-auto px-4 pt-10">
        {showPayment && <PaymentModal user={user} onClose={() => setShowPayment(false)} />}

        {/* Universal Header */}
        <div className="flex items-center justify-between mb-8">
          {step === 1 ? (
            <button onClick={() => navigate('/dashboard')} className="flex items-center text-slate-500 hover:text-[#1a4731] font-bold text-sm transition-all hover:-translate-x-1">
              <Home className="h-4 w-4 mr-2" /> Back to Dashboard
            </button>
          ) : (
            <button onClick={() => setStep(step - 1)} disabled={loading} className="flex items-center text-slate-500 hover:text-[#1a4731] font-bold text-sm transition-all hover:-translate-x-1 disabled:opacity-50 disabled:hover:translate-x-0">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </button>
          )}
        </div>

        <Stepper />

        <div className="relative">
          {/* STEP 1: Topic Selection */}
          {step === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center mb-10">
                <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">Project Topic</h1>
                <p className="text-slate-500 font-medium mt-3 text-lg">Do you have an approved topic, or do you need ideas?</p>
              </div>

              {/* Option A: Custom Topic */}
              <div className="bg-white p-8 rounded-4xladow-xl shadow-slate-200/40 border border-slate-100 relative overflow-hidden group hover:border-[#1a4731]/30 transition-colors">
                <div className="absolute top-0 left-0 w-2 h-full bg-[#1a4731] opacity-80 group-hover:opacity-100 transition-opacity"></div>
                <div className="flex items-center mb-6 pl-2">
                  <div className="bg-green-50 p-2.5 rounded-xl mr-4"><BookCheck className="h-6 w-6 text-[#1a4731]" /></div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Option A: I already have a topic</h2>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-4 pl-2">
                  <input
                    placeholder="Type your exact approved project topic here..."
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    className="grow p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#1a4731] focus:bg-white outline-none font-medium text-slate-800 placeholder:text-slate-400 transition-all"
                  />
                  <button
                    onClick={() => handleTopicSelect(customTopic)}
                    disabled={!customTopic.trim() || loading}
                    className="bg-[#1a4731] text-white px-8 py-4 sm:py-0 rounded-2xl font-black hover:bg-[#113121] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition-all flex items-center justify-center shrink-0 shadow-lg shadow-[#1a4731]/20"
                  >
                    {loading && selectedTopic === customTopic ? <Loader2 className="animate-spin h-5 w-5 mx-auto" /> : (
                      <>Use Topic <ArrowRight className="ml-2 h-5 w-5" /></>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center opacity-40 py-4">
                <div className="h-px bg-slate-300 w-1/4"></div>
                <span className="px-6 font-black text-slate-500 uppercase tracking-[0.3em] text-[10px]">OR</span>
                <div className="h-px bg-slate-300 w-1/4"></div>
              </div>

              {/* Option B: AI Generation Setup */}
              <div className="bg-white p-8 md:p-10 rounded-4xl shadow-xl shadow-slate-200/40 border border-slate-100 relative overflow-hidden group hover:border-blue-500/30 transition-colors">
                <div className="absolute top-0 left-0 w-2 h-full bg-blue-600 opacity-80 group-hover:opacity-100 transition-opacity"></div>
                <div className="flex items-center mb-8 pl-2">
                  <div className="bg-blue-50 p-2.5 rounded-xl mr-4"><Sparkles className="h-6 w-6 text-blue-600" /></div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Option B: Generate tailored topics</h2>
                </div>

                <div className="grid md:grid-cols-2 gap-6 pl-2">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Institution Type</label>
                    <select value={institutionType} onChange={(e) => setInstitutionType(e.target.value as InstitutionType)} className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none font-medium text-slate-700 transition-all cursor-pointer">
                      <option value="">Select Type</option>
                      {Object.values(InstitutionType).map((t) => <option key={t as string} value={t as string}>{t as string}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Institution Name</label>
                    <input placeholder="e.g. University of Lagos" value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none font-medium text-slate-700 transition-all" />
                  </div>
                </div>

                <div className="space-y-6 mt-6 pl-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Faculty</label>
                      <button onClick={toggleManualFaculty} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center transition-colors"><Edit3 className="h-3 w-3 mr-1" />{isManualFaculty ? 'Select from list' : "Can't find it?"}</button>
                    </div>
                    {isManualFaculty ? (
                      <input placeholder="Type your Faculty name" value={faculty} onChange={(e) => setFaculty(e.target.value)} className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all" />
                    ) : (
                      <select value={faculty} onChange={(e) => setFaculty(e.target.value)} className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none cursor-pointer transition-all">
                        <option value="">Select Faculty</option>
                        {Faculty.map((f: string) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Department</label>
                      {!isManualFaculty && (
                        <button onClick={() => setIsManualDepartment(!isManualDepartment)} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center transition-colors"><Edit3 className="h-3 w-3 mr-1" />{isManualDepartment ? 'Select from list' : "Can't find it?"}</button>
                      )}
                    </div>
                    {isManualDepartment || isManualFaculty ? (
                      <input placeholder="Type your Department name" value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none disabled:opacity-50 transition-all" disabled={!faculty} />
                    ) : (
                      <select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none disabled:opacity-50 cursor-pointer transition-all" disabled={!faculty}>
                        <option value="">Select Department</option>
                        {faculty && Departments[faculty as keyof typeof Departments]?.map((d: string) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleFetchTopics}
                  disabled={loading || !institutionType || !institutionName.trim() || !faculty.trim() || !department.trim()}
                  className="mt-8 ml-2 w-[calc(100%-8px)] bg-slate-900 text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center hover:bg-slate-800 active:scale-[0.99] transition-all disabled:opacity-50 disabled:active:scale-100 shadow-xl shadow-slate-900/10"
                >
                  {loading ? <Loader2 className="animate-spin h-6 w-6 mr-2" /> : <Sparkles className="mr-2 h-6 w-6" />}
                  Generate Topics
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Pick Generated Topic */}
          {step === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="text-center mb-10">
                <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">Select a Topic</h1>
                <p className="text-slate-500 font-medium mt-3 text-lg">Here are some custom suggestions based on your department.</p>
              </div>
              <div className="max-w-3xl mx-auto">
                <div className="flex justify-end mb-4">
                  <button onClick={handleFetchTopics} disabled={loading} className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center hover:text-[#1a4731] disabled:opacity-50 bg-white border border-slate-200 px-5 py-2.5 rounded-full shadow-sm transition-all hover:shadow hover:border-[#1a4731]/30">
                    {loading && selectedTopic === '' ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />} Regenerate List
                  </button>
                </div>

                <div className="space-y-4">
                  {topics.map((t, i) => (
                    <button
                      key={i} onClick={() => handleTopicSelect(t.title || (t as any))} disabled={loading}
                      className="w-full bg-white p-6 md:p-8 border-2 border-slate-100/80 rounded-3xl text-left hover:border-[#1a4731]/60 hover:shadow-[0_8px_30px_rgba(26,71,49,0.08)] hover:-translate-y-0.5 active:translate-y-0 transition-all group disabled:opacity-50 flex items-center justify-between"
                    >
                      <h3 className="text-lg font-bold text-slate-800 group-hover:text-[#1a4731] pr-6 leading-relaxed">
                        {t.title || (t as any)}
                      </h3>
                      <div className="h-10 w-10 rounded-full bg-slate-50 group-hover:bg-green-50 flex items-center justify-center shrink-0 transition-colors">
                        {loading && selectedTopic === (t.title || (t as any)) ? (
                          <Loader2 className="animate-spin h-5 w-5 text-[#1a4731]" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-[#1a4731]" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Identity Setup */}
          {step === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="text-center mb-10">
                <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">Project Identity</h1>
                <p className="text-slate-500 font-medium mt-3 text-lg">Let's set up the cover page details.</p>
              </div>

              <div className="max-w-2xl mx-auto bg-white p-10 sm:p-12 rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100">
                <div className="space-y-8">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Student Full Name</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-slate-400 group-focus-within:text-[#1a4731] transition-colors" />
                      </div>
                      <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="e.g. ADEBAYO Samuel Ogun" className="w-full pl-12 p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#1a4731] focus:bg-white outline-none font-bold text-slate-800 transition-all placeholder:font-medium placeholder:text-slate-400" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Matric Number</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <IdCard className="h-5 w-5 text-slate-400 group-focus-within:text-[#1a4731] transition-colors" />
                      </div>
                      <input value={matricNumber} onChange={(e) => setMatricNumber(e.target.value)} placeholder="e.g. ENG/18/0123" className="w-full pl-12 p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#1a4731] focus:bg-white outline-none font-bold text-slate-800 transition-all placeholder:font-medium placeholder:text-slate-400" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Supervisor Name</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <GraduationCap className="h-5 w-5 text-slate-400 group-focus-within:text-[#1a4731] transition-colors" />
                      </div>
                      <input value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="e.g. Dr. J. O. OKAFOR" className="w-full pl-12 p-4 bg-slate-50/50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#1a4731] focus:bg-white outline-none font-bold text-slate-800 transition-all placeholder:font-medium placeholder:text-slate-400" />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setStep(4)}
                  disabled={!studentName.trim() || !matricNumber.trim() || !supervisorName.trim()}
                  className="mt-10 w-full bg-[#1a4731] text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center hover:bg-[#113121] active:scale-[0.99] transition-all disabled:opacity-50 disabled:active:scale-100 shadow-xl shadow-[#1a4731]/20 group"
                >
                  Finalize Setup <ChevronRight className="ml-2 h-6 w-6 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Review and Get Started */}
          {step === 4 && (
            <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center p-3 bg-green-100 rounded-2xl mb-6">
                  <Rocket className="h-8 w-8 text-[#1a4731]" />
                </div>
                <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">You're All Set!</h1>
                <p className="text-slate-500 font-medium mt-3 text-lg">We've built a robust academic structure specifically for your topic.</p>
              </div>

              {/* Enhanced Outline Preview */}
              <div className="bg-[#0f172a] text-white p-8 sm:p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden border border-slate-800">
                {/* Decorative gradients */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#1a4731] rounded-full mix-blend-multiply filter blur-[80px] opacity-60"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-900 rounded-full mix-blend-multiply filter blur-[80px] opacity-40"></div>
                
                <div className="relative z-10">
                  <div className="flex items-center space-x-3 mb-8 border-b border-white/10 pb-6">
                    <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm">
                      <FileText className="h-6 w-6 text-emerald-400" />
                    </div>
                    <div>
                      <h4 className="font-black text-[11px] text-slate-300 uppercase tracking-[0.2em]">Generated Thesis Structure</h4>
                      <p className="text-emerald-400 text-sm font-medium mt-1 truncate max-w-sm sm:max-w-md">{selectedTopic}</p>
                    </div>
                  </div>
                  
                  <div className="grid sm:grid-cols-2 gap-4 max-h-70 overflow-y-auto pr-2 custom-scrollbar">
                    {outline.map((ch, i) => (
                      <div key={i} className="flex items-start p-4 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                        <div className="mt-1 w-2 h-2 rounded-full bg-emerald-400 mr-3.5 shadow-[0_0_10px_rgba(52,211,153,0.6)] shrink-0"></div>
                        <span className="text-sm font-bold text-slate-200 leading-snug">{ch.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleFinishWizard}
                  disabled={saving}
                  className="w-full bg-linear-to-r from-[#1a4731] to-emerald-800 text-white py-6 rounded-3xl font-black text-xl hover:from-[#113121] hover:to-[#1a4731] active:scale-[0.99] transition-all flex items-center justify-center shadow-[0_15px_40px_rgba(26,71,49,0.3)] border border-emerald-600/30 disabled:opacity-70 group"
                >
                  {saving ? (
                    <span className="flex items-center">
                      <Loader2 className="animate-spin h-7 w-7 mr-3" /> Preparing Editor...
                    </span>
                  ) : (
                    <>
                      {(user.credits < 1 && !user.isPremium) ? 'Top Up Credits to Continue' : 'Get Started'}
                      <ArrowRight className="ml-3 h-7 w-7 group-hover:translate-x-1.5 transition-transform" />
                    </>
                  )}
                </button>
                {user.credits >= 1 && !user.isPremium && (
                  <p className="text-center text-xs font-bold text-slate-400 mt-4 uppercase tracking-widest">
                    This will use 1 project credit
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectWizard;