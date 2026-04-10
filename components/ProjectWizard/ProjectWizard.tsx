
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ChevronRight, ChevronLeft, Sparkles, Loader2, BookCheck, 
  AlertCircle, User, IdCard, GraduationCap, ListChecks, 
  PenTool, BrainCircuit, Edit3
} from 'lucide-react';
import { 
  doc, 
  runTransaction, 
  collection, 
  addDoc, 
  serverTimestamp,
  increment 
} from 'firebase/firestore';
import { InstitutionType, Faculty, Departments, UserProfile, Project, ProjectOutline, Chapter, TopicHistoryItem } from '../../types';
import { generateTopics, generateOutline } from '../../services/geminiService';
import { useFirestore } from '../../hooks/useFirestore';
import { db } from '../../firebase';
import PaymentModal from '../Payments/PaymentModal';

interface ProjectWizardProps {
  user: UserProfile;
}

type GenerationMode = 'outline_only' | 'start_ch1' | 'full_project';

const ProjectWizard: React.FC<ProjectWizardProps> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { createProject, addTopicHistory } = useFirestore(user.uid);
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  
  const [institutionType, setInstitutionType] = useState<InstitutionType | ''>('');
  const [institutionName, setInstitutionName] = useState('');
  const [faculty, setFaculty] = useState<string>('');
  const [department, setDepartment] = useState('');
  const [isManualFaculty, setIsManualFaculty] = useState(false);
  const [isManualDepartment, setIsManualDepartment] = useState(false);

  const [studentName, setStudentName] = useState(user.displayName || '');
  const [matricNumber, setMatricNumber] = useState('');
  const [supervisorName, setSupervisorName] = useState('');

  const [topics, setTopics] = useState<{title: string, brief: string}[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [outline, setOutline] = useState<ProjectOutline[]>([]);
  const [genMode, setGenMode] = useState<GenerationMode>('start_ch1');

  useEffect(() => {
    const state = location.state as { prefilledHistory?: TopicHistoryItem };
    if (state?.prefilledHistory) {
      const h = state.prefilledHistory;
      setFaculty(h.faculty);
      setDepartment(h.department);
      setTopics(h.topics);
      if (!Faculty.includes(h.faculty)) setIsManualFaculty(true);
      if (h.faculty && Departments[h.faculty] && !Departments[h.faculty].includes(h.department)) setIsManualDepartment(true);
      if (!Departments[h.faculty]) setIsManualDepartment(true);
      setStep(2);
    }
  }, [location.state]);

  const toggleManualFaculty = () => {
    const newValue = !isManualFaculty;
    setIsManualFaculty(newValue);
    setFaculty('');
    setDepartment('');
    if (newValue) {
      setIsManualDepartment(true);
    } else {
      setIsManualDepartment(false);
    }
  };

  const toggleManualDepartment = () => {
    setIsManualDepartment(!isManualDepartment);
    setDepartment('');
  };

  const handleFetchTopics = async () => {
    if (!institutionName || !faculty || !department) return;
    setLoading(true);
    const result = await generateTopics(institutionType, institutionName, faculty, department);
    setTopics(result);
    await addTopicHistory(faculty, department, result);
    setLoading(false);
    setStep(2);
  };

  const handleTopicSelect = async (topic: string) => {
    setSelectedTopic(topic);
    setLoading(true);
    const result = await generateOutline(topic);
    // Ensure References exists at the end
    const finalOutline = [...result];
    if (!finalOutline.some(ch => ch.title.toUpperCase().includes('REFERENCES'))) {
      finalOutline.push({ title: 'REFERENCES', sections: ['Academic Sources', 'Nigerian Citations'] });
    }
    setOutline(finalOutline);
    setLoading(false);
    setStep(3);
  };

  const handleFinishWizard = async () => {
    if (user.credits < 1) {
      setShowPayment(true);
      return;
    }

    setSaving(true);
    try {
      const chapterMap: Record<string, Chapter> = {};
      
      // Initialize Preliminary Chapters
      const preliminaryPages = ['Title Page', 'Certification', 'Dedication', 'Acknowledgement', 'Abstract', 'Table of Contents'];
      preliminaryPages.forEach(title => {
        chapterMap[title] = { title, content: '', status: 'empty' };
      });

      // Initialize AI Outline Chapters
      outline.forEach(ch => {
        let status: Chapter['status'] = 'empty';
        if (genMode === 'full_project') {
          status = 'pending';
        } else if (genMode === 'start_ch1' && ch.title.toLowerCase().includes('chapter 1')) {
          status = 'pending';
        }

        chapterMap[ch.title] = {
          title: ch.title,
          content: '',
          status
        };
      });

      const newProjectData = {
        userId: user.uid,
        topic: selectedTopic,
        studentName: studentName,
        matricNumber: matricNumber,
        supervisorName: supervisorName,
        institutionType: institutionType as InstitutionType,
        institutionName: institutionName,
        faculty: faculty,
        department: department,
        chapters: chapterMap,
        outline: outline,
        settings: { showPageNumbers: true, showHeader: true, academicFormat: 'standard' },
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: serverTimestamp()
      };

      // BUG-3: Atomic transaction for project creation and credit deduction
      const userRef = doc(db, 'users', user.uid);
      const projectsCollectionRef = collection(db, 'projects');

      const projectId = await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw new Error("User profile not found.");
        }

        const userData = userDoc.data() as UserProfile;
        if (userData.credits < 1) {
          throw new Error("Insufficient credits.");
        }

        const newProjectRef = doc(projectsCollectionRef);
        
        // Deduct credit and create project
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
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {showPayment && <PaymentModal user={user} onClose={() => setShowPayment(false)} />}
      
      {step === 1 && (
        <div className="space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">Setup Your Research</h1>
            <p className="text-slate-500 font-medium mt-2">Enter your academic details to generate custom topics.</p>
          </div>
          
          <div className="grid gap-6 bg-white p-8 md:p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Institution Type</label>
                <select 
                  value={institutionType} 
                  onChange={(e) => setInstitutionType(e.target.value as InstitutionType)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none transition-all font-medium text-slate-700"
                >
                  <option value="">Select Type</option>
                  {Object.values(InstitutionType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Institution Name</label>
                <input 
                  placeholder="e.g. University of Lagos"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none transition-all font-medium text-slate-700"
                />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Faculty</label>
                  <button 
                    onClick={toggleManualFaculty}
                    className="text-[10px] font-bold text-green-700 hover:text-green-800 flex items-center"
                  >
                    <Edit3 className="h-3 w-3 mr-1" />
                    {isManualFaculty ? 'Select from list' : "Can't find your Faculty?"}
                  </button>
                </div>
                {isManualFaculty ? (
                  <input 
                    placeholder="Type your Faculty name"
                    value={faculty}
                    onChange={(e) => setFaculty(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none transition-all font-medium text-slate-700"
                  />
                ) : (
                  <select 
                    value={faculty} 
                    onChange={(e) => setFaculty(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none transition-all font-medium text-slate-700"
                  >
                    <option value="">Select Faculty</option>
                    {Faculty.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Department</label>
                  {!isManualFaculty && (
                    <button 
                      onClick={toggleManualDepartment}
                      className="text-[10px] font-bold text-green-700 hover:text-green-800 flex items-center"
                    >
                      <Edit3 className="h-3 w-3 mr-1" />
                      {isManualDepartment ? 'Select from list' : "Can't find your Department?"}
                    </button>
                  )}
                </div>
                {isManualDepartment || isManualFaculty ? (
                  <input 
                    placeholder="Type your Department name"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none transition-all font-medium text-slate-700 disabled:opacity-50"
                    disabled={!faculty}
                  />
                ) : (
                  <select 
                    value={department} 
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none transition-all font-medium text-slate-700 disabled:bg-slate-50 disabled:opacity-50"
                    disabled={!faculty}
                  >
                    <option value="">Select Department</option>
                    {faculty && Departments[faculty]?.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                )}
              </div>
            </div>

            <button 
              onClick={handleFetchTopics}
              disabled={loading || !department || !faculty || !institutionName}
              className="mt-4 w-full bg-green-700 text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center hover:bg-green-800 transition-all disabled:opacity-50 shadow-xl shadow-green-900/10"
            >
              {loading ? <Loader2 className="animate-spin h-6 w-6 mr-2" /> : <Sparkles className="mr-2 h-6 w-6" />}
              Generate Research Topics
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setStep(1)} className="flex items-center text-slate-400 hover:text-green-700 font-black text-xs uppercase tracking-widest transition-colors">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </button>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Pick Your Topic</h2>
          </div>
          <div className="grid gap-6">
            {topics.map((t, i) => (
              <button 
                key={i}
                onClick={() => handleTopicSelect(t.title)}
                className="bg-white p-8 border border-slate-200 rounded-[2rem] text-left hover:border-green-700 hover:shadow-xl transition-all group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-2 h-full bg-green-700 opacity-0 group-hover:opacity-100 transition-all"></div>
                <h3 className="text-xl font-black text-slate-900 group-hover:text-green-700 mb-3 leading-tight">{t.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">{t.brief}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {step === 3 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setStep(2)} className="flex items-center text-slate-400 hover:text-green-700 font-black text-xs uppercase tracking-widest transition-colors">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </button>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Project Identity</h2>
          </div>
          
          <div className="grid gap-6 bg-white p-10 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Student Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-4.5 h-5 w-5 text-slate-400" />
                <input 
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. ADEBayo Samuel Ogun"
                  className="w-full pl-12 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none font-medium"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Matric Number</label>
              <div className="relative">
                <IdCard className="absolute left-4 top-4.5 h-5 w-5 text-slate-400" />
                <input 
                  value={matricNumber}
                  onChange={(e) => setMatricNumber(e.target.value)}
                  placeholder="e.g. ENG/18/0123"
                  className="w-full pl-12 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none font-medium"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Supervisor Name</label>
              <div className="relative">
                <GraduationCap className="absolute left-4 top-4.5 h-5 w-5 text-slate-400" />
                <input 
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  placeholder="e.g. Dr. J. O. OKAFOR"
                  className="w-full pl-12 p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-green-700 outline-none font-medium"
                />
              </div>
            </div>

            <button 
              onClick={() => setStep(4)}
              disabled={!studentName || !matricNumber || !supervisorName}
              className="mt-4 w-full bg-green-700 text-white py-5 rounded-2xl font-black text-lg flex items-center justify-center hover:bg-green-800 transition-all disabled:opacity-50 shadow-xl shadow-green-900/10"
            >
              Continue to Workflow
              <ChevronRight className="ml-2 h-6 w-6" />
            </button>
          </div>
        </div>
      )}
      
      {step === 4 && (
        <div className="flex-grow flex flex-col h-full space-y-8">
           <div className="flex items-center justify-between">
            <button onClick={() => setStep(3)} className="flex items-center text-slate-400 hover:text-green-700 font-black text-xs uppercase tracking-widest transition-colors">
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </button>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Choose Your Workflow</h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 mb-4">
             <button 
                onClick={() => setGenMode('outline_only')}
                className={`p-8 rounded-[2rem] border-2 transition-all flex flex-col items-center text-center space-y-4 ${genMode === 'outline_only' ? 'border-green-700 bg-green-50 shadow-xl shadow-green-900/5' : 'border-slate-100 hover:border-slate-200 bg-white'}`}
             >
                <div className={`p-4 rounded-2xl ${genMode === 'outline_only' ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-400'}`}>
                   <ListChecks className="h-8 w-8" />
                </div>
                <div>
                   <h3 className="font-black text-slate-900">Outline Only</h3>
                   <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-black leading-relaxed">Setup table of contents structure</p>
                </div>
             </button>

             <button 
                onClick={() => setGenMode('start_ch1')}
                className={`p-8 rounded-[2rem] border-2 transition-all flex flex-col items-center text-center space-y-4 ${genMode === 'start_ch1' ? 'border-green-700 bg-green-50 shadow-xl shadow-green-900/5' : 'border-slate-100 hover:border-slate-200 bg-white'}`}
             >
                <div className={`p-4 rounded-2xl ${genMode === 'start_ch1' ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-400'}`}>
                   <PenTool className="h-8 w-8" />
                </div>
                <div>
                   <h3 className="font-black text-slate-900">Start Chapter 1</h3>
                   <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-black leading-relaxed">Auto-generate Chapter 1 Draft</p>
                </div>
             </button>

             <button 
                onClick={() => setGenMode('full_project')}
                className={`p-8 rounded-[2rem] border-2 transition-all flex flex-col items-center text-center space-y-4 ${genMode === 'full_project' ? 'border-green-700 bg-green-50 shadow-xl shadow-green-900/5' : 'border-slate-100 hover:border-slate-200 bg-white'}`}
             >
                <div className={`p-4 rounded-2xl ${genMode === 'full_project' ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-400'}`}>
                   <BrainCircuit className="h-8 w-8" />
                </div>
                <div>
                   <h3 className="font-black text-slate-900">Full Project</h3>
                   <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-black leading-relaxed">Sequential AI Drafting for all chapters</p>
                </div>
             </button>
          </div>

          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl">
             <div className="flex items-center space-x-3 mb-6">
                <div className="p-2 bg-white/10 rounded-lg">
                  <ListChecks className="h-5 w-5 text-green-400" />
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
          
          <div className="mt-auto">
            <button 
              onClick={handleFinishWizard}
              disabled={saving}
              className="w-full bg-green-700 text-white py-6 rounded-[2rem] font-black text-xl hover:bg-green-800 transition-all flex items-center justify-center shadow-2xl shadow-green-900/20 disabled:opacity-70 group"
            >
              {saving ? (
                <Loader2 className="animate-spin h-7 w-7 mr-3" />
              ) : (
                <>
                  {user.credits < 1 ? 'Get More Credits' : `Initialize Project (1 Credit)`}
                  <BookCheck className="ml-3 h-7 w-7 group-hover:scale-110 transition-transform" />
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
