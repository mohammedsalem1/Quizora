import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">الصفحة غير موجودة</h1>
      <p className="text-ink-muted">تحقّق من الرابط أو ارجع إلى الصفحة الرئيسية.</p>
      <Link href="/" className={buttonClass("secondary")}>
        الصفحة الرئيسية
      </Link>
    </main>
  );
}
