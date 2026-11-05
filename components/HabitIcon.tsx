type Props = { iconKey: string; size?: number; color?: string; className?: string };

export function HabitIcon({ iconKey, size = 18, color = 'currentColor', className }: Props) {
  const p = {
    width: size, height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (iconKey) {
    case 'journaling':
      return <svg {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
    case 'meditation':
      return <svg {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
    case 'lesen':
      return <svg {...p}><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>;
    case 'englisch':
      return <svg {...p}><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>;
    case 'kreatin':
      return <svg {...p}><path d="M8 2h8"/><path d="M9 2v5l-3 9a2 2 0 002 2h8a2 2 0 002-2l-3-9V2"/></svg>;
    case 'vitamine':
      return <svg {...p}><rect x="3" y="9" width="18" height="6" rx="3"/><line x1="12" y1="9" x2="12" y2="15"/></svg>;
    case 'kalorien':
      return <svg {...p}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
    case 'skincare':
      return <svg {...p}><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>;
    case 'noPhone':
      return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case 'noSugar':
      return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>;
    case 'reflexion':
      return <svg {...p}><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>;
    case 'gym':
      return <svg {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
    case 'sauna':
      return <svg {...p}><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>;
    default:
      return <svg {...p}><circle cx="12" cy="12" r="5"/></svg>;
  }
}
