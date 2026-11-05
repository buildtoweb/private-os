export type Priority = 'high' | 'medium' | 'low' | 'none';
export type Slot = 'anytime' | 'morning' | 'afternoon' | 'evening';
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';
export type Theme = 'work' | 'finance' | 'creative' | 'health' | 'home' | 'learning' | 'general';

export type Subtask = { id: string; title: string; done: boolean };
export type Task = {
  id: string;
  title: string;
  priority: Priority;
  date: string | null;
  slot: Slot;
  /** Optional start time, HH:MM in Europe/Vienna. */
  time: string | null;
  duration: number;
  repeat: Repeat;
  /** Push reminder, minutes before the start; null = no reminder. */
  reminder: number | null;
  notes: string;
  subtasks: Subtask[];
  done: boolean;
  completedDates: string[];
  order: number;
  emoji: string;
  theme: Theme;
  deletedAt?: string | null;
};

/** A read-only appointment from a subscribed calendar (Google, iCloud). */
export type CalendarEvent = {
  id: string;
  feedId: string;
  title: string;
  /** Day it shows on, YYYY-MM-DD in Europe/Vienna. */
  date: string;
  /** Start and end HH:MM in Vienna; null for all-day events. */
  time: string | null;
  end: string | null;
  duration: number;
  location: string;
};

export type CalendarFeed = { id: string; name: string; color: number; host: string; error?: string };
