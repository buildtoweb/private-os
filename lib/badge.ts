type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function supportsAppBadge(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

export async function setAppBadge(count: number): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const badgeNavigator = navigator as BadgeNavigator;
  if (!badgeNavigator.setAppBadge) return false;
  try {
    const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
    if (safeCount === 0) return clearAppBadge();
    await badgeNavigator.setAppBadge(safeCount);
    return true;
  } catch {
    return false;
  }
}

export async function clearAppBadge(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const badgeNavigator = navigator as BadgeNavigator;
  if (!badgeNavigator.clearAppBadge && !badgeNavigator.setAppBadge) return false;
  try {
    if (badgeNavigator.clearAppBadge) await badgeNavigator.clearAppBadge();
    else await badgeNavigator.setAppBadge?.(0);
    return true;
  } catch {
    return false;
  }
}
