
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  Zap, 
  Check, 
  ChevronLeft, 
  Lock, 
  FileText, 
  Download, 
  Sparkles,
  CreditCard
} from 'lucide-react';
import { UserProfile } from '../../types';
import { PREMIUM_PRICE_NGN } from '../../constants';
import PaymentModal from '../Payments/PaymentModal';

interface UpgradePageProps {
  user: UserProfile;
}

const UpgradePage: React.FC<UpgradePageProps> = ({ user }) => {
  const navigate = useNavigate();
  const [showPayment, setShowPayment] = useState(false);

  if (user.isPremium) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="bg-green-100 p-6 rounded-full w-fit mx-auto mb-8">
          <ShieldCheck className="h-16 w-16 text-green-700" />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-4 font-serif">You are a Premium Member</h1>
        <p className="text-slate-600 mb-10 max-w-lg mx-auto leading-relaxed">
          You already have full access to all ProjectMate features, including all chapters generation and DOCX exports.
        </p>
        <button 
          onClick={() => navigate('/dashboard')}
          className="bg-[#1a4731] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#153a28] transition-all shadow-xl shadow-green-900/10"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#fdfdfb] py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <button 
          onClick={() => navigate('/dashboard')}
          className="flex items-center text-slate-400 hover:text-slate-600 font-bold text-xs uppercase tracking-widest mb-10 transition-colors"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Dashboard
        </button>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Side: Content */}
          <div className="space-y-8">
            <div className="inline-flex items-center space-x-2 bg-yellow-50 text-yellow-800 px-4 py-1.5 rounded-full border border-yellow-100 shadow-sm">
              <Sparkles className="h-4 w-4" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Upgrade Your Account</span>
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#1a4731] leading-tight font-serif">
              Unlock the <span className="text-[#2d6a4f] italic">Full Potential</span> of Your Research
            </h1>
            
            <p className="text-lg text-slate-600 leading-relaxed max-w-xl">
              Don't let the "Free Tier" limits hold back your academic excellence. Upgrade once and get everything you need to graduate with a high-quality project.
            </p>

            <div className="space-y-4">
              <BenefitItem 
                icon={<FileText className="h-5 w-5 text-green-600" />}
                title="Complete Chapters 1-5" 
                desc="Generate every section of your project, from Literature Review to Methodology and Conclusion." 
              />
              <BenefitItem 
                icon={<Download className="h-5 w-5 text-blue-600" />}
                title="Export to MS Word (.docx)" 
                desc="Download your project in a standard Word format, ready for final editing and submission." 
              />
              <BenefitItem 
                icon={<Lock className="h-5 w-5 text-purple-600" />}
                title="Preliminary Pages included" 
                desc="Title page, Declaration, Certification, Dedication, Acknowledgement, and Abstract." 
              />
              <BenefitItem 
                icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
                title="APA 7th Formatting" 
                desc="Automatic citations and a comprehensive reference list generated in the latest APA style." 
              />
            </div>
          </div>

          {/* Right Side: Pricing Card */}
          <div className="relative">
            <div className="absolute -top-10 -right-10 w-64 h-64 bg-green-200/20 rounded-full blur-3xl -z-10"></div>
            <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-yellow-100/20 rounded-full blur-3xl -z-10"></div>
            
            <div className="bg-[#1a4731] text-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 relative overflow-hidden group">
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-10">
                  <div>
                    <h3 className="text-2xl font-bold mb-2">Premium Plan</h3>
                    <p className="text-green-200/60 text-sm">One-time payment. Lifetime access.</p>
                  </div>
                  <div className="bg-[#ffffff10] p-4 rounded-2xl group-hover:scale-110 transition-transform duration-500">
                    <Zap className="h-8 w-8 text-yellow-400 fill-yellow-400" />
                  </div>
                </div>

                <div className="mb-10">
                  <div className="flex items-baseline space-x-2">
                    <span className="text-5xl font-black">₦{PREMIUM_PRICE_NGN.toLocaleString()}</span>
                    <span className="text-green-200/40 font-medium">/ per project</span>
                  </div>
                </div>

                <div className="space-y-4 mb-12">
                  <PricingCheck text="All 5 Chapters generation" />
                  <PricingCheck text="Microsoft Word Export" />
                  <PricingCheck text="PDF Export" />
                  <PricingCheck text="Preliminary Pages" />
                  <PricingCheck text="APA 7th Reference List" />
                  <PricingCheck text="Double Spacing (Nigerian Format)" />
                </div>

                <button 
                  onClick={() => setShowPayment(true)}
                  className="w-full bg-[#facc15] text-[#1a4731] py-5 rounded-2xl font-black text-xl hover:bg-[#eab308] transition-all shadow-xl shadow-yellow-900/20 flex items-center justify-center group/btn"
                >
                  <CreditCard className="mr-3 h-6 w-6 group-btn-hover:translate-x-1 transition-transform" />
                  Unlock Premium Now
                </button>
                
                <p className="text-center text-[10px] text-green-200/30 mt-6 uppercase tracking-widest font-bold">
                  Secure Checkout via Paystack
                </p>
              </div>

              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 z-0"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 z-0"></div>
            </div>
          </div>
        </div>
      </div>

      {showPayment && (
        <PaymentModal 
          user={user} 
          onClose={() => {
            setShowPayment(false);
            if (user.isPremium) navigate('/dashboard');
          }} 
        />
      )}
    </div>
  );
};

const BenefitItem = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
  <div className="flex items-start space-x-4">
    <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-100 mt-1">
      {icon}
    </div>
    <div>
      <h4 className="font-bold text-slate-900 text-sm mb-1">{title}</h4>
      <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
    </div>
  </div>
);

const PricingCheck = ({ text }: { text: string }) => (
  <div className="flex items-center space-x-3">
    <div className="bg-green-500/20 rounded-full p-1">
      <Check className="h-3 w-3 text-green-400" />
    </div>
    <span className="text-green-50 font-medium text-sm">{text}</span>
  </div>
);

export default UpgradePage;
