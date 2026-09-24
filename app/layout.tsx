import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nodestar — My vision map',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
  description:
    'Design and follow interconnected paths toward what you want. A personal space for goals, ideas and imagination.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
