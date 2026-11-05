// Consent page for a connector (OAuth /authorize) — Claude or ChatGPT.
//
// Without the PIN session proxy.ts sends the browser to /login first and comes
// back here with every parameter intact.
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { COOKIE, verify } from '@/lib/auth';
import { mcpResourceUrl, oauthConfigured, parseAuthorizeRequest, publicOrigin, redirectWith } from '@/lib/mcp/oauth';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Connector verbinden' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FORWARDED = ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'state', 'resource', 'scope'];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh grid place-items-center px-4 py-8 bg-base">
      <div className="card w-full max-w-[420px] p-6">{children}</div>
    </main>
  );
}

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <Shell>
      <h1 className="h2 mb-2">{title}</h1>
      <p className="text-secondary text-sm">{text}</p>
    </Shell>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') params.set(k, v);

  if (!oauthConfigured()) {
    return <Problem title="Nicht eingerichtet" text="MCP_OAUTH_SECRET ist nicht gesetzt — der Connector kann sich noch nicht anmelden." />;
  }

  if (!verify((await cookies()).get(COOKIE)?.value)) {
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
  }

  const parsed = parseAuthorizeRequest(params, mcpResourceUrl(publicOrigin(await headers())));
  if (!parsed.ok && !parsed.redirectable) {
    return <Problem title="Ungültige Anfrage" text={parsed.message} />;
  }
  if (!parsed.ok) {
    redirect(redirectWith(parsed.redirectUri, { error: parsed.error, error_description: parsed.message, state: parsed.state }));
  }

  const { req } = parsed;
  const target = new URL(req.redirectUri);

  return (
    <Shell>
      <h1 className="h2 mb-1">Connector verbinden</h1>
      <p className="text-secondary text-sm mb-5">
        <span className="text-primary font-medium">{req.client.name}</span> möchte auf dein privates Dashboard zugreifen.
      </p>

      <ul className="text-sm text-secondary space-y-2 mb-5 list-disc pl-5">
        <li>Lesen: Gesundheit, Gewohnheiten, Journal und Reflexionen, Ziele, Planer, Finanzen, Abos, XP</li>
        <li>Schreiben: Gewohnheiten abhaken, Journal und Stimmung, Ziele, To-dos</li>
        <li>Finanzen, Abos und Reflexionen bleiben schreibgeschützt. To-dos werden nur wiederherstellbar gelöscht.</li>
      </ul>

      <p className="text-xs text-muted mb-6">Rückleitung an {target.host}</p>

      <form method="post" action="/api/oauth/authorize" className="flex gap-3">
        {FORWARDED.filter((k) => params.has(k)).map((k) => (
          <input key={k} type="hidden" name={k} value={params.get(k)!} />
        ))}
        {!params.has('redirect_uri') && <input type="hidden" name="redirect_uri" value={req.redirectUri} />}
        <button type="submit" name="decision" value="deny" className="btn-ghost flex-1">
          Ablehnen
        </button>
        <button type="submit" name="decision" value="allow" className="btn-primary flex-1">
          Zugriff erlauben
        </button>
      </form>
    </Shell>
  );
}
