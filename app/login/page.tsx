'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh grid place-items-center"><div className="text-secondary text-sm">…</div></main>}>
      <LoginInner />
    </Suspense>
  );
}

const PIN_LEN = Math.max(4, Math.min(8, Number(process.env.NEXT_PUBLIC_PIN_LENGTH) || 6));

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<boolean | string>(false);
  const [loading, setLoading] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  async function submit(value: string) {
    setLoading(true);
    setErr(false);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin: value }),
    });
    if (res.ok) {
      router.replace(next);
    } else {
      setErr(res.status === 429 ? 'Zu viele Versuche. Warte 15 Minuten.' : res.status === 503 ? 'Login ist noch nicht eingerichtet (siehe SETUP.md).' : true);
      setPin('');
      setLoading(false);
      setTimeout(() => inputs.current[0]?.focus(), 50);
    }
  }

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, '').slice(-1);
    const arr = pin.padEnd(PIN_LEN, ' ').split('');
    arr[i] = d || ' ';
    const newPin = arr.join('').trimEnd();
    setPin(newPin);
    if (d && i < PIN_LEN - 1) inputs.current[i + 1]?.focus();
    if (newPin.replace(/\s/g, '').length === PIN_LEN) submit(newPin);
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !pin[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  return (
    <main className="fixed inset-0 z-50 grid place-items-center px-6 bg-base">
      <div className="w-full max-w-[380px] -translate-y-3">
        <div className="text-center mb-10">
          <h1 className="h1">Dashboard</h1>
          <p className="text-secondary text-sm mt-1">PIN eingeben</p>
        </div>
        <div className={`flex justify-center gap-3 ${err ? 'animate-shake' : ''}`}>
          {Array.from({ length: PIN_LEN }).map((_, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              inputMode="numeric"
              autoComplete="one-time-code"
              type="password"
              maxLength={1}
              value={pin[i] || ''}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              disabled={loading}
              // A recess needs a lighter surround to read, and the login page is
              // the bare --bg with nothing behind it. So the PIN fields are
              // raised tiles rather than wells; state is a ring, not a border.
              className={`h-16 w-14 rounded-well bg-elevated text-center text-2xl font-semibold caret-transparent outline-none transition
                text-primary
                ${err ? 'shadow-[var(--shadow-1),inset_0_0_0_2px_rgba(201,123,90,0.65)]'
                      : pin[i] ? 'shadow-[var(--shadow-1),inset_0_0_0_2px_rgba(123,168,136,0.65)]'
                               : 'shadow-sheet'}
                focus:shadow-[var(--shadow-1),inset_0_0_0_2px_rgba(123,168,136,0.45)]`}
              aria-label={`PIN digit ${i + 1}`}
            />
          ))}
        </div>
        {err && <p className="text-red text-xs text-center mt-4">{typeof err === 'string' ? err : 'Falscher PIN'}</p>}
      </div>
      <style jsx global>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        .animate-shake { animation: shake 200ms ease-in-out; }
      `}</style>
    </main>
  );
}
