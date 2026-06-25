import type { Metadata } from "next";
import { Syne, Hanken_Grotesk, Orbitron } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

// Display font for headings — geometric and distinctive.
const display = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

// Body font — clean, modern, and uncommon.
const body = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

// Cosmic display font — wide, futuristic "deep space" look for the hero title.
const cosmic = Orbitron({
  variable: "--font-cosmic",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Charlie Cai",
  description: "Personal website of Charlie Cai — writer, researcher, and builder.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${cosmic.variable} antialiased`}
    >
      <body className="min-h-screen bg-[#06060c] text-zinc-100">
        <Nav />
        {children}
      </body>
    </html>
  );
}
