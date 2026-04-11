import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronRight, ChevronLeft, Sparkles, Loader2, BookCheck,
  User, IdCard, GraduationCap, ListChecks,
  PenTool, Edit3, RefreshCw, Home, ArrowRight, CheckCircle2
} from 'lucide-react';
import { doc, runTransaction, collection, serverTimestamp, increment } from 'firebase/firestore';
import { InstitutionType, Faculty, Departments, UserProfile, ProjectOutline, Chapter, TopicHistoryItem } from '../../types';
import { generateTopics, generateOutline } from '../../services/geminiService';
import { useFirestore } from '../../hooks/useFirestore';
import { db } from '../../firebase';
import PaymentModal from '../Payments/PaymentModal';

interface ProjectWizardProps { user: UserProfile; }
type GenerationMode = 'outline_only' | 'start_ch1'; // 'full_project' removed per requirement

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
  const [genMode, setGenMode] = useState<GenerationMode>('start_ch1');

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
      setLoading(false); // Always resets, even on error
    }
  };

  const handleTopicSelect = async (topicTitle: string) => {
    if (!topicTitle.trim()) return;
    setSelectedTopic(topicTitle);
    setLoading(true);
    const result = await generateOutline(topicTitle);
    setOutline(result);
    setLoading(false);
    setStep(3); // Jump straight to Identity setup
  };

  const handleFinishWizard = async () => {
    if (user.credits < 1) {
      setShowPayment(true);
      return;
    }
    setSaving(true);
    try {
      const chapterMap: Record<string, Chapter> = {};

      // Strict mapping based on the newly generated outline
      outline.forEach(ch => {
        let status: Chapter['status'] = 'empty';
        // Only trigger pending for Chapter 1 if selected
        if (genMode === 'start_ch1' && ch.title.toUpperCase().includes('CHAPTER 1')) {
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
        institutionName: institutionName.trim() || 'N/A', // Allow N/A if they used custom topic
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
          throw new Error("Insufficient credits.");
        }
        const newProjectRef = doc(projectsCollectionRef);
        transaction.update(userRef, {
          credits: increment(-1),
          lifetime_projects: increment(1)
        });
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
    <div className="flex items-center justify-center space-x-2 mb-10">
      {[1, 2, 3, 4].map((num) => (
        <div key={num} className="flex items-center">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= num ? 'bg-green-700 text-white shadow-md shadow-green-900/20' : 'bg-slate-200 text-slate-400'}`}>
            {step > num ? <CheckCircle2 className="h-4 w-4" /> : num}
          </div>
          {num !== 4 && <div className={`w-8 h-1 rounded-full mx-2 ${step > num ? 'bg-green-700' : 'bg-slate-200'}`} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {showPayment && <PaymentModal user={user} onClose={() => setShowPayment(false)} />}

      {/* Universal Header */}
      <div className="flex items-center justify-between mb-8">
        {step === 1 ? (
          <button onClick={() => navigate('/dashboard')} className="flex items-center text-slate-400 hover:text-green-700 font-bold text-sm transition-colors">
            <Home className="h-4 w-4 mr-2" /> Back to Dashboard
          </button>
        ) : (
          <button onClick={() => setStep(step - 1)} disabled={loading} className="flex items-center text-slate-400 hover:text-green-700 font-bold text-sm transition-colors disabled:opacity-50">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </button>
        )}
      </div>

      <Stepper />

      {/* STEP 1: Topic Selection (Custom OR Generate) */}
      {step === 1 && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Project Topic</h1>
            <p className="text-slate-500 font-medium mt-2">Do you have an approved topic, or do you need ideas?</p>
          </div>

          {/* Option A: Custom Topic */}
          <div className="bg-white p-8 rounded-4xl shadow-xl shadow-slate-200/50 border border-green-700/30 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-green-700"></div>
            <div className="flex items-center mb-4">
              <div className="bg-green-100 p-2 rounded-xl mr-3"><BookCheck className="h-6 w-6 text-green-700" /></div>
              <h2 className="text-xl font-bold text-slate-800">Option A: I already have a topic</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 mt-4">
              <input
                placeholder="Type your exact approved project topic here..."
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                className="grow p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none font-medium text-slate-800 placeholder:text-slate-400"
              />
              <button
                onClick={() => handleTopicSelect(customTopic)}
                disabled={!customTopic.trim() || loading}
                className="bg-green-700 text-white px-8 py-4 sm:py-0 rounded-2xl font-black hover:bg-green-800 disabled:opacity-50 transition-all flex items-center justify-center shrink-0 shadow-lg shadow-green-900/20"
              >
                {loading && selectedTopic === customTopic ? <Loader2 className="animate-spin h-5 w-5 mx-auto" /> : (
                  <>Use Topic <ArrowRight className="ml-2 h-5 w-5" /></>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center opacity-50 py-2">
            <div className="h-px bg-slate-300 w-1/3"></div>
            <span className="px-4 font-black text-slate-400 uppercase tracking-widest text-xs">OR</span>
            <div className="h-px bg-slate-300 w-1/3"></div>
          </div>

          {/* Option B: AI Generation Setup */}
          <div className="bg-white p-8 md:p-10 rounded-4xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="flex items-center mb-6">
              <div className="bg-blue-50 p-2 rounded-xl mr-3"><Sparkles className="h-6 w-6 text-blue-600" /></div>
              <h2 className="text-xl font-bold text-slate-800">Option B: Generate tailored topics</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Institution Type</label>
                <select value={institutionType} onChange={(e) => setInstitutionType(e.target.value as InstitutionType)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none font-medium text-slate-700">
                  <option value="">Select Type</option>
                  {Object.values(InstitutionType).map((t) => <option key={t as string} value={t as string}>{t as string}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Institution Name</label>
                <input placeholder="e.g. University of Lagos" value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none font-medium text-slate-700" />
              </div>
            </div>

            <div className="space-y-6 mt-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Faculty</label>
                  <button onClick={toggleManualFaculty} className="text-[10px] font-bold text-green-700 hover:text-green-800 flex items-center"><Edit3 className="h-3 w-3 mr-1" />{isManualFaculty ? 'Select from list' : "Can't find your Faculty?"}</button>
                </div>
                {isManualFaculty ? (
                  <input placeholder="Type your Faculty name" value={faculty} onChange={(e) => setFaculty(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none" />
                ) : (
                  <select value={faculty} onChange={(e) => setFaculty(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none">
                    <option value="">Select Faculty</option>
                    {Faculty.map((f: string) => <option key={f} value={f}>{f}</option>)}
                  </select>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Department</label>
                  {!isManualFaculty && (
                    <button onClick={() => setIsManualDepartment(!isManualDepartment)} className="text-[10px] font-bold text-green-700 hover:text-green-800 flex items-center"><Edit3 className="h-3 w-3 mr-1" />{isManualDepartment ? 'Select from list' : "Can't find your Department?"}</button>
                  )}
                </div>
                {isManualDepartment || isManualFaculty ? (
                  <input placeholder="Type your Department name" value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none disabled:opacity-50" disabled={!faculty} />
                ) : (
                  <select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none disabled:opacity-50" disabled={!faculty}>
                    <option value="">Select Department</option>
                    {faculty && Departments[faculty as keyof typeof Departments]?.map((d: string) => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}
              </div>
            </div>

            <button
              onClick={handleFetchTopics}
              // STRICT CHECK: Disables button if any value is empty spaces
              disabled={loading || !institutionType || !institutionName.trim() || !faculty.trim() || !department.trim()}
              className="mt-8 w-full bg-slate-800 text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center hover:bg-slate-900 transition-all disabled:opacity-50 disabled:bg-slate-300"
            >
              {loading ? <Loader2 className="animate-spin h-6 w-6 mr-2" /> : <Sparkles className="mr-2 h-6 w-6" />}
              Generate AI Topics
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Pick Generated Topic */}
      {step === 2 && (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Select a Topic</h1>
            <p className="text-slate-500 font-medium mt-2">Here are 5 custom suggestions based on your department.</p>
          </div>
          <div className="grid gap-4">
            <div className="flex justify-end mb-2">
              <button onClick={handleFetchTopics} disabled={loading} className="text-xs font-bold text-slate-500 flex items-center hover:text-slate-800 disabled:opacity-50 bg-white border border-slate-200 px-4 py-2 rounded-full shadow-sm transition-all">
                {loading && selectedTopic === '' ? <Loader2 className="animate-spin h-3 w-3 mr-2" /> : <RefreshCw className="h-3 w-3 mr-2" />} Regenerate List
              </button>
            </div>

            {topics.map((t, i) => (
              <button
                key={i} onClick={() => handleTopicSelect(t.title || (t as any))} disabled={loading}
                className="bg-white p-6 md:p-8 border-2 border-slate-100 rounded-3xl text-left hover:border-green-600 hover:shadow-xl hover:-translate-y-1 transition-all group disabled:opacity-50 flex items-center justify-between"
              >
                <h3 className="text-lg font-bold text-slate-800 group-hover:text-green-700 pr-4 leading-tight">{t.title || (t as any)}</h3>
                {loading && selectedTopic === (t.title || (t as any)) ? (
                  <Loader2 className="animate-spin h-6 w-6 text-green-700 shrink-0" />
                ) : (
                  <ChevronRight className="h-6 w-6 text-slate-300 group-hover:text-green-700 transition-colors shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: Identity Setup */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Project Identity</h1>
            <p className="text-slate-500 font-medium mt-2">Who is authoring this research?</p>
          </div>

          <div className="grid gap-6 bg-white p-10 rounded-4xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Student Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-4.5 h-5 w-5 text-slate-400" />
                <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="e.g. ADEBAYO Samuel Ogun" className="w-full pl-12 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none font-medium" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Matric Number</label>
              <div className="relative">
                <IdCard className="absolute left-4 top-4.5 h-5 w-5 text-slate-400" />
                <input value={matricNumber} onChange={(e) => setMatricNumber(e.target.value)} placeholder="e.g. ENG/18/0123" className="w-full pl-12 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none font-medium" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Supervisor Name</label>
              <div className="relative">
                <GraduationCap className="absolute left-4 top-4.5 h-5 w-5 text-slate-400" />
                <input value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="e.g. Dr. J. O. OKAFOR" className="w-full pl-12 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none font-medium" />
              </div>
            </div>

            <button
              onClick={() => setStep(4)}
              // STRICT CHECK: Disables button if fields are just empty spaces
              disabled={!studentName.trim() || !matricNumber.trim() || !supervisorName.trim()}
              className="mt-8 w-full bg-green-700 text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center hover:bg-green-800 transition-all disabled:opacity-50 disabled:bg-slate-300 shadow-xl shadow-green-900/10"
            >
              Continue to Workspace <ChevronRight className="ml-2 h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Workflow Selection */}
      {step === 4 && (
        <div className="grow flex flex-col h-full space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
          <div className="text-center mb-4">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Final Step</h1>
            <p className="text-slate-500 font-medium mt-2">How would you like the AI to initialize your editor?</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-4">
            <button onClick={() => setGenMode('outline_only')} className={`p-8 rounded-4xl border-2 transition-all flex flex-col items-center justify-center text-center space-y-4 ${genMode === 'outline_only' ? 'border-green-700 bg-green-50 shadow-xl shadow-green-900/10 scale-105' : 'border-slate-100 hover:border-slate-200 bg-white'}`}>
              <div className={`p-4 rounded-2xl ${genMode === 'outline_only' ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <ListChecks className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-lg">Empty Outline</h3>
                <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed max-w-xs mx-auto">Sets up the exact University structure, leaving all chapters blank for you to write manually.</p>
              </div>
            </button>

            <button onClick={() => setGenMode('start_ch1')} className={`p-8 rounded-4xl border-2 transition-all flex flex-col items-center justify-center text-center space-y-4 ${genMode === 'start_ch1' ? 'border-green-700 bg-green-50 shadow-xl shadow-green-900/10 scale-105' : 'border-slate-100 hover:border-slate-200 bg-white'}`}>
              <div className={`p-4 rounded-2xl ${genMode === 'start_ch1' ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <PenTool className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-lg">Auto-Draft Chapter 1</h3>
                <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed max-w-xs mx-auto">Sets up the structure and generates a comprehensive academic draft for your Introduction.</p>
              </div>
            </button>
          </div>

          <div className="bg-slate-900 text-white p-8 rounded-4xl shadow-2xl">
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2 bg-white/10 rounded-lg">
                <BookCheck className="h-5 w-5 text-green-400" />
              </div>
              <h4 className="font-black text-xs text-white uppercase tracking-[0.2em]">Generated Thesis Structure</h4>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 max-h-48 overflow-y-auto pr-4 custom-scrollbar">
              {outline.map((ch, i) => (
                <div key={i} className="flex items-center p-3 bg-white/5 rounded-xl border border-white/10 text-xs font-bold text-slate-300">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-3 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                  <span className="truncate">{ch.title}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <button
              onClick={handleFinishWizard}
              disabled={saving}
              className="w-full bg-green-700 text-white py-6 rounded-4xl font-black text-xl hover:bg-green-800 transition-all flex items-center justify-center shadow-2xl shadow-green-900/20 disabled:opacity-70 group"
            >
              {saving ? (
                <Loader2 className="animate-spin h-7 w-7 mr-3" />
              ) : (
                <>
                  {user.credits < 1 ? 'Top Up Credits to Continue' : `Launch Project Editor (1 Credit)`}
                  <ChevronRight className="ml-3 h-7 w-7 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectWizard;