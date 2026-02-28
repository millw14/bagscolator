import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bagscolator — Live Dashboard",
  description: "Real-time transparency dashboard for the Bagscolator buyback & lock protocol",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-mono antialiased">{children}</body>
    </html>
  );
}
