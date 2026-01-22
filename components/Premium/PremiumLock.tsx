
import React from 'react';
import { Lock, Zap } from 'lucide-react';
import { usePremium } from '../../hooks/usePremium';

interface PremiumLockProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onUpgrade?: () => void;
}

const PremiumLock: React.FC<PremiumLockProps> = ({ children, fallback, onUpgrade }) => {
  const { isPremium, loading } = usePremium();

  if (loading) return <div className="animate-pulse bg-slate-100 h-40 rounded-3xl"></div>;

  if (isPremium) {
    return <>{children}</>;
  }

  return (
    fallback || (
      <div className="relative group overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 text-center">
        <div className="absolute inset-0 bg-slate-50/50 backdrop-blur-[2px] z-0"></div>
        <div className="relative z-10">
          <div className="bg-slate-100 p-4 rounded-full w-fit mx-auto mb-4">
            <Lock className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Premium Feature</h3>
          <p className="text-slate-500 mb-6 max-w-xs mx-auto text-sm">
            Upgrade to Premium to unlock high-quality AI generation for this section and all subsequent chapters.
          </p>
          <button 
            onClick={onUpgrade}
            className="bg-green-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-green-800 transition-all shadow-lg shadow-green-100 flex items-center justify-center mx-auto"
          >
            <Zap className="h-4 w-4 mr-2 fill-current" />
            Upgrade Now
          </button>
        </div>
      </div>
    )
  );
};

export default PremiumLock;
