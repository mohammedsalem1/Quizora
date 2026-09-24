import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

// One family for the whole interface: covers Arabic and Latin (for English quiz content).
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Quizora",
  description: "اختبارات قصيرة لطلاب المركز",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={plexArabic.variable}>
      <body className="min-h-dvh font-sans text-base antialiased">
        {children}
      </body>
    </html>
  );
}
