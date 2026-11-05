// Mapping for the most common WHOOP sport_id values.
// Source: WHOOP developer docs sport list. Anything unmapped falls back to "Aktivität".
// `cat` groups each sport into one of a small set of SVG icon categories (no emoji in UI).
export type SportIconKey = 'run' | 'bike' | 'strength' | 'ball' | 'water' | 'mind' | 'activity';

const SPORT_NAMES: Record<number, { name: string; cat: SportIconKey }> = {
  [-1]: { name: 'Aktivität', cat: 'activity' },
  0:    { name: 'Laufen', cat: 'run' },
  1:    { name: 'Radfahren', cat: 'bike' },
  16:   { name: 'Baseball', cat: 'ball' },
  17:   { name: 'Basketball', cat: 'ball' },
  18:   { name: 'Rudern', cat: 'water' },
  24:   { name: 'Functional Fitness', cat: 'strength' },
  27:   { name: 'Golf', cat: 'ball' },
  28:   { name: 'Eishockey', cat: 'ball' },
  29:   { name: 'Hockey', cat: 'ball' },
  30:   { name: 'Reiten', cat: 'activity' },
  44:   { name: 'Pickleball', cat: 'ball' },
  45:   { name: 'Pilates', cat: 'mind' },
  47:   { name: 'Boxen', cat: 'strength' },
  48:   { name: 'Kickboxing', cat: 'strength' },
  49:   { name: 'MMA', cat: 'strength' },
  52:   { name: 'Rucking / Hiking', cat: 'run' },
  56:   { name: 'Skiing', cat: 'activity' },
  57:   { name: 'Snowboarden', cat: 'activity' },
  58:   { name: 'Fußball', cat: 'ball' },
  59:   { name: 'Softball', cat: 'ball' },
  60:   { name: 'Squash', cat: 'ball' },
  61:   { name: 'Stair Climber', cat: 'activity' },
  62:   { name: 'Surfen', cat: 'water' },
  63:   { name: 'Gehen', cat: 'run' },
  64:   { name: 'Wasser-Polo', cat: 'water' },
  65:   { name: 'Yoga', cat: 'mind' },
  66:   { name: 'Krafttraining', cat: 'strength' },
  70:   { name: 'Volleyball', cat: 'ball' },
  71:   { name: 'Schwimmen', cat: 'water' },
  73:   { name: 'Tanzen', cat: 'activity' },
  74:   { name: 'Tennis', cat: 'ball' },
  82:   { name: 'Spinning', cat: 'bike' },
  96:   { name: 'HIIT', cat: 'strength' },
  97:   { name: 'Spazieren', cat: 'run' },
  98:   { name: 'Triathlon', cat: 'activity' },
  102:  { name: 'Mountainbiken', cat: 'bike' },
  104:  { name: 'Bergsteigen', cat: 'activity' },
  105:  { name: 'Klettern', cat: 'activity' },
  106:  { name: 'Stretching', cat: 'mind' },
  113:  { name: 'Meditation', cat: 'mind' },
  121:  { name: 'Padel', cat: 'ball' },
  123:  { name: 'Stair Climber', cat: 'activity' },
  125:  { name: 'Fechten', cat: 'strength' },
  126:  { name: 'Kampfsport', cat: 'strength' },
};

export function sportName(id: number): string {
  return SPORT_NAMES[id]?.name || `Sport #${id}`;
}

export function sportIconKey(id: number): SportIconKey {
  return SPORT_NAMES[id]?.cat || 'activity';
}
