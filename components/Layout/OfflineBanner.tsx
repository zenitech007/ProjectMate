import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, AlertCircle } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useonlinestatus';

/**
 * OfflineBanner
 *
 * Shows at the top of the screen whenever the user loses network.
 * When connectivity returns, briefly flashes a "You're back online" green banner
 * then fades out after 3 seconds — so the user gets confirmation without a
 * permanent UI element.
 *
 * Place this inside <Navbar> or just below it in App.tsx.
 */
const OfflineBanner: React.FC = () => {
    const isOnline = useOnlineStatus();
    const [showReconnected, setShowReconnected] = useState(false);
    const [wasOffline, setWasOffline] = useState(false);
    // Transient banner triggered by stream failures while navigator.onLine is
    // true — captive portals / lossy Wi-Fi / DNS hiccups.
    const [unstable, setUnstable] = useState(false);

    useEffect(() => {
        if (!isOnline) {
            setWasOffline(true);
            setShowReconnected(false);
        } else if (wasOffline) {
            // Just came back online
            setShowReconnected(true);
            const t = setTimeout(() => {
                setShowReconnected(false);
                setWasOffline(false);
            }, 3000);
            return () => clearTimeout(t);
        }
    }, [isOnline, wasOffline]);

    useEffect(() => {
        let hideTimer: ReturnType<typeof setTimeout> | null = null;
        const handler = () => {
            if (!navigator.onLine) return; // offline banner already covers it
            setUnstable(true);
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => setUnstable(false), 8000);
        };
        window.addEventListener('pm:connection-issue', handler);
        return () => {
            window.removeEventListener('pm:connection-issue', handler);
            if (hideTimer) clearTimeout(hideTimer);
        };
    }, []);

    if (isOnline && !showReconnected && !unstable) return null;

    if (showReconnected) {
        return (
            <div
                role="status"
                aria-live="polite"
                className="w-full bg-green-700 text-white text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300"
            >
                <Wifi className="h-4 w-4 shrink-0" />
                <span>You&apos;re back online. Changes will sync automatically.</span>
            </div>
        );
    }

    // Connection-issue banner (network looks online but our function calls
    // are failing). Lower priority than the offline banner — only shown
    // when navigator.onLine is true.
    if (isOnline && unstable) {
        return (
            <div
                role="status"
                aria-live="polite"
                className="w-full bg-amber-500 text-white text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300"
            >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Connection seems unstable. Some AI features may fail until your network steadies.</span>
            </div>
        );
    }

    return (
        <div
            role="alert"
            aria-live="assertive"
            className="w-full bg-amber-600 text-white text-center text-sm font-medium py-2 px-4 flex items-center justify-center gap-2"
        >
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
                You&apos;re offline. Your edits are saved locally and will sync when you reconnect.
            </span>
        </div>
    );
};

export default OfflineBanner;