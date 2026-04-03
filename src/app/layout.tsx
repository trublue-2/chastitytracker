import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import VersionChecker from "@/app/components/VersionChecker";
import ToastProvider from "@/app/components/ToastProvider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KG Tracker",
  description: "Keuschheitsgürtel Tracking",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KG Tracker",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#111827",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${geistSans.variable} ${jetbrainsMono.variable} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <ToastProvider>
            {children}
            <VersionChecker buildDate={process.env.BUILD_DATE ?? "local"} />
            <Script id="sw-register" strategy="afterInteractive">{`
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(function(err) {
                  console.warn('[SW] registration failed:', err);
                });
              }
            `}</Script>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
