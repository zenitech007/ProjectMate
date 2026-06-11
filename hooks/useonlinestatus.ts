import { useState, useEffect } from 'react';

/**
 * Returns true when the browser believes it has a working network connection.
 *
 * Uses two complementary APIs:
 *   1. navigator.onLine  — instant read on load
 *   2. window online/offline events — keeps the value up-to-date
 *
 * Note: navigator.onLine can return true even when the connection is poor
 * (e.g. a hotel captive portal). For AI generation we do a separate
 * reachability check before streaming — this hook is for UI feedback only.
 */
export const useOnlineStatus = (): boolean => {
    const [isOnline, setIsOnline] = useState<boolean>(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
};