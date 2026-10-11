import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });
// Rally
const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "A team of AI bots improving a schedule, live.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${plexSans.variable} ${plexMono.variable} ${instrumentSans.variable} ${jetbrainsMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
