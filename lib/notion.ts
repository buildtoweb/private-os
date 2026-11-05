import { Client } from '@notionhq/client';

export const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN! });
export const REFLECT_DB = (process.env.NOTION_REFLECT_DB_ID || process.env.NOTION_REFLECT_DB)!;

export const HABIT_KEYS = [
  'journaling', 'meditation', 'lesen', 'kreatin', 'vitamine',
  'kalorien', 'skincare', 'reflexion', 'bestDay', 'noPhone', 'noSugar',
] as const;
export type HabitKey = typeof HABIT_KEYS[number];

export const HABIT_LABEL: Record<HabitKey, string> = {
  journaling: 'Journaling', meditation: 'Meditation', lesen: 'Lesen',
  kreatin: 'Kreatin', vitamine: 'Vitamine', kalorien: 'Kalorien tracken',
  skincare: 'Skincare', reflexion: 'Reflexion', bestDay: 'Best Day',
  noPhone: 'Kein Handy am Morgen', noSugar: 'Kein Zucker',
};

// NOTE: Habit day read/write lives in lib/habitsStore.ts (Supabase-backed).
// This module keeps only the client-safe habit metadata (HABIT_KEYS, labels,
// the HabitDay type) plus the Notion-backed reflection entries.
export type HabitDay = {
  id?: string;
  date: string; // YYYY-MM-DD
  mood?: number;
  habits: Record<string, boolean | undefined>;
  gymWeek?: number;
  saunaWeek?: number;
  schritte?: number;
  gewicht?: number;
  aktiveKalorien?: number;
  notiz?: string;
  // Urlaubsmodus: the day was deliberately not tracked. Neutral — it neither
  // counts as done nor as missed, and it does not break a streak.
  vacation?: boolean;
  vacationLabel?: string;
  // Daily reflection (Buch-Style)
  dankbar?: string;
  intention?: string;
  gutGemacht?: string;
  besserMorgen?: string;
};

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

export type ReflectType = 'Woche' | 'Monat' | 'Tag';
export type ReflectEntry = { id: string; date: string; title: string; text: string; type?: ReflectType; period?: string };
export type ReflectEntriesPage = { entries: ReflectEntry[]; nextCursor?: string; hasMore: boolean };

async function getReflectMeta() {
  const meta: any = await notion.databases.retrieve({ database_id: REFLECT_DB });
  const props = Object.values(meta.properties || {}) as any[];
  const hasTitle = props.some((p: any) => p.type === 'title');
  const hasDate = props.some((p: any) => p.type === 'date');
  if (!hasTitle || !hasDate) {
    const missing = [!hasTitle ? 'Title-Spalte' : null, !hasDate ? 'Date-Spalte' : null].filter(Boolean);
    throw new Error(`Reflect-DB Schema unvollständig. Fehlend: ${missing.join(', ')}`);
  }
  return meta;
}

export async function getReflectEntries(type?: ReflectType): Promise<ReflectEntry[]> {
  const entries: ReflectEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await getReflectEntriesPage({ startCursor: cursor, pageSize: 100, type });
    entries.push(...page.entries);
    cursor = page.nextCursor;
  } while (cursor);
  return entries;
}

export async function getReflectEntriesPage({
  startCursor,
  pageSize = 10,
  type,
  from,
  to,
}: {
  startCursor?: string;
  pageSize?: number;
  type?: ReflectType;
  /** Inclusive YYYY-MM-DD bounds, for jumping to a past month or week. */
  from?: string;
  to?: string;
}): Promise<ReflectEntriesPage> {
  const meta: any = await getReflectMeta();
  const dateName = findPropName(meta, 'date');
  const clauses: any[] = [];
  if (type) clauses.push({ property: 'Typ', select: { equals: type } });
  if (dateName && from) clauses.push({ property: dateName, date: { on_or_after: from } });
  if (dateName && to) clauses.push({ property: dateName, date: { on_or_before: to } });
  const res: any = await notion.databases.query({
    database_id: REFLECT_DB,
    start_cursor: startCursor,
    filter: clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : { and: clauses },
    sorts: dateName
      ? [{ property: dateName, direction: 'descending' }]
      : [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: Math.max(1, Math.min(pageSize, 25)),
  });
  const entries = await Promise.all(res.results.map(async (row: any) => {
    const props = row.properties || {};
    const titleProp = Object.values(props).find((p: any) => p.type === 'title') as any;
    const title = titleProp?.title?.map((t: any) => t.plain_text).join('') || '';
    const dateProp = Object.values(props).find((p: any) => p.type === 'date') as any;
    const date = dateProp?.date?.start || inferDateFromTitle(title) || row.created_time?.slice(0, 10) || '';
    const text = await getPagePlainText(row.id);
    const type = props.Typ?.select?.name as ReflectType | undefined;
    const period = readRichText(props.Periode) || periodFromDate(date, type);
    return { id: row.id, date, title, text, type, period };
  }));
  return {
    entries,
    nextCursor: res.has_more ? res.next_cursor : undefined,
    hasMore: !!res.has_more,
  };
}

export { toDateStr };

export async function createReflectEntry(title: string, text: string, date?: string, type?: ReflectType) {
  const entryDate = date || toDateStr(new Date());
  const entryType = type || inferTypeFromTitle(title) || 'Woche';
  if (entryType === 'Monat') throw new Error('monthly_reflection_disabled');
  const meta: any = await getReflectMeta();
  const props = buildReflectProperties(meta, title || 'Eintrag', text || '', entryDate, entryType);
  return notion.pages.create({
    parent: { database_id: REFLECT_DB },
    properties: props,
    children: textToBlocks(text || ''),
  });
}

export async function updateReflectEntry(pageId: string, title: string, text: string) {
  const meta: any = await getReflectMeta();
  const props = buildReflectProperties(meta, title || 'Eintrag', text || '');
  const page = await notion.pages.update({ page_id: pageId, properties: props });
  await replacePagePlainText(pageId, text || '');
  return page;
}

function findPropName(meta: any, type: string, preferred?: string) {
  if (preferred && meta.properties?.[preferred]?.type === type) return preferred;
  const found = Object.entries(meta.properties || {}).find(([, def]: any) => def.type === type);
  return found?.[0];
}

function buildReflectProperties(meta: any, title: string, _text: string, date?: string, type?: ReflectType) {
  const props: any = {};
  const titleName = findPropName(meta, 'title');
  const dateName = findPropName(meta, 'date', 'Datum');
  if (titleName) props[titleName] = { title: [{ text: { content: title } }] };
  if (dateName && date) props[dateName] = { date: { start: date } };
  if (meta.properties?.Typ?.type === 'select' && type) props.Typ = { select: { name: type } };
  if (meta.properties?.Periode?.type === 'rich_text' && date) {
    props.Periode = { rich_text: toRichText(periodFromDate(date, type)) };
  }
  return props;
}

function readRichText(prop: any) {
  const arr = prop?.rich_text;
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map((x: any) => x.plain_text || '').join('');
}

function toRichText(text: string) {
  const chunks = chunkText(text || '', 1900).slice(0, 50);
  return chunks.length ? chunks.map(content => ({ text: { content } })) : [];
}

function textToBlocks(text: string) {
  const blocks: any[] = [];
  let paragraph: string[] = [];

  const pushParagraph = () => {
    const content = paragraph.join('\n').trim();
    if (content) {
      for (const chunk of chunkText(content, 1800)) blocks.push(notionTextBlock('paragraph', chunk));
    }
    paragraph = [];
  };

  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    const numbered = /^\d+\.\s+(.+)$/.exec(trimmed);

    if (!trimmed) {
      pushParagraph();
      continue;
    }
    if (heading) {
      pushParagraph();
      blocks.push(notionTextBlock(`heading_${heading[1].length}`, heading[2].trim()));
      continue;
    }
    if (bullet) {
      pushParagraph();
      blocks.push(notionTextBlock('bulleted_list_item', bullet[1].trim()));
      continue;
    }
    if (numbered) {
      pushParagraph();
      blocks.push(notionTextBlock('numbered_list_item', numbered[1].trim()));
      continue;
    }
    paragraph.push(line);
  }
  pushParagraph();
  return blocks.slice(0, 100);
}

function notionTextBlock(type: string, content: string) {
  const rich_text = [{ type: 'text' as const, text: { content } }];
  if (type === 'heading_1') return { object: 'block' as const, type, heading_1: { rich_text } };
  if (type === 'heading_2') return { object: 'block' as const, type, heading_2: { rich_text } };
  if (type === 'heading_3') return { object: 'block' as const, type, heading_3: { rich_text } };
  if (type === 'bulleted_list_item') return { object: 'block' as const, type, bulleted_list_item: { rich_text } };
  if (type === 'numbered_list_item') return { object: 'block' as const, type, numbered_list_item: { rich_text } };
  return { object: 'block' as const, type: 'paragraph' as const, paragraph: { rich_text } };
}

function chunkText(text: string, size: number) {
  if (!text) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

async function getPagePlainText(pageId: string) {
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    for (const block of res.results || []) {
      const line = blockToPlainText(block);
      if (line) lines.push(line);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return lines.join('\n\n');
}

async function replacePagePlainText(pageId: string, text: string) {
  let cursor: string | undefined;
  do {
    const res: any = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
    for (const block of res.results || []) {
      await notion.blocks.update({ block_id: block.id, archived: true });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  const children = textToBlocks(text);
  if (children.length) await notion.blocks.children.append({ block_id: pageId, children });
}

function blockToPlainText(block: any) {
  const type = block?.type;
  const value = block?.[type];
  const text = value?.rich_text?.map((t: any) => t.plain_text || '').join('').trim();
  if (!text) return '';
  if (type === 'heading_1') return `# ${text}`;
  if (type === 'heading_2') return `## ${text}`;
  if (type === 'heading_3') return `### ${text}`;
  if (type === 'bulleted_list_item') return `- ${text}`;
  if (type === 'numbered_list_item') return `1. ${text}`;
  return text;
}

function inferTypeFromTitle(title: string): ReflectType | undefined {
  if (/monat|januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember/i.test(title)) return 'Monat';
  if (/woche|week|\bw\d{1,2}\b/i.test(title)) return 'Woche';
  return undefined;
}

function periodFromDate(date: string, type?: ReflectType) {
  if (!date) return '';
  if (type === 'Woche') return `${date.slice(0, 4)}-W${String(weekNumber(new Date(date))).padStart(2, '0')}`;
  return date.slice(0, 7);
}

function inferDateFromTitle(title: string) {
  const m = title.match(/\b(20\d{2})\b/);
  if (!m) return '';
  const month = ['januar', 'februar', 'märz', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember']
    .findIndex(name => new RegExp(name, 'i').test(title));
  if (month < 0) return '';
  return `${m[1]}-${String(month + 1).padStart(2, '0')}-01`;
}

function weekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
