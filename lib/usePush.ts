'use client';
// Web Push opt-in for this device. Shared by the planner's bell and the
// finance price alerts; the server side is lib/push.ts.
import { useCallback, useEffect, useState } from 'react';

type State = 'loading' | 'unsupported' | 'install' | 'denied' | 'off' | 'on';

function keyBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

async function save(sub: PushSubscription) {
  const res = await fetch('/api/push-subscriptions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
  if (!res.ok) throw new Error('Gerät konnte nicht gespeichert werden.');
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  // In development PWAProvider removes the worker; register it on demand here.
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
}

export function usePush() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!supported) { setState(ios && !standalone() ? 'install' : 'unsupported'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    const on = Boolean(sub && Notification.permission === 'granted');
    setState(on ? 'on' : 'off');
    // Re-register on every visit: the server drops endpoints the push service
    // reports as gone, and iOS can rotate them without telling the page.
    if (on) void save(sub!).catch(() => undefined);
  }, []);

  useEffect(() => { void refresh().catch(() => setState('unsupported')); }, [refresh]);

  async function enable() {
    setBusy(true); setMessage(null);
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error('Push ist auf dem Server nicht eingerichtet.');
      // Must run inside the tap: iOS only shows the prompt for a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { await refresh(); return; }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription()
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await save(sub);
      setState('on');
      setMessage('Erinnerungen sind aktiv.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Aktivieren fehlgeschlagen.');
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push-subscriptions', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState('off');
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      setMessage(res.ok && body.delivered ? 'Test gesendet – kommt gleich an.' : 'Test konnte nicht zugestellt werden.');
    } finally { setBusy(false); }
  }

  return { state, busy, message, enable, disable, test };
}
