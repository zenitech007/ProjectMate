import React, { useState, useCallback } from 'react';
import { X, ShieldCheck, Zap, Loader2 } from 'lucide-react';
import { usePaystackPayment } from 'react-paystack';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { app } from '../../firebase';
import { UserProfile } from '../../types';
import { PREMIUM_PRICE_NGN, PAYSTACK_PUBLIC_KEY, CREDITS_PER_PURCHASE } from '../../constants';

interface PaymentModalProps {
  user: UserProfile;
  onClose: () => void;
}

interface PaystackResponse {
  reference: string;
  status: string;
  transaction: string;
  message: string;
}

/**
 * Inner component that calls usePaystackPayment with a FRESH config on every mount.
 * This avoids the stale-closure bug where the hook captures an old reference.
 * Each time the user clicks "Pay", we bump a key to remount this component,
 * guaranteeing usePaystackPayment sees the latest reference.
 */
const PaystackTrigger: React.FC<{
  config: Record<string, any>;
  onSuccess: (response: PaystackResponse) => void;
  onClose: () => void;
}> = ({ config, onSuccess, onClose }) => {
  const initializePayment = usePaystackPayment(config as any);

  // Fire payment immediately on mount
  React.useEffect(() => {
    initializePayment({ onSuccess, onClose } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

const PaymentModal: React.FC<PaymentModalProps> = ({ user, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // payAttempt: when non-null, mounts PaystackTrigger with a fresh config
  const [payAttempt, setPayAttempt] = useState<{ ref: string; key: number } | null>(null);

  const onSuccess = useCallback((response: PaystackResponse) => {
    setSuccessMsg(`Reference: ${response.reference}. Your credits will update shortly.`);
    setLoading(false);
    setPayAttempt(null);
    setTimeout(() => {
      onClose();
    }, 3000);
  }, [onClose]);

  const onClosePayment = useCallback(() => {
    setLoading(false);
    setPayAttempt(null);
  }, []);

  const handlePay = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Server creates /payments/{reference} bound to the authenticated user,
      // returns the reference. The client cannot mint references that credit
      // someone else's account.
      const initiatePayment = httpsCallable<
        { amountKobo: number },
        { reference: string }
      >(getFunctions(app, 'us-central1'), 'initiatePayment');
      const result = await initiatePayment({ amountKobo: PREMIUM_PRICE_NGN * 100 });
      const ref = result.data?.reference;
      if (!ref) throw new Error('Server did not return a payment reference.');
      // Bump key to force remount of PaystackTrigger with the new reference
      setPayAttempt({ ref, key: Date.now() });
    } catch (e: any) {
      setLoading(false);
      setErrorMsg((e?.message || 'Could not start payment.').replace(/^Firebase: /, ''));
    }
  };

  const paystackConfig = payAttempt ? {
    reference: payAttempt.ref,
    email: user.email,
    amount: PREMIUM_PRICE_NGN * 100,
    publicKey: PAYSTACK_PUBLIC_KEY,
    currency: 'NGN',
    metadata: {
      custom_fields: [
        {
          display_name: "User ID",
          variable_name: "user_id",
          value: user.uid,
        }
      ]
    }
  } : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      {/* Mount PaystackTrigger only when paying — key forces remount per attempt */}
      {payAttempt && paystackConfig && (
        <PaystackTrigger
          key={payAttempt.key}
          config={paystackConfig}
          onSuccess={onSuccess}
          onClose={onClosePayment}
        />
      )}

      <div className="bg-white rounded-4xl shadow-2xl max-w-lg w-full overflow-hidden relative">
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-6 right-6 p-2 rounded-full bg-slate-50 text-slate-400 hover:text-slate-600 disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-8 md:p-12">
          {successMsg ? (
            <div className="flex flex-col items-center text-center py-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="bg-green-100 p-4 rounded-full mb-6">
                <ShieldCheck className="h-12 w-12 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h3>
              <p className="text-slate-500 mb-6">{successMsg}</p>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Closing window...</p>
            </div>
          ) : (
            <>
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

              {errorMsg && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
                  {errorMsg}
                </div>
              )}
              <button
                onClick={handlePay}
                disabled={loading}
                className="w-full bg-green-700 text-white py-5 rounded-2xl font-bold text-lg hover:bg-green-800 transition-all flex items-center justify-center disabled:opacity-70"
              >
                {loading ? <Loader2 className="animate-spin h-6 w-6 mr-2" /> : <ShieldCheck className="h-6 w-6 mr-2" />}
                Secure Top-up
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
