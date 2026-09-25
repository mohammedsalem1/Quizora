import type { Metadata } from "next";

// Only sets this page's title (see app/layout.tsx).
export const metadata: Metadata = { title: "تعديل الاختبار" };

export default function Layout({
  children,
}: LayoutProps<"/teacher/quizzes/[quizId]">) {
  return children;
}
