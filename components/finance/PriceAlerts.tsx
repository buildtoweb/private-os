'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { bustCache, useCachedFetch } from '@/lib/fetchCache';
import type { AlertCurrency, FinanceAsset, MarketAsset, PriceAlert } from '@/lib/finance/types';
import { usePush } from '@/lib/usePush';
import { money } from './format';

const ALERTS_URL = '/api/finance/alerts';
type AlertsResp = { ok: boolean; alerts: PriceAlert[] };

async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// Every hook instance (banner, detail sheet, form) refetches after any change.
const CHANGED = 'price-alerts-changed';

export function useAlerts(enabled = true) {
  const query = useCachedFetch<AlertsResp>(enabled ? ALERTS_URL : null, 60_000);
  const alerts = query.data?.alerts || [];
  const { refresh } = query;
  useEffect(() => {
    if (!enabled) return;
    const onChange = () => { void refresh(); };
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, [enabled, refresh]);
  async function reload() { bustCache(ALERTS_URL); window.dispatchEvent(new Event(CHANGED)); }
  return {
    alerts,
    triggered: alerts.filter((alert) => alert.status === 'triggered'),
    active: alerts.filter((alert) => alert.status === 'active'),
    reload,
    async dismiss(id: string) { await send('PATCH', ALERTS_URL, { id, action: 'dismiss' }); await reload(); },
    async remove(id: string) { await send('DELETE', `${ALERTS_URL}?id=${encodeURIComponent(id)}`); await reload(); },
    async create(input: { assetId?: string; symbol?: string; currency: AlertCurrency; target: number }) {
      const res = await send('POST', ALERTS_URL, input);
      await reload();
      return res.alert as PriceAlert;
    },
  };
}

// Triggered alerts stay on top of the dashboard until they are dismissed.
export function AlertBanner({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const { triggered, dismiss } = useAlerts();
  const [busy, setBusy] = useState<string | null>(null);
  if (!triggered.length) return null;
  return (
    <div className={`price-alert-stack ${className}`} role="status">
      {triggered.map((alert) => (
        <div key={alert.id} className="price-alert">
          <span className="price-alert__icon" aria-hidden><BellIcon /></span>
          <Link href="/finance" className="price-alert__body">
            <strong>{alert.name} {alert.direction === 'below' ? 'unter' : 'über'} {money(alert.target, alert.currency)}</strong>
            <span>
              {alert.triggeredPrice != null ? `Kurs ${money(alert.triggeredPrice, alert.currency)}` : 'Kursalarm ausgelöst'}
              {!compact && alert.triggeredAt ? ` · ${formatWhen(alert.triggeredAt)}` : ''}
            </span>
          </Link>
          <button
            type="button" className="price-alert__close" aria-label="Alarm ausblenden" disabled={busy === alert.id}
            onClick={async () => { setBusy(alert.id); try { await dismiss(alert.id); } finally { setBusy(null); } }}
          >×</button>
        </div>
      ))}
    </div>
  );
}

export function AlertForm({
  assets, assetId: fixedAssetId, defaultCurrency = 'EUR', onDone,
}: {
  assets?: FinanceAsset[];
  assetId?: string;
  defaultCurrency?: AlertCurrency;
  onDone?: (alert: PriceAlert) => void;
}) {
  const { create } = useAlerts(false);
  const push = usePush();
  const [assetId, setAssetId] = useState(fixedAssetId || '');
  const [search, setSearch] = useState('');
  const [marketAssets, setMarketAssets] = useState<MarketAsset[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<AlertCurrency>(defaultCurrency);
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<PriceAlert | null>(null);

  useEffect(() => {
    setMarketAssets([]); setSearchError(null);
    if (fixedAssetId || search.trim().length < 2) { setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/finance/asset-search?q=${encodeURIComponent(search.trim())}`, { signal: controller.signal });
        const json = await response.json();
        if (!response.ok || !json.ok) throw new Error(json.error || 'Suche fehlgeschlagen.');
        if (!controller.signal.aborted) setMarketAssets(json.assets);
      } catch (error) {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : 'Suche fehlgeschlagen.');
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [search, fixedAssetId]);

  useEffect(() => {
    setCurrent(null);
    if (!assetId) return;
    let live = true;
    const lookup = assetId.startsWith('yahoo:') ? `symbol=${encodeURIComponent(assetId.slice(6))}` : `assetId=${encodeURIComponent(assetId)}`;
    fetch(`/api/finance/price-history?${lookup}&period=1W&currency=${currency}`)
      .then((res) => res.json())
      .then((json) => { if (live && json.ok && json.points?.length) setCurrent(json.points.at(-1).value); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [assetId, currency]);

  const selectable = (assets || []).filter((asset) => asset.cls !== 'cash' && !asset.importedDummy)
    .filter((asset) => `${asset.name} ${asset.identifier} ${asset.symbol || ''} ${asset.yahooSymbol || ''}`.toLocaleLowerCase('de-AT').includes(search.trim().toLocaleLowerCase('de-AT')))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de-AT'));
  const external = marketAssets.filter((asset) => !selectable.some((owned) => owned.yahooSymbol === asset.yahooSymbol));
  const value = Number(target.replace(',', '.'));
  const direction = current != null && value > 0 ? (value >= current ? 'above' : 'below') : null;

  async function save() {
    setSaving(true); setError(null);
    try {
      if (!assetId) throw new Error('Bitte ein Asset auswählen.');
      if (!(value > 0)) throw new Error('Bitte einen Zielkurs eingeben.');
      const alert = await create({ ...(assetId.startsWith('yahoo:') ? { symbol: assetId.slice(6) } : { assetId }), currency, target: value });
      setSaved(alert); setTarget('');
      onDone?.(alert);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Speichern fehlgeschlagen.'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      {!fixedAssetId && <>
        <input className="input" type="search" aria-label="Asset für Kursalarm suchen" placeholder="Asset suchen…" value={search} onChange={(event) => {
          setSearch(event.target.value); setAssetId(''); setSaved(null); setError(null);
        }} />
        <label className="block">
          <span className="field-label">Asset</span>
          <select className="input" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
            <option value="">Auswählen…</option>
            {!!selectable.length && <optgroup label="Deine Assets">{selectable.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.active ? '' : ' · nicht im Bestand'}</option>)}</optgroup>}
            {!!external.length && <optgroup label="Suchergebnisse">{external.map((asset) => <option key={asset.symbol} value={`yahoo:${asset.symbol}`}>{asset.name} · {asset.symbol}{asset.exchange ? ` · ${asset.exchange}` : ''}</option>)}</optgroup>}
          </select>
        </label>
        <p className="text-muted text-xs" role="status">{searching ? 'Assets werden gesucht…' : searchError || (search.trim().length >= 2 && !selectable.length && !external.length ? 'Keine passenden Assets gefunden.' : 'Nach Name, ISIN oder Symbol suchen – auch außerhalb deines Portfolios.')}</p>
      </>}
      <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
        <label className="block">
          <span className="field-label">Zielkurs</span>
          <input className="input" inputMode="decimal" placeholder={current != null ? money(current, currency) : 'z. B. 90'} value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <CurrencySwitch value={currency} onChange={setCurrency} />
      </div>
      {current != null && <p className="text-secondary text-xs">
        Aktuell {money(current, currency)}
        {direction && ` · Alarm, sobald der Kurs ${direction === 'below' ? 'auf' : 'über'} ${money(value, currency)} ${direction === 'below' ? 'fällt' : 'steigt'}.`}
      </p>}
      {push.state === 'off' && <button type="button" className="finance-inline-link" onClick={() => void push.enable()} disabled={push.busy}>Push-Mitteilungen auf diesem Gerät aktivieren</button>}
      {push.state === 'install' && <p className="text-secondary text-xs">Für Push am iPhone das Dashboard vom Home-Bildschirm öffnen.</p>}
      {error && <p className="text-red text-xs">{error}</p>}
      {saved && !error && <p className="text-xs" style={{ color: 'var(--success)' }}>Alarm für {saved.name} bei {money(saved.target, saved.currency)} gesetzt.</p>}
      <button type="button" className="btn btn-primary w-full" onClick={save} disabled={saving}>{saving ? 'Speichern…' : 'Kursalarm setzen'}</button>
    </div>
  );
}

export function AlertList({ alerts, onRemove }: { alerts: PriceAlert[]; onRemove: (id: string) => void }) {
  if (!alerts.length) return null;
  return (
    <ul className="finance-alert-list">
      {alerts.map((alert) => (
        <li key={alert.id}>
          <span className="finance-alert-list__icon" aria-hidden><BellIcon /></span>
          <span className="min-w-0 flex-1">
            <strong>{alert.direction === 'below' ? 'Fällt auf' : 'Steigt auf'} {money(alert.target, alert.currency)}</strong>
            <small>{alert.lastPrice != null ? `Zuletzt ${money(alert.lastPrice, alert.currency)}` : 'Aktiv'}</small>
          </span>
          <button type="button" className="finance-alert-list__remove" onClick={() => onRemove(alert.id)} aria-label="Alarm löschen">Löschen</button>
        </li>
      ))}
    </ul>
  );
}

export function CurrencySwitch({ value, onChange }: { value: AlertCurrency; onChange: (currency: AlertCurrency) => void }) {
  return (
    <div className="finance-seg" role="group" aria-label="Währung">
      {(['EUR', 'USD'] as AlertCurrency[]).map((currency) => (
        <button key={currency} type="button" className={value === currency ? 'is-active' : ''} aria-pressed={value === currency} onClick={() => onChange(currency)}>
          {currency === 'EUR' ? '€' : '$'}
        </button>
      ))}
    </div>
  );
}

function formatWhen(ms: number) {
  return new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
