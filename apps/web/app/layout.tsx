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
  // Each page sets its own title, e.g. "نتيجة الاختبار | Quizora". Screen readers announce
  // a page change when the title changes, so every route needs a different one.
  title: { default: "Quizora", template: "%s | Quizora" },
  description: "اختبارات قصيرة لطلاب المركز",
};

// suppressHydrationWarning: browser extensions add their own attributes to <html> and <body>
// before React hydrates (e.g. bbai-tooltip-injected, wotdisconnected), which React reports as
// a mismatch. It only ignores attribute differences on these two elements; mismatches inside
// the app's own components are still reported.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={plexArabic.variable}
      suppressHydrationWarning
    >
      <body
        className="min-h-dvh font-sans text-base antialiased"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
