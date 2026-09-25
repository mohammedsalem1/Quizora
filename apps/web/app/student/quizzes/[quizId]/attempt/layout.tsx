import type { Metadata } from "next";

// Only sets this page's title (see app/layout.tsx).
export const metadata: Metadata = { title: "حلّ الاختبار" };

export default function Layout({
  children,
}: LayoutProps<"/student/quizzes/[quizId]/attempt">) {
  return children;
}
