
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, User, LogOut, ShieldCheck, Zap } from 'lucide-react';
import { UserProfile } from '../../types';

interface NavbarProps {
  user: UserProfile | null;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="flex items-center space-x-2">
            <div className="bg-green-700 p-1.5 rounded-lg">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">ProjectMate</span>
          </Link>

          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <Link to="/dashboard" className="text-slate-600 hover:text-green-700 font-medium">Dashboard</Link>
                {!user.isPremium && (
                  <Link 
                    to="/upgrade" 
                    className="hidden md:flex items-center space-x-1 bg-yellow-400 text-[#1a4731] px-4 py-1.5 rounded-lg font-bold text-xs hover:bg-yellow-500 transition-all shadow-sm"
                  >
                    <Zap className="h-3.5 w-3.5 fill-current" />
                    <span>Go Premium</span>
                  </Link>
                )}
                <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-full">
                  {user.isPremium ? (
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                  ) : (
                    <User className="h-4 w-4 text-slate-500" />
                  )}
                  <span className="text-sm font-semibold text-slate-700">{user.email.split('@')[0]}</span>
                </div>
                <button
                  onClick={onLogout}
                  aria-label="Log out"
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </>
            ) : (
              <>
                <Link to="/auth" className="text-slate-600 hover:text-green-700 font-medium">Login</Link>
                <Link 
                  to="/auth" 
                  className="bg-green-700 text-white px-5 py-2 rounded-lg font-semibold hover:bg-green-800 transition-all shadow-md shadow-green-200"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
