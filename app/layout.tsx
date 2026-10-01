import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/components/store";
import { Nav } from "@/components/nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Wingmate — your agent dates for you",
  description:
    "Every person is represented by an AI agent built from their public LinkedIn and Instagram. The agents go on dates with each other and rank who fits each person best.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-screen font-sans">
        <StoreProvider>
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted sm:px-6">
            Wingmate is a simulation. Agents are built only from public LinkedIn and Instagram profiles and say nothing about anyone&apos;s
            real relationships. Not affiliated with or endorsed by the people shown.
          </footer>
        </StoreProvider>
      </body>
    </html>
  );
}
