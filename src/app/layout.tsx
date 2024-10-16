import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { InterviewProvider } from '../contexts/InterviewContext';

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "AI 면접 프로그램",
  description: "AI를 이용한 면접 프로그램",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <InterviewProvider>
          {children}
        </InterviewProvider>
      </body>
    </html>
  );
}
