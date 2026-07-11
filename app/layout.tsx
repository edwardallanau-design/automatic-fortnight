import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { peekSession } from "@/lib/authGuard";
import { StaffBarGate } from "@/app/components/StaffBarGate";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "Order — Digital Menu",
  description: "Browse the menu and place your order.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await peekSession();

  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <StaffBarGate session={session} />
        {children}
      </body>
    </html>
  );
}
