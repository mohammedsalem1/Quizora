import { getCurrentUser } from "@/lib/session";

// Placeholder until the student quiz flow (Phases 6–7) gives students something to see.
export default async function StudentHome() {
  const user = await getCurrentUser(); // the layout has already checked this is a student

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8">
      <h1 dir="auto" className="text-2xl font-semibold">
        أهلاً {user?.fullName}
      </h1>
      <p className="text-ink-muted">
        ستظهر هنا اختبارات صفّك عندما يفتحها معلّموك.
      </p>
    </main>
  );
}
