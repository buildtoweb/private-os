'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { usePush } from '@/lib/usePush';
import { IconBell, IconBellOff } from '@/components/icons';
import styles from './planner.module.css';

export function PushButton({ className }: { className?: string }) {
  const push = usePush();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (push.state === 'loading' || push.state === 'unsupported') return null;
  const on = push.state === 'on';

  return <div className={styles.pushWrap} ref={ref}>
    <button className={`${className ?? ''} ${on ? styles.pushOn : ''}`} onClick={() => setOpen(v => !v)} aria-label="Erinnerungen" aria-expanded={open}>
      {on ? <IconBell size={19} /> : <IconBellOff size={19} />}
    </button>
    <AnimatePresence>
      {open && <motion.div className={styles.pushPopover} role="dialog" aria-label="Push-Erinnerungen"
        initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
        <strong>Erinnerungen</strong>
        {push.state === 'install' && <p>Push funktioniert am iPhone nur in der installierten App: Teilen → „Zum Home-Bildschirm“, dann dort öffnen.</p>}
        {push.state === 'denied' && <p>Mitteilungen sind blockiert. Erlaube sie in den iOS-Einstellungen unter Mitteilungen → Dashboard.</p>}
        {push.state === 'off' && <><p>Lass dich zum Start einer Aufgabe erinnern – pro Aufgabe unter „Erinnerung“ einstellbar.</p>
          <button className="btn-primary" disabled={push.busy} onClick={() => void push.enable()}>{push.busy ? 'Aktiviere …' : 'Auf diesem Gerät aktivieren'}</button></>}
        {on && <><p>Dieses Gerät bekommt Erinnerungen für geplante Aufgaben.</p>
          <div className={styles.pushActions}>
            <button className="btn-sm" disabled={push.busy} onClick={() => void push.test()}>Test senden</button>
            <button className="btn-sm" disabled={push.busy} onClick={() => void push.disable()}>Ausschalten</button>
          </div></>}
        {push.message && <small>{push.message}</small>}
      </motion.div>}
    </AnimatePresence>
  </div>;
}
