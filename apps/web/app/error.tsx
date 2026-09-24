"use client";

import { Button } from "@/components/ui";

// Shown when a page fails to render, e.g. the API is unreachable.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">تعذّر تحميل الصفحة</h1>
      <p className="text-ink-muted">
        قد يكون الخادم غير متاح الآن. حاول مرة أخرى بعد قليل.
      </p>
      <Button onClick={reset}>إعادة المحاولة</Button>
    </main>
  );
}
