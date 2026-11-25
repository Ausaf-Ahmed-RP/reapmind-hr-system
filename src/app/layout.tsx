import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReapMind Innovations | HR Operations & Candidate Management',
  description: 'Enterprise resume intake, student self-apply portal, candidate tracking, and tamper-proof interview evaluations.',
  icons: {
    icon: '/images/reapmind-logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-reapmind-obsidian text-white antialiased min-h-screen font-sans selection:bg-reapmind-blue selection:text-white">
        {children}
      </body>
    </html>
  );
}
