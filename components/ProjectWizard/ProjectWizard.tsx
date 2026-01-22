
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronRight, ChevronLeft, Sparkles, Loader2, BookCheck, 
  AlertCircle, User, IdCard, GraduationCap
} from 'lucide-react';
import { InstitutionType, Faculty, Departments, UserProfile, Project, ProjectOutline } from '../../types';
import { generateTopics, generateOutline } from '../../services/geminiService';
import { useFirestore } from '../../hooks/useFirestore';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../firebase';
import PaymentModal from '../Payments/PaymentModal';

interface ProjectWizardProps {
  user: UserProfile;
}

const ProjectWizard: React.FC<ProjectWizardProps> = ({ user }) => {
  const navigate = useNavigate();
  const { createProject } = useFirestore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  
  const [institutionType, setInstitutionType] = useState<InstitutionType | ''>('');
  const [institutionName, setInstitutionName] = useState('');
  const [faculty, setFaculty] = useState<string>('');
  const [department, setDepartment] = useState('');

  const [studentName, setStudentName] = useState(user.displayName || '');
  const [matricNumber, setMatricNumber] = useState('');
  const [supervisorName, setSupervisorName] = useState('');

  const [topics, setTopics] = useState<{title: string, brief: string}[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [outline, setOutline] = useState<ProjectOutline[]>([]);

  // Fetches trending research topics based on school and department
  const handleFetchTopics = async () => {
    if (!institutionName || !faculty || !department) return;
    setLoading(true);
    const result = await generateTopics(institutionType, institutionName, faculty, department);
    setTopics(result);
    setLoading(false);
    setStep(2);
  };

  // Selects a topic and generates the standard Nigerian project outline
  const handleTopicSelect = async (topic: string) => {
    setSelectedTopic(topic);
    setLoading(true);
    const result = await generateOutline(topic);
    setOutline(result);
    setLoading(false);
    setStep(3);
  };

  const handleFinishWizard = async () => {
    // CREDIT CHECK: Prevent creation if balance is 0
    if (user.credits < 1) {
      setShowPayment(true);
      return;
    }

    setSaving(true);
    try {
      const newProjectData: Omit<Project, 'id'> = {
        userId: user.uid,
        topic: selectedTopic,
        studentName: studentName,
        matricNumber: matricNumber,
        supervisorName: supervisorName,
        institutionType: institutionType as InstitutionType,
        institutionName: institutionName,
        faculty: faculty,
        department: department,
        content: {},
        outline: outline,
        settings: { showPageNumbers: true, showHeader: true, academicFormat: 'standard' },
        status: 'draft',
        createdAt: Date.now()
      };

      const projectId = await createProject(newProjectData);
      
      // ATOMIC DECREMENT: Deduct 1 credit and increment lifetime count
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { 
        credits: increment(-1),
        lifetime_projects: increment(1)
      });

      navigate(`/editor/${projectId}`);
    } catch (e) {
      alert("Failed to initialize project.");
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
            <h1 className="text-3xl font-bold text-slate-900">Start Your Project</h1>
            <p className="text-slate-500">Enter your academic details to generate research topics.</p>
          </div>
          <div className="grid gap-4 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Institution Type</label>
              <select 
                value={institutionType} 
                onChange={(e) => setInstitutionType(e.target.value as InstitutionType)}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-700 outline-none"
              >
                <option value="">Select Institution Type</option>
                {Object.values(InstitutionType).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Institution Name</label>
              <input 
                placeholder="e.g. University of Lagos"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-700 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Faculty</label>
              <select 
                value={faculty} 
                onChange={(e) => setFaculty(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-700 outline-none"
              >
                <option value="">Select Faculty</option>
                {Faculty.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Department</label>
              <select 
                value={department} 
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-700 outline-none disabled:bg-slate-50"
                disabled={!faculty}
              >
                <option value="">Select Department</option>
                {faculty && Departments[faculty]?.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <button 
              onClick={handleFetchTopics}
              disabled={loading || !department || !institutionName}
              className="mt-4 w-full bg-green-700 text-white py-4 rounded-xl font-bold flex items-center justify-center hover:bg-green-800 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Sparkles className="mr-2 h-5 w-5" />}
              Generate Research Topics
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setStep(1)} className="flex items-center text-slate-500 hover:text-green-700 font-bold">
              <ChevronLeft className="h-5 w-5 mr-1" /> Back
            </button>
            <h2 className="text-2xl font-bold">Select a Research Topic</h2>
          </div>
          <div className="grid gap-4">
            {topics.map((t, i) => (
              <button 
                key={i}
                onClick={() => handleTopicSelect(t.title)}
                className="bg-white p-6 border border-slate-200 rounded-2xl text-left hover:border-green-700 hover:shadow-md transition-all group"
              >
                <h3 className="font-bold text-slate-900 group-hover:text-green-700 mb-2">{t.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{t.brief}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {step === 3 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setStep(2)} className="flex items-center text-slate-500 hover:text-green-700 font-bold">
              <ChevronLeft className="h-5 w-5 mr-1" /> Back
            </button>
            <h2 className="text-2xl font-bold">Title Page Details</h2>
          </div>
          
          <div className="grid gap-4 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Student Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input 
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. ADEBayo Samuel Ogun"
                  className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-700 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Matric Number</label>
              <div className="relative">
                <IdCard className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input 
                  value={matricNumber}
                  onChange={(e) => setMatricNumber(e.target.value)}
                  placeholder="e.g. ENG/18/0123"
                  className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-700 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Supervisor Name</label>
              <div className="relative">
                <GraduationCap className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input 
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  placeholder="e.g. Dr. J. O. OKAFOR"
                  className="w-full pl-10 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-700 outline-none"
                />
              </div>
            </div>

            <button 
              onClick={() => setStep(4)}
              disabled={!studentName || !matricNumber || !supervisorName}
              className="mt-4 w-full bg-green-700 text-white py-4 rounded-xl font-bold flex items-center justify-center hover:bg-green-800 transition-all disabled:opacity-50"
            >
              Continue to Outline
              <ChevronRight className="ml-2 h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      
      {step === 4 && (
        <div className="flex-grow flex flex-col h-full space-y-6">
           <div className="flex items-center justify-between mb-4">
            <button onClick={() => setStep(3)} className="flex items-center text-slate-500 hover:text-green-700 font-bold">
              <ChevronLeft className="h-5 w-5 mr-1" /> Back
            </button>
            <h2 className="text-2xl font-bold">Project Outline</h2>
          </div>
          
          <div className="space-y-4 mb-8 overflow-y-auto max-h-[500px] pr-2">
            {outline.map((ch, i) => (
              <div key={i} className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm">
                <h3 className="font-bold text-green-800 border-b border-green-50 pb-2 mb-3 uppercase text-sm tracking-wider">{ch.title}</h3>
                <ul className="space-y-2">
                  {ch.sections.map((s, si) => (
                    <li key={si} className="text-sm text-slate-600 flex items-start">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-300 mt-1.5 mr-2 flex-shrink-0"></div>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          
          <div className="mt-auto">
            {user.credits < 1 && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center text-yellow-800 text-sm">
                <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
                <span>You have <strong>0 Project Credits</strong>. You need 1 credit to initialize this project.</span>
              </div>
            )}
            
            <button 
              onClick={handleFinishWizard}
              disabled={saving}
              className="w-full bg-[#1a4731] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#153a28] transition-all flex items-center justify-center shadow-xl shadow-green-900/10 disabled:opacity-70"
            >
              {saving ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : user.credits < 1 ? 'Get Credits to Initialize' : 'Initialize (Uses 1 Credit)'}
              {!saving && <BookCheck className="ml-2 h-5 w-5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectWizard;
