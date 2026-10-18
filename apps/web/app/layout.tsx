import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ResumeForge · Your experience, precisely told',
  description:
    'A private resume tailoring workspace powered by your own locally connected Codex agent.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
