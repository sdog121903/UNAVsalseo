import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import AnalyticsProvider from "@/components/AnalyticsProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Un@vSalseo",
  description: "Anonymous social posting via QR code",
  icons: {
    icon: "/assets/logosalseo-nobg.png",
    apple: "/assets/logosalseo-nobg.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased font-sans`}>
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
