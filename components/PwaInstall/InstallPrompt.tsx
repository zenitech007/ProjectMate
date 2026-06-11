import React, { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

/**
 * InstallPrompt
 *
 * Shows a small banner inviting the user to install ProjectMate as a PWA.
 *
 *   Android / Desktop Chrome / Edge → uses the `beforeinstallprompt` event
 *     to trigger the native install flow when the user taps "Install".
 *
 *   iOS Safari → does NOT fire `beforeinstallprompt`. Instead we show
 *     instructions ("Tap the Share icon, then 'Add to Home Screen'")
 *     so users on iPhone can still install.
 *
 *   Dismissals are remembered in localStorage so we don't nag.
 *   If the user installs (or the app is already standalone), the banner
 *   stays hidden.
 */

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = '__pm_install_dismissed_at';
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari standalone flag
  return (window.navigator as any).standalone === true;
};

const isIos = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPhone, iPad, iPod (and iPadOS reporting as Mac with touch)
  return /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
};

const wasRecentlyDismissed = (): boolean => {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    return Date.now() - Number(v) < DISMISS_COOLDOWN_MS;
  } catch { return false; }
};

const markDismissed = () => {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
};

const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BIPEvent | null>(null);
  const [showIosTip, setShowIosTip] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Capture the beforeinstallprompt event so we can trigger it later.
  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => setDismissed(true);
    window.addEventListener('appinstalled', installedHandler);

    // iOS path — no beforeinstallprompt event. Show the tip after a short
    // delay so it doesn't fight the first paint.
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIos() && !isStandalone() && !wasRecentlyDismissed()) {
      iosTimer = setTimeout(() => setShowIosTip(true), 4000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDismissed(true);
      } else {
        markDismissed();
        setDismissed(true);
      }
    } catch {
      // Some browsers throw if prompt() is called outside a user gesture.
      // The user tapped a button so this is unlikely, but swallow safely.
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    markDismissed();
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosTip(false);
  };

  if (dismissed) return null;

  // ── Android / Chrome / Edge banner ────────────────────────────────────────
  if (deferredPrompt) {
    return (
      <div
        role="dialog"
        aria-label="Install ProjectMate"
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-sm z-[60] bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 animate-in slide-in-from-bottom-4 duration-300"
      >
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <div className="bg-green-50 p-2.5 rounded-xl shrink-0">
            <Download className="h-5 w-5 text-[#1a4731]" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-900 text-sm leading-tight">Install ProjectMate</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Add to your home screen for faster access, offline editing, and a full-screen app feel.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleInstall}
                className="bg-[#1a4731] text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-[#153a28] transition-colors flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> Install
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-2 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── iOS Safari fallback ───────────────────────────────────────────────────
  if (showIosTip) {
    return (
      <div
        role="dialog"
        aria-label="Add to home screen"
        className="fixed bottom-4 left-4 right-4 z-[60] bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 animate-in slide-in-from-bottom-4 duration-300"
      >
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="absolute top-3 right-3 p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <div className="bg-blue-50 p-2.5 rounded-xl shrink-0">
            <Share className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-slate-900 text-sm leading-tight">Install on iPhone</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Tap the <Share className="inline h-3.5 w-3.5 align-text-bottom text-blue-600" /> <strong>Share</strong> icon
              in Safari, then choose <strong>"Add to Home Screen"</strong> to install ProjectMate.
            </p>
            <button
              onClick={handleDismiss}
              className="mt-3 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default InstallPrompt;
