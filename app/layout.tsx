import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SPREAD — My vision map',
  manifest: '/manifest.webmanifest',
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
