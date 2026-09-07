import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Clever Finds — Useful finds, fewer regrets', template: '%s — Clever Finds' },
  description: 'Practical home organisers shortlisted using buyer feedback, recent demand and value.',
  metadataBase: new URL('https://cleverfindspicks.mohammdmadhar99.chatgpt.site'),
  robots: { index: true, follow: true },
  icons: { icon: '/clever-finds.png' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
