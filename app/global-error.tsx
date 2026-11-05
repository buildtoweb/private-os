'use client';
// Catches errors thrown in the root layout itself; must render its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body style={{ background: '#141315', color: '#f5f2f0', fontFamily: 'Inter, -apple-system, system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100dvh', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Etwas ist schiefgelaufen</h1>
          <p style={{ opacity: 0.6, fontSize: 14, marginTop: 8 }}>Die App konnte nicht geladen werden.</p>
          <button
            onClick={reset}
            style={{ marginTop: 20, padding: '12px 22px', borderRadius: 999, background: '#7ba888', color: '#16211a', border: 'none', cursor: 'pointer', fontWeight: 600, minHeight: 44 }}
          >
            Neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
