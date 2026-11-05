'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

type PWAContextValue = {
  canInstall: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
};

const PWAContext = createContext<PWAContextValue | null>(null);

function getStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export function PWAProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setIsStandalone(getStandalone());
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'development') {
      // A production service worker can otherwise cache old Next dev chunks and
      // hydrate the new page with an outdated navigation component.
      navigator.serviceWorker.getRegistrations().then(registrations =>
        Promise.all(registrations.map(registration => registration.unregister())),
      ).catch(() => undefined);
      if ('caches' in window) {
        caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('private-dashboard-static-')).map(key => caches.delete(key)))).catch(() => undefined);
      }
    } else if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((error) => console.warn('Service Worker konnte nicht registriert werden:', error));
    }

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Same-origin navigation stays inside the installed app. Cross-origin links
  // deliberately leave the standalone shell and open in the system browser.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!getStandalone() || event.defaultPrevented || event.button !== 0) return;
      const target = event.target as Element | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin === location.origin) return;
      event.preventDefault();
      window.open(url.href, '_blank', 'noopener,noreferrer');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const value = useMemo<PWAContextValue>(() => ({
    canInstall: Boolean(installPrompt),
    isStandalone,
    isIOS,
    install: async () => {
      if (!installPrompt) return 'unavailable';
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setInstallPrompt(null);
      return outcome;
    },
  }), [installPrompt, isIOS, isStandalone]);

  return (
    <PWAContext.Provider value={value}>
      {!online && (
        <div className="offline-banner" role="status">
          Offline – Dashboard-Daten werden erst nach Wiederverbindung aktualisiert.
        </div>
      )}
      {children}
    </PWAContext.Provider>
  );
}

export function usePWA() {
  const value = useContext(PWAContext);
  if (!value) throw new Error('usePWA must be used within PWAProvider');
  return value;
}
