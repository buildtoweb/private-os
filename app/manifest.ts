import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Private Dashboard',
    short_name: 'Dashboard',
    description: 'Persönliches Dashboard für Habits, Gesundheit, Reflexion und Finanzen.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#141315',
    theme_color: '#141315',
    categories: ['productivity', 'health', 'finance'],
    icons: [
      {
        src: '/icons/icon-192.png?v=2',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png?v=2',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png?v=2',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png?v=2',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
