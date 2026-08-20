import "./globals.css";
import type { Metadata } from "next";
import { SessionProvider } from "@/lib/session";
import { StreamProvider } from "@/lib/stream";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = { title: "Toc2me — тестовый стенд" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <SessionProvider>
          <StreamProvider>
            <Nav />
            {children}
          </StreamProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
