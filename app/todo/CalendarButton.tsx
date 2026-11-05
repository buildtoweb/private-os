'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { IconCalendar, IconClose } from '@/components/icons';
import type { CalendarFeed } from '@/lib/todo/types';
import { feedTint } from './shared';
import styles from './planner.module.css';

type Props = { className?: string; feeds: CalendarFeed[]; onChange: () => void };

/** Connect Google by its secret iCal link, iCloud by an app-specific password (CalDAV). */
export function CalendarButton({ className, feeds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<'google' | 'icloud'>('google');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [appleId, setAppleId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  async function send(method: 'POST' | 'DELETE', body: object) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch('/api/todo/calendar', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) throw new Error(result.error || `Fehler ${res.status}`);
      if (method === 'POST') {
        setUrl(''); setName(''); setPassword('');
        setMessage(result.calendars ? `${result.calendars} iCloud-Kalender verbunden.` : 'Kalender verbunden.');
      }
      onChange();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Hat nicht geklappt.');
    } finally { setBusy(false); }
  }

  return <div className={styles.pushWrap} ref={ref}>
    <button className={`${className ?? ''} ${feeds.length ? styles.pushOn : ''}`} onClick={() => setOpen(v => !v)} aria-label="Kalender" aria-expanded={open}>
      <IconCalendar size={19} />
    </button>
    <AnimatePresence>
      {open && <motion.div className={`${styles.pushPopover} ${styles.calPopover}`} role="dialog" aria-label="Kalender verbinden"
        initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
        <strong>Kalender</strong>
        {feeds.length > 0 && <ul className={styles.feedList}>
          {feeds.map(f => <li key={f.id}>
            <span className={styles.feedDot} style={{ '--tint': feedTint(f.color) } as CSSProperties} />
            <span className={styles.feedText}><b>{f.name}</b><small>{f.error ?? f.host}</small></span>
            <button className={styles.feedRemove} disabled={busy} onClick={() => void send('DELETE', { id: f.id })} aria-label={`${f.name} entfernen`}><IconClose size={14} /></button>
          </li>)}
        </ul>}
        <div className={styles.sourceTabs} role="tablist">
          <button role="tab" aria-selected={source === 'google'} onClick={() => { setSource('google'); setMessage(null); }}>Google</button>
          <button role="tab" aria-selected={source === 'icloud'} onClick={() => { setSource('icloud'); setMessage(null); }}>Apple (iCloud)</button>
        </div>
        {source === 'google' ? <>
          <p>Termine erscheinen nur zum Ansehen. Dein Kalender bleibt privat – der Link ist geheim und lässt sich in Google jederzeit zurücksetzen.</p>
          <details className={styles.feedHelp}>
            <summary>Wo finde ich den Link?</summary>
            <p>calendar.google.com → Einstellungen → links den Kalender anklicken → „Privatadresse im iCal-Format“ kopieren. Nicht die „öffentliche Adresse“ nehmen.</p>
          </details>
          <form className={styles.feedForm} onSubmit={e => { e.preventDefault(); if (url.trim()) void send('POST', { name, url }); }}>
            <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://calendar.google.com/…/basic.ics" aria-label="Kalender-Link" inputMode="url" autoComplete="off" />
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Name (optional)" aria-label="Name des Kalenders" />
            <button className="btn-primary" disabled={busy || !url.trim()}>{busy ? 'Prüfe …' : 'Verbinden'}</button>
          </form>
        </> : <>
          <p>Nichts wird veröffentlicht: Das Dashboard liest deine iCloud-Kalender mit einem eigenen App-Passwort, das du jederzeit widerrufen kannst.</p>
          <details className={styles.feedHelp} open>
            <summary>App-Passwort erstellen</summary>
            <p>account.apple.com → „Anmelden und Sicherheit“ → „App-spezifische Passwörter“ → „+“ → Name z. B. „Dashboard“ → Passwort (xxxx-xxxx-xxxx-xxxx) kopieren. Nicht dein normales Apple-Passwort verwenden.</p>
          </details>
          <form className={styles.feedForm} onSubmit={e => { e.preventDefault(); if (appleId.trim() && password.trim()) void send('POST', { kind: 'icloud', username: appleId, password }); }}>
            <input className="input" type="email" value={appleId} onChange={e => setAppleId(e.target.value)} placeholder="Apple-ID (E-Mail)" aria-label="Apple-ID" autoComplete="off" />
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="App-spezifisches Passwort" aria-label="App-spezifisches Passwort" autoComplete="off" />
            <button className="btn-primary" disabled={busy || !appleId.trim() || !password.trim()}>{busy ? 'Verbinde …' : 'iCloud verbinden'}</button>
          </form>
        </>}
        {message && <small>{message}</small>}
      </motion.div>}
    </AnimatePresence>
  </div>;
}
