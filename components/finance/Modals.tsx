'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AlertCurrency, FinanceAsset } from '@/lib/finance/types';
import { Money } from './Privacy';
import { AlertForm, CurrencySwitch } from './PriceAlerts';
import { money } from './format';

// ─── Shared modal shell (matches ConfirmDialog styling) ────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="finance-overlay fade-in" onClick={onClose}>
      <div
        className="finance-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="finance-sheet__head">
          <p className="font-semibold">{title}</p>
          <button type="button" className="finance-close" onClick={onClose} aria-label="Schließen">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

async function api(method: string, url: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// ─── Add sheet: a booking or a price alert ─────────────────
export function LedgerModal({ assets, initialAssetId, initialMode = 'booking', onClose, onSaved }: {
  assets: FinanceAsset[]; initialAssetId?: string | null; initialMode?: 'booking' | 'alert'; onClose: () => void; onSaved: () => void;
}) {
  const [mode, setMode] = useState<'booking' | 'alert'>(initialMode);
  return (
    <Modal title={mode === 'alert' ? 'Kursalarm' : 'Buchung hinzufügen'} onClose={onClose}>
      {!initialAssetId && <div className="finance-seg finance-seg--wide mb-4" role="group" aria-label="Was hinzufügen">
        <button type="button" className={mode === 'booking' ? 'is-active' : ''} aria-pressed={mode === 'booking'} onClick={() => setMode('booking')}>Buchung</button>
        <button type="button" className={mode === 'alert' ? 'is-active' : ''} aria-pressed={mode === 'alert'} onClick={() => setMode('alert')}>Kursalarm</button>
      </div>}
      {mode === 'alert'
        ? <AlertForm assets={assets} onDone={() => window.setTimeout(onClose, 900)} />
        : <BookingForm assets={assets} initialAssetId={initialAssetId} onSaved={onSaved} />}
    </Modal>
  );
}

function BookingForm({ assets, initialAssetId, onSaved }: { assets: FinanceAsset[]; initialAssetId?: string | null; onSaved: () => void }) {
  const [newAsset, setNewAsset] = useState(false);
  const [createdAssetId, setCreatedAssetId] = useState<string | null>(null);
  const [assetSearch, setAssetSearch] = useState('');
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    type: assets.find((asset) => asset.id === initialAssetId)?.cls === 'cash' ? 'deposit' : 'buy',
    assetId: initialAssetId || '', datetime: localNow(), cls: 'stocks', currency: 'EUR',
  });
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const selectedAsset = assets.find((asset) => asset.id === form.assetId);
  const isCash = !newAsset && selectedAsset?.cls === 'cash';
  const currency: AlertCurrency = isCash ? 'EUR' : form.currency === 'USD' ? 'USD' : 'EUR';
  const symbol = currency === 'USD' ? '$' : '€';
  const [fx, setFx] = useState<number | null>(null);
  const tradeDate = (form.datetime || '').slice(0, 10);
  useEffect(() => {
    setFx(null);
    if (currency === 'EUR' || !/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) return;
    let live = true;
    fetch(`/api/finance/fx?from=${currency}&to=EUR&date=${tradeDate}`).then((res) => res.json())
      .then((json) => { if (live && json.ok) setFx(json.rate); }).catch(() => undefined);
    return () => { live = false; };
  }, [currency, tradeDate]);
  const typedTotal = Number(form.amount || (Number(form.shares) * Number(form.price))) || 0;
  const availableAssets = assets
    .filter((asset) => !asset.importedDummy)
    .filter((asset) => assetSearch.trim()
      ? `${asset.name} ${asset.identifier} ${asset.yahooSymbol || ''}`.toLocaleLowerCase('de-AT').includes(assetSearch.trim().toLocaleLowerCase('de-AT'))
      : showAllAssets || asset.active || asset.id === form.assetId)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'de-AT'));

  async function save() {
    setSaving(true); setError(null);
    try {
      const amount = Number(form.amount || (Number(form.shares) * Number(form.price)));
      if (!form.datetime || !(amount > 0)) throw new Error('Datum und Gesamtbetrag sind erforderlich.');
      if ((form.type === 'buy' || form.type === 'sell') && !(Number(form.shares) > 0)) throw new Error('Für Kauf und Verkauf sind positive Anteile erforderlich.');
      let assetId = newAsset ? createdAssetId : selectedAsset?.id;
      if (newAsset && !assetId) {
        if (!form.name?.trim() || !form.identifier?.trim()) throw new Error('Name und ISIN/Symbol sind erforderlich.');
        if ((form.cls === 'stocks' || form.cls === 'etf') && !form.yahooSymbol?.trim()) throw new Error('Für Livekurse ist ein Yahoo-Symbol erforderlich.');
        if (form.cls === 'crypto' && !form.coinId?.trim()) throw new Error('Für Livekurse ist eine CoinGecko-ID erforderlich.');
        const created = await api('POST', '/api/finance/assets', {
          name: form.name, cls: form.cls, identifier: form.identifier,
          isin: form.isin || undefined, symbol: form.symbol || form.yahooSymbol || form.identifier,
          yahooSymbol: form.yahooSymbol || undefined, coinId: form.coinId || undefined,
          currency: form.currency || 'EUR', active: false,
        });
        assetId = String(created.id);
        setCreatedAssetId(assetId);
      }
      if (!assetId) throw new Error('Bitte ein Asset auswählen.');
      await api('POST', '/api/finance/transactions', {
        assetId, type: form.type, datetime: new Date(form.datetime).toISOString(),
        name: newAsset ? form.name : selectedAsset?.name, identifier: newAsset ? form.identifier : selectedAsset?.identifier,
        shares: Number(form.shares), price: Number(form.price), amount,
        fee: isCash ? 0 : Number(form.fee) || 0, tax: isCash ? 0 : Number(form.tax) || 0, currency,
      });
      onSaved();
    } catch (caught: any) { setError(caught.message); } finally { setSaving(false); }
  }

  return (
      <div className="space-y-3">
        <input className="input" type="search" aria-label="Asset suchen" placeholder="Asset suchen…" value={assetSearch} onChange={(event) => {
          setAssetSearch(event.target.value);
          setForm((current) => ({ ...current, assetId: '' }));
          setNewAsset(false);
        }} />
        <Field label="Asset">
          <select className="input" value={newAsset ? '__new' : form.assetId || ''} onChange={(event) => {
            const fresh = event.target.value === '__new';
            setNewAsset(fresh);
            const chosen = assets.find((asset) => asset.id === event.target.value);
            setForm((current) => ({ ...current, assetId: fresh ? '' : event.target.value, type: chosen?.cls === 'cash' ? 'deposit' : 'buy' }));
          }}>
            <option value="">Auswählen…</option>
            {availableAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.cls === 'cash' ? 'EUR' : asset.identifier}</option>)}
            <option value="__new">+ Neues Asset mit erstem Kauf</option>
          </select>
        </Field>
        {!assetSearch && !showAllAssets && <button type="button" className="text-xs text-secondary hover:text-white" onClick={() => setShowAllAssets(true)}>Auch frühere Assets anzeigen</button>}
        {newAsset && (
          <div className="finance-new-asset-fields">
            <p className="text-secondary text-xs">Asset und ersten Kauf gemeinsam speichern.</p>
            <Field label="Name"><input className="input" value={form.name || ''} onChange={(event) => set('name', event.target.value)} /></Field>
            <Field label="Anlageklasse"><select className="input" value={form.cls} onChange={(event) => set('cls', event.target.value)}><option value="stocks">Aktie</option><option value="etf">ETF</option><option value="crypto">Krypto</option></select></Field>
            <Field label="ISIN oder Symbol"><input className="input" value={form.identifier || ''} onChange={(event) => { set('identifier', event.target.value); set('isin', event.target.value); }} /></Field>
            {form.cls === 'crypto'
              ? <Field label="CoinGecko-ID"><input className="input" placeholder="z. B. solana" value={form.coinId || ''} onChange={(event) => set('coinId', event.target.value)} /></Field>
              : <Field label="Yahoo-Symbol"><input className="input" placeholder="z. B. ILMN oder NOVO-B.CO" value={form.yahooSymbol || ''} onChange={(event) => set('yahooSymbol', event.target.value)} /></Field>}
          </div>
        )}
        {isCash && <p className="text-secondary text-xs">Kontostand: <Money>{new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(selectedAsset.shares || 0)}</Money> · Buchungen ab dem {selectedAsset.openingBalanceDate || 'Eröffnungsdatum'}</p>}
        <Field label="Art"><select className="input" value={form.type} onChange={(event) => set('type', event.target.value)} disabled={newAsset}>{isCash ? <><option value="deposit">Einzahlung</option><option value="withdrawal">Auszahlung</option></> : <><option value="buy">Kauf</option><option value="sell">Verkauf</option><option value="dividend">Dividende</option><option value="interest">Zinsen</option><option value="deposit">Einzahlung</option><option value="withdrawal">Auszahlung</option></>}</select></Field>
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Datum"><input className="input" type="datetime-local" value={form.datetime} onChange={(event) => set('datetime', event.target.value)} /></Field>
          {!isCash && <div><span className="field-label">Währung</span><CurrencySwitch value={currency} onChange={(next) => set('currency', next)} /></div>}
        </div>
        {(form.type === 'buy' || form.type === 'sell') && <div className="grid grid-cols-2 gap-3"><Field label="Anteile"><input className="input" type="number" step="any" value={form.shares || ''} onChange={(event) => set('shares', event.target.value)} /></Field><Field label={`Preis je Anteil (${symbol})`}><input className="input" type="number" step="any" value={form.price || ''} onChange={(event) => set('price', event.target.value)} /></Field></div>}
        <Field label={`Gesamtbetrag (${symbol})`}><input className="input" type="number" step="any" value={form.amount || ''} onChange={(event) => set('amount', event.target.value)} placeholder={isCash ? 'Betrag in Euro' : 'Optional, wenn Anteile × Preis ausgefüllt'} /></Field>
        {!isCash && <div className="grid grid-cols-2 gap-3"><Field label={`Gebühr (${symbol})`}><input className="input" type="number" step="any" value={form.fee || ''} onChange={(event) => set('fee', event.target.value)} /></Field><Field label={`Steuer (${symbol})`}><input className="input" type="number" step="any" value={form.tax || ''} onChange={(event) => set('tax', event.target.value)} /></Field></div>}
        {currency !== 'EUR' && <p className="text-secondary text-xs">
          {fx ? <>Kurs vom {tradeDate.split("-").reverse().join(".")}: 1 $ = {money(fx, 'EUR', { decimals: 4 })}{typedTotal > 0 && <> · verbucht als <Money>{money(typedTotal * fx, 'EUR')}</Money></>}</> : 'Wechselkurs wird geladen…'}
        </p>}
        {error && <p className="text-red text-xs">{error}</p>}
        <button className="btn btn-primary w-full" onClick={save} disabled={saving}>{saving ? 'Speichern…' : newAsset ? 'Asset und Kauf speichern' : isCash ? 'Kontobewegung speichern' : 'Buchung speichern'}</button>
      </div>
  );
}

// datetime-local wants local wall time, not UTC.
function localNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
