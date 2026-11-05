'use client';
import { useEffect } from 'react';
import { IconWarning } from '@/components/icons';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="max-w-3xl mx-auto px-4 md:px-8 pt-16">
      <div className="card border-dashed text-center py-10">
        <IconWarning size={28} className="text-red mx-auto mb-3" />
        <h1 className="h2">Etwas ist schiefgelaufen</h1>
        <p className="text-secondary text-sm mt-2">Diese Seite konnte nicht geladen werden.</p>
        <button onClick={reset} className="btn btn-primary mt-5">Erneut versuchen</button>
      </div>
    </main>
  );
}
