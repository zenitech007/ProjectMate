
import React from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileText, Clock, ChevronRight, BookOpen, Zap, Loader2 } from 'lucide-react';
import { UserProfile } from '../../types';
import { useFirestore } from '../../hooks/useFirestore';

interface DashboardProps {
  user: UserProfile;
}

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const { projects, loading } = useFirestore(user.uid);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <h1 className="text-3xl font-bold text-slate-900">Welcome, {user.displayName}</h1>
            <div className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-black flex items-center">
              <Zap className="h-3 w-3 mr-1 fill-current" />
              {user.credits} CREDITS
            </div>
          </div>
          <p className="text-slate-500">Manage your academic projects and research</p>
        </div>
        <Link 
          to="/wizard" 
          className="inline-flex items-center bg-green-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-800 transition-all shadow-lg shadow-green-100"
        >
          <Plus className="mr-2 h-5 w-5" />
          Start New Project
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 flex items-center">
              <BookOpen className="mr-2 h-5 w-5 text-green-700" />
              Your Projects
            </h2>
            <span className="text-sm font-medium text-slate-500">{projects.length} Total</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-12 bg-white rounded-3xl border border-slate-100">
              <Loader2 className="h-8 w-8 text-green-700 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
              <div className="bg-slate-50 p-4 rounded-full w-fit mx-auto mb-4">
                <FileText className="h-10 w-10 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No projects yet</h3>
              <p className="text-slate-500 mt-2 mb-6">Create your first research project using our AI wizard.</p>
              <Link to="/wizard" className="text-green-700 font-bold hover:underline">Launch Project Wizard</Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {projects.map((p) => (
                <Link 
                  key={p.id} 
                  to={`/editor/${p.id}`}
                  className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-green-200 transition-all group flex items-center justify-between"
                >
                  <div className="flex items-center space-x-4">
                    <div className="bg-green-50 p-3 rounded-xl">
                      <FileText className="h-6 w-6 text-green-700" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 group-hover:text-green-700 transition-colors">{p.topic}</h3>
                      <div className="flex items-center space-x-3 mt-1 text-sm text-slate-500">
                        <span className="flex items-center"><Clock className="h-3 w-3 mr-1" /> {new Date(p.createdAt).toLocaleDateString()}</span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded uppercase text-[10px] font-bold tracking-wider">{p.status}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-green-700 group-hover:translate-x-1 transition-all" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-xl font-bold mb-1">Project Balance</h3>
              <div className="text-4xl font-black mb-4 flex items-baseline">
                {user.credits}
                <span className="text-sm font-normal text-slate-400 ml-2">Credits Left</span>
              </div>
              
              <div className="space-y-3">
                <Link 
                  to="/upgrade"
                  className="block w-full text-center bg-yellow-400 text-slate-900 py-3 rounded-xl font-bold hover:bg-yellow-500 transition-all"
                >
                  Buy More Credits
                </Link>
                <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">1 Credit = 1 Project</p>
              </div>
            </div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-yellow-400/10 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
