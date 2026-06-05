import "./globals.css";
import { Providers } from "./providers";
import AppNav from "@/components/AppNav";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "F1 Task Manager",
  description: "Gamified tasks for ADHD focus",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-zinc-950 text-white antialiased" suppressHydrationWarning>
        <Providers>
          <AppNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
