import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, User, LogOut, ShieldCheck, Zap } from 'lucide-react';
import { UserProfile } from '../../types';

interface NavbarProps {
  user: UserProfile | null;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
    onLogout();
  };

  return (
    <>
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
                  <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-full">
                    {user.isPremium ? (
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <User className="h-4 w-4 text-slate-500" />
                    )}
                    <span className="hidden sm:block text-sm font-semibold text-slate-700">{user.email.split('@')[0]}</span>
                  </div>
                  <button
                    onClick={() => setShowLogoutModal(true)}
                    aria-label="Log out"
                    className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
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

      {/* CONFIRM LOGOUT MODAL */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Sign Out?</h3>
            <p className="text-slate-500 mb-6">Are you sure you want to log out of your account?</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowLogoutModal(false)} 
                className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmLogout} 
                className="px-5 py-2.5 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;