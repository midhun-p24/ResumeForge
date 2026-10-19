import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';
import './cyber.css';
export const metadata: Metadata = {
  title: 'ResumeForge · Your experience, precisely told',
  description:
    'A private resume tailoring workspace powered by your own locally connected Codex agent.',
};
export default async function Layout({ children }: { children: React.ReactNode }) {
  // A fresh CSP nonce must be applied to every HTML response and framework script.
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
