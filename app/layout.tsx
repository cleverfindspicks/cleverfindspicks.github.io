import type { Metadata } from 'next';
import './globals.css';
import { Analytics } from '@/components/analytics';

export const metadata: Metadata = {
  title: { default: 'Clever Finds — Useful finds, fewer regrets', template: '%s — Clever Finds' },
  description: 'Practical home organisers shortlisted using buyer feedback, recent demand and value.',
  metadataBase: new URL('https://cleverfindspicks.github.io'),
  robots: { index: true, follow: true },
  icons: { icon: 'https://cleverfindspicks.github.io/clever-finds.png' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="p:domain_verify" content="414a5d9d74d85c27938453ce50e66e38" />
      </head>
      <body>
        <Analytics />
        {children}
      </body>
    </html>
  );
}
