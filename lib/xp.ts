import type { Frequency } from './habits';

export function dailyHabitXP(streak = 0) {
  return 30 + streakBonus(streak);
}

export function weeklyHabitXP(kind: 'counter' | 'checkbox' = 'checkbox') {
  return kind === 'counter' ? 140 : 90;
}

export function dailyReflectionXP() {
  return 45;
}

export function weeklyReflectionXP() {
  return 180;
}

export function perfectDayXP() {
  return 120;
}

export function goalCompletionXP() {
  return 35;
}

export function xpPenalty(xp: number) {
  return -Math.max(1, Math.round(xp * 0.6));
}

export function dailyHabitPenalty(streak = 0) {
  return xpPenalty(dailyHabitXP(streak));
}

export function weeklyHabitPenalty(kind: 'counter' | 'checkbox' = 'checkbox') {
  return xpPenalty(weeklyHabitXP(kind));
}

export function dailyReflectionPenalty() {
  return xpPenalty(dailyReflectionXP());
}

export function perfectDayPenalty() {
  return xpPenalty(perfectDayXP());
}

export function goalCompletionPenalty() {
  return xpPenalty(goalCompletionXP());
}

// Giving up on a goal is a deliberate, heavy hit — far more than just not finishing it.
export function goalGiveUpPenalty() {
  return -150;
}

export function habitXP(frequency: Frequency, streak = 0, kind: 'counter' | 'checkbox' = 'checkbox') {
  return frequency === 'daily' ? dailyHabitXP(streak) : weeklyHabitXP(kind);
}

export function habitPenalty(frequency: Frequency, streak = 0, kind: 'counter' | 'checkbox' = 'checkbox') {
  return xpPenalty(habitXP(frequency, streak, kind));
}

function streakBonus(streak: number) {
  if (streak >= 100) return 80;
  if (streak >= 60) return 65;
  if (streak >= 30) return 50;
  if (streak >= 14) return 35;
  if (streak >= 7) return 22;
  if (streak >= 3) return 10;
  return 0;
}
