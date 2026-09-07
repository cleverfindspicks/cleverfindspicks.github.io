import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clever Finds — Product Discovery',
  description: 'Clever Finds is preparing its first collection of useful product discoveries.',
  metadataBase: new URL('https://cleverfindspicks.true-heron-1653.chatgpt.site'),
  robots: { index: false, follow: false },
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
