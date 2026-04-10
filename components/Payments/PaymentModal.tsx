
import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Zap, Check, Loader2 } from 'lucide-react';
import { UserProfile } from '../../types';
import { PREMIUM_PRICE_NGN, PAYSTACK_PUBLIC_KEY, CREDITS_PER_PURCHASE } from '../../constants';

interface PaymentModalProps {
  user: UserProfile;
  onClose: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ user, onClose }) => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handlePay = () => {
    setLoading(true);
    const handler = (window as any).PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: PREMIUM_PRICE_NGN * 100,
      currency: 'NGN',
      callback: async (response: any) => {
        // CRIT-2: Client-side credit granting removed.
        // Credits are now granted via a secure Paystack Webhook (Cloud Function).
        alert(`Payment successful! Reference: ${response.reference}. Your credits will be updated shortly once the transaction is verified.`);
        onClose();
      },
      onClose: () => {
        setLoading(false);
      }
    });
    handler.openIframe();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full overflow-hidden relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full bg-slate-50 text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        <div className="p-8 md:p-12">
          <div className="flex flex-col items-center text-center mb-10">
            <div className="bg-yellow-100 p-4 rounded-3xl mb-6">
              <Zap className="h-10 w-10 text-yellow-700 fill-current" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Buy Project Credits</h2>
            <p className="text-slate-500">Each purchase adds <strong>{CREDITS_PER_PURCHASE} credits</strong>. 1 credit = 1 full research project.</p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-6 mb-8 flex items-center justify-between border border-slate-100">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pricing</p>
              <h3 className="text-3xl font-extrabold text-slate-900">₦{PREMIUM_PRICE_NGN.toLocaleString()}</h3>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full uppercase">+{CREDITS_PER_PURCHASE} CREDITS</span>
            </div>
          </div>

          <button 
            onClick={handlePay}
            disabled={loading}
            className="w-full bg-green-700 text-white py-5 rounded-2xl font-bold text-lg hover:bg-green-800 transition-all flex items-center justify-center disabled:opacity-70"
          >
            {loading ? <Loader2 className="animate-spin h-6 w-6 mr-2" /> : <ShieldCheck className="h-6 w-6 mr-2" />}
            Secure Top-up
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
