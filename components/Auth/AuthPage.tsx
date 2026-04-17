
import React, { useState } from 'react';
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth } from '../../firebase';

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isReset, setIsReset] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      const code = err.code || '';
      if (code === 'auth/popup-closed-by-user') {
        // User closed the popup — not an error
        setError('');
      } else if (code === 'auth/network-request-failed') {
        setError('Network error. Please check your connection.');
      } else {
        setError('Google Sign-In failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResetSent(false);

    if (isReset) {
      try {
        await sendPasswordResetEmail(auth, email);
        setResetSent(true);
      } catch (err: any) {
        console.error("RESET ERROR:", err);
        const errorMap: Record<string, string> = {
          'auth/user-not-found': 'No account found with this email address.',
          'auth/invalid-email': 'Please enter a valid email address.',
        };
        setError(errorMap[err.code] || 'Failed to send password reset email. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Strong password validation
    if (!isLogin) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters long.");
        setLoading(false);
        return;
      }
      if (!/[A-Z]/.test(password)) {
        setError("Password must contain at least one uppercase letter.");
        setLoading(false);
        return;
      }
      if (!/[0-9]/.test(password)) {
        setError("Password must contain at least one number.");
        setLoading(false);
        return;
      }
      if (!/[^A-Za-z0-9]/.test(password)) {
        setError("Password must contain at least one special character.");
        setLoading(false);
        return;
      }
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        if (userCred.user) {
          await updateProfile(userCred.user, { displayName: name });
        }
      }
    } catch (err: any) {
      console.error("AUTH ERROR:", err);
      // Map Firebase error codes to safe, user-friendly messages (prevents XSS)
      const errorMap: Record<string, string> = {
        'auth/user-not-found': 'No account found with this email address.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-credential': 'Invalid email or password. Please try again.',
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/weak-password': 'Password is too weak. Use at least 8 characters with uppercase, number, and symbol.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
      };
      setError(errorMap[err.code] || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-slate-900">{isReset ? 'Reset Password' : isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p className="text-slate-600 mt-2">{isReset ? 'Enter your email to receive a password reset link' : isLogin ? 'Login to continue your project' : 'Join thousands of Nigerian students'}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl">
            {error}
          </div>
        )}

        {resetSent && (
          <div className="mb-6 p-4 bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl">
            Password reset email sent! Check your inbox.
          </div>
        )}

        {!isReset && (
          <div className="space-y-4 mb-8">
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center space-x-3 border border-slate-200 py-3 rounded-xl hover:bg-slate-50 transition-colors font-semibold text-slate-700"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
              <span>Continue with Google</span>
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-sm uppercase"><span className="px-2 bg-white text-slate-400 font-bold">Or</span></div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {!isLogin && !isReset && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required={!isLogin}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-700 transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@unilag.edu.ng"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-700 transition-all"
              />
            </div>
          </div>

          {!isReset && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-green-700 transition-all"
                />
              </div>
            </div>
          )}

          {isLogin && !isReset && (
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => { setIsReset(true); setError(''); setResetSent(false); }}
                className="text-sm font-bold text-green-700 hover:underline focus:outline-none"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-700 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-800 transition-all flex items-center justify-center disabled:opacity-70 shadow-lg shadow-green-100"
          >
            {loading ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : (isReset ? 'Send Reset Link' : isLogin ? 'Login' : 'Sign Up')}
            {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-slate-100 text-center">
          <p className="text-slate-600">
            {isReset ? (
              <button
                onClick={() => { setIsReset(false); setIsLogin(true); setError(''); setResetSent(false); }}
                className="text-green-700 font-bold hover:underline focus:outline-none"
              >
                Back to Login
              </button>
            ) : (
              <>
                {isLogin ? "Don't have an account?" : "Already have an account?"}
                <button
                  onClick={() => { setIsLogin(!isLogin); setError(''); }}
                  className="ml-2 text-green-700 font-bold hover:underline focus:outline-none"
                >
                  {isLogin ? 'Sign Up' : 'Login'}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
