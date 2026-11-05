import type { Theme } from './types';

// Automatic task icons.
//
// A task title is matched against a keyword table (German first, English as a
// fallback) and gets the emoji of the most specific hit. Order matters: specific
// nouns ("zahnarzt", "visitenkarte") come before actions ("anrufen", "zahlen"),
// and those before broad domains ("arbeit", "projekt") — so "Zahnarzt anrufen"
// becomes a tooth, "Agentur anrufen" a phone, and "Projekt planen" a briefcase.
//
// The emoji is content, not UI chrome (STYLE.md): it sits in a tinted circle
// whose colour comes from the theme, and the theme maps onto the four accents.

type Rule = [pattern: RegExp, emoji: string, theme: Theme];

const RULES: Rule[] = [
  // ——— Specific things ———
  [/visitenkarte|business ?card/, '🪪', 'work'],
  [/wissensdatenbank|knowledge ?base|second brain|zettelkasten|obsidian/, '🧠', 'learning'],
  [/stream ?deck|streamdeck/, '🎛️', 'work'],
  [/\bthg\b|e-?auto|elektroauto|ladestation|wallbox/, '🔌', 'finance'],
  [/versicher|insurance|haftpflicht|\sarag\b|r\+v|allianz|uniqa|generali|wiener städtische/, '🛡️', 'finance'],
  [/drohne|drone|dji/, '🚁', 'creative'],
  [/steuer|finanzamt|\btax|elster|lohnzettel|arbeitnehmerveranlagung/, '🧾', 'finance'],
  [/rechnung|invoice|beleg|quittung|mahnung/, '🧾', 'finance'],
  [/dashboard|analytics|statistik|auswertung|report|kpi/, '📊', 'work'],
  [/to[- ]?do\b|todo|aufgabenliste|task ?list|planer/, '📝', 'work'],
  [/finanzplan|budget|haushaltsbuch|sparplan|finanzen|finanz/, '💰', 'finance'],
  [/aktie|etf|depot|invest|portfolio|krypto|bitcoin|crypto|trading/, '📈', 'finance'],
  [/gehalt|lohn|überweis|ueberweis|bank|konto|paypal/, '🏦', 'finance'],
  [/\sabo\b|abos\b|subscription|kündig|kuendig|vertrag/, '📑', 'finance'],
  [/umsatz|kalkul|forecast|excel|spreadsheet|tabelle/, '🧮', 'finance'],
  // Media before marketing: "Marketing-Reels schneiden" is editing work.
  [/video|youtube|reel|tiktok|shorts|film|schnitt|schneiden|premiere|davinci|resolve/, '🎬', 'creative'],
  [/bewerb|lebenslauf|\scv\b|\sjobs?\b|interview|vorstellungsgespräch/, '💼', 'work'],
  [/\sads?\b|anzeige|werbung|kampagne|campaign|marketing|google ads|meta ads/, '📣', 'work'],
  [/event|konferenz|conference|messe|ticket|festival|konzert/, '🎟️', 'general'],
  [/geburtstag|birthday|party|feier/, '🎉', 'general'],
  [/geschenk|gift|present/, '🎁', 'general'],
  [/hochzeit|wedding/, '💍', 'general'],
  [/zahnarzt|dentist|zähne|zaehne/, '🦷', 'health'],
  [/zahnbürst|zahnbuerst|zahnpasta|zahnseide|toothbrush/, '🪥', 'health'],
  [/kontaktlinse|\slinsen\b|brille|optiker|glasses/, '👓', 'health'],
  [/skincare|hautpflege|gesichtspflege|\sbha\b|\saha\b|\sbpo\b|retinol|serum|creme|sonnencreme|sunscreen/, '🧴', 'health'],
  [/desinfekt|seife|hygien|drogerie|\sbipa\b|\sdm\b/, '🧼', 'home'],
  [/no ?fap|no ?porn|clean streak|verzicht/, '💪', 'health'],
  [/fechten|fencing/, '🤺', 'health'],
  [/tennis|padel|squash/, '🎾', 'health'],
  [/fußball|fussball|football|soccer/, '⚽', 'health'],
  [/boxen|boxing|kampfsport|\smma\b|kickbox/, '🥊', 'health'],
  [/klettern|bouldern|climbing/, '🧗', 'health'],
  [/skifahren|\sski\b|snowboard/, '⛷️', 'health'],
  [/arzt|doctor|ärztin|aerztin|klinik|spital|krankenhaus|befund|blutbild|blutabnahme/, '🩺', 'health'],
  [/apotheke|medikament|tablette|rezept abholen|pharmacy/, '💊', 'health'],
  [/friseur|frisör|haare schneiden|haircut|barber/, '💇', 'health'],
  [/gym|fitness|krafttraining|workout|training|trainieren/, '🏋️', 'health'],
  [/laufen|joggen|\slauf\b|\srun\b|running|marathon/, '🏃', 'health'],
  [/\srad\b|radfahren|fahrrad|bike|cycling/, '🚴', 'health'],
  [/schwimm|swim|aquapark|auqapark|therme|freibad|hallenbad/, '🏊', 'health'],
  [/yoga|stretch|dehnen|mobility/, '🧘', 'health'],
  [/medit|atem|breath|achtsam/, '🧘', 'health'],
  [/sauna|\sspa\b|wellness|massage/, '🧖', 'health'],
  [/schlaf|sleep|\snap\b|nickerchen/, '😴', 'health'],
  [/spazier|walk|wander|hike/, '🚶', 'health'],
  [/wasser trinken|hydrat/, '💧', 'health'],
  [/protein|whey|shake/, '🥤', 'health'],
  [/vitamin|supplement|kreatin/, '💊', 'health'],
  [/journal|tagebuch|reflexion|reflektier/, '📓', 'learning'],
  [/podcast|mikro|aufnahme|record/, '🎙️', 'creative'],
  [/foto|photo|kamera|camera|shooting|lightroom/, '📸', 'creative'],
  [/musik|music|song|spotify|gitarre|guitar|klavier|piano|beat/, '🎵', 'creative'],
  [/zeichn|\smal(en)?\b|illustr|sketch|skizze|figma|canva|grafik|karussell|carousel|design|logo|branding/, '🎨', 'creative'],
  [/instagram|linkedin|social|\sposts?\b|posten|posting|content|story|stories|newsletter/, '📱', 'creative'],
  [/blog|artikel|article|schreib|\stext\b|texte|copy/, '✍️', 'creative'],
  [/website|webseite|landingpage|landing page|domain|seo|shop|shopify/, '🌐', 'work'],
  [/vibe ?code|code|coding|programm|entwickl|develop|deploy|bug|github|\sapp\b|\sapi\b|server/, '💻', 'work'],
  [/präsentation|praesentation|slides|pitch|\sdeck\b|keynote/, '📽️', 'work'],
  [/angebot|offer|quote|kostenvoranschlag/, '📄', 'work'],
  [/buchhaltung|steuerberater|accounting|lexoffice|qonto/, '📒', 'finance'],
  [/\sauto\b|kfz|pickerl|tüv|tuev|werkstatt|reifen|tanken|\sservice\b/, '🚗', 'home'],
  [/mitnehmen|einpacken|packliste/, '🎒', 'general'],
  [/flug|flight|reise|urlaub|travel|trip|hotel|airbnb|koffer|packen/, '✈️', 'general'],
  [/\szug\b|\sbahn\b|öbb|oebb|train/, '🚆', 'general'],
  [/paket|post\s?amt|versand|zurücksend|ruecksend|retoure|amazon|bestell|lieferung/, '📦', 'home'],
  [/einkauf|einkaufen|supermarkt|groceries|shopping|billa|\sspar\b|hofer|lidl/, '🛒', 'home'],
  [/koch|kochen|meal ?prep|rezept|backen|essen|dinner|lunch|frühstück|fruehstueck/, '🍳', 'home'],
  [/putz|reinig|staubsaug|aufräum|aufraeum|clean|ordnung/, '🧹', 'home'],
  [/wäsche|waesche|bügeln|buegeln|laundry/, '🧺', 'home'],
  [/müll|muell|abfall|trash|altpapier/, '🗑️', 'home'],
  [/pflanz|garten|blumen|gießen|giessen|plant/, '🪴', 'home'],
  [/reparier|repair|werkzeug|montier|ikea|bohren|handwerk/, '🔧', 'home'],
  [/umzug|wohnung|miete|haus\b|zuhause|immobil/, '🏠', 'home'],
  [/\shund|katze|tierarzt|haustier|\bpet\b|\bdog\b|\bcat\b/, '🐾', 'home'],
  [/\sbuch\b|bücher|buecher|lesen|read|book|kindle/, '📚', 'learning'],
  [/kurs|course|lern|studi|\suni\b|prüfung|pruefung|exam|vorlesung|seminar/, '🎓', 'learning'],
  [/sprache|englisch|english|spanisch|französisch|vokabel|duolingo/, '🗣️', 'learning'],
  [/idee|brainstorm|konzept|strategie|strategy|vision/, '💡', 'learning'],
  [/\ski\b|\sai\b|chatgpt|claude|\sagent\b|openclaw|automatisier|n8n|automation/, '🤖', 'work'],
  [/passwort|password|backup|sicherheit|2fa|security/, '🔐', 'work'],
  [/foto|drucken|drucker|print/, '🖨️', 'work'],
  [/formular|antrag|behörde|behoerde|\samt\b|magistrat|\spass\b|ausweis|meldezettel/, '🏛️', 'general'],

  // ——— Actions ———
  [/anruf|anrufen|telefon|\scall\b|zurückrufen|zurueckrufen/, '📞', 'work'],
  [/e-?mail|\smail\b|mails|inbox|postfach|schreiben an/, '✉️', 'work'],
  [/nachricht|antwort|whatsapp|message|telegram|slack|sms/, '💬', 'work'],
  [/meeting|besprechung|call mit|zoom|teams|jour fixe/, '👥', 'work'],
  [/termin|appointment|kalender|calendar|reservier/, '📅', 'general'],
  [/\szahl|bezahl|\spay\b|payment|überweisen|ueberweisen|kosten|geld|money/, '💶', 'finance'],
  [/sparen|save money|rücklage|ruecklage/, '🐖', 'finance'],
  [/anmeld|registrier|sign ?up|einschreib/, '🖊️', 'general'],
  [/\splan\b|planen|planung|organis|vorbereit|prepare/, '🗓️', 'work'],
  [/einricht|setup|set up|install|konfigur/, '⚙️', 'work'],
  [/aufbau|bauen|build|erstell|create/, '🧱', 'work'],
  [/recherch|research|suchen|vergleich/, '🔎', 'learning'],
  [/prüf|pruef|check|review|kontroll/, '✅', 'work'],
  [/unterschreib|\ssign\b|vertrag unterschreiben/, '✍️', 'work'],
  [/drucken|scann|\sscan\b/, '🖨️', 'work'],
  [/aufräum|sortier|ausmisten|declutter/, '🗂️', 'home'],
  [/verkauf|willhaben|ebay|sell/, '🏷️', 'finance'],
  [/\skauf|kaufen|\sbuy|bestellen|order/, '🛍️', 'home'],
  [/abholen|pick ?up/, '📦', 'home'],
  [/\sfahren\b|hinfahren|vorbeifahren|\sdrive\b/, '🚗', 'general'],
  [/\sgehen\b|hingehen|vorbeigehen|\sstraße\b|\sstrasse\b/, '🚶', 'general'],
  [/helfen|hilfe|unterstütz|unterstuetz|\shelp\b/, '🫶', 'general'],

  // ——— Broad domains ———
  [/kunde|kundin|client|akquise|\sleads?\b|vertrieb|pipeline|sales/, '🤝', 'work'],  [/mama|papa|eltern|familie|family|oma|opa|bruder|schwester/, '👨‍👩‍👧', 'general'],
  [/freund|treffen|\sdate\b|kaffee|coffee|café|cafe/, '☕', 'general'],
  [/arbeit|projekt|project|business|firma|agentur|büro|buero|office|work/, '💼', 'work'],
  [/gesund|health|körper|koerper|ernährung|ernaehrung|diät|diaet/, '🍏', 'health'],
  [/haushalt|home/, '🏡', 'home'],
];

const FALLBACK = { emoji: '✨', theme: 'general' as Theme };

function normalize(title: string) {
  return ` ${title.toLocaleLowerCase('de').replace(/\s+/g, ' ')} `;
}

/** Best icon for a title. Used on create and whenever an auto-picked title changes. */
export function taskAppearance(title: string): { emoji: string; theme: Theme } {
  const t = normalize(title);
  const match = RULES.find(([re]) => re.test(t));
  return match ? { emoji: match[1], theme: match[2] } : FALLBACK;
}

/** Ranked, de-duplicated icon suggestions for the picker (best first). */
export function suggestIcons(title: string, limit = 8): { emoji: string; theme: Theme }[] {
  const t = normalize(title);
  const seen = new Set<string>();
  const out: { emoji: string; theme: Theme }[] = [];
  for (const [re, emoji, theme] of RULES) {
    if (!re.test(t) || seen.has(emoji)) continue;
    seen.add(emoji); out.push({ emoji, theme });
    if (out.length >= limit) break;
  }
  return out;
}

/** Hand-picked set for browsing, grouped by the tint they will get. */
export const ICON_LIBRARY: { label: string; theme: Theme; emojis: string[] }[] = [
  { label: 'Arbeit', theme: 'work', emojis: ['💼', '💻', '📊', '📝', '📞', '✉️', '👥', '📣', '🌐', '🤖', '🤝', '📄', '🎛️', '⚙️', '🪪', '🔐'] },
  { label: 'Geld', theme: 'finance', emojis: ['💰', '💶', '🧾', '🏦', '📈', '🧮', '🛡️', '📑', '🐖', '🏷️', '🔌'] },
  { label: 'Kreativ', theme: 'creative', emojis: ['🎬', '📸', '🎨', '🎙️', '🎵', '📱', '✍️', '🚁'] },
  { label: 'Gesundheit', theme: 'health', emojis: ['🏋️', '🏃', '🚴', '🏊', '🧘', '🧖', '🩺', '🦷', '🪥', '👓', '🧴', '💊', '🥤', '😴', '💧', '🍏', '🚶', '💪', '🤺', '🎾', '⚽', '🥊', '🧗', '⛷️'] },
  { label: 'Zuhause', theme: 'home', emojis: ['🏠', '🛒', '🍳', '🧹', '🧺', '🧼', '🪴', '🔧', '📦', '🚗', '🐾', '🗑️', '🛍️'] },
  { label: 'Lernen', theme: 'learning', emojis: ['📚', '🎓', '🧠', '💡', '🗣️', '🔎', '📓'] },
  { label: 'Alltag', theme: 'general', emojis: ['✨', '📅', '🎟️', '🎉', '🎁', '✈️', '🚆', '☕', '👨‍👩‍👧', '🏛️', '🖊️', '🎒', '🫶', '⭐'] },
];

export function themeForEmoji(emoji: string): Theme {
  return ICON_LIBRARY.find(group => group.emojis.includes(emoji))?.theme ?? 'general';
}
