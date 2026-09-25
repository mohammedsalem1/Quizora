import type { Metadata } from "next";

// Only sets this page's title (see app/layout.tsx).
export const metadata: Metadata = { title: "اختبار جديد" };

export default function Layout({
  children,
}: LayoutProps<"/teacher/quizzes/new">) {
  return children;
}
