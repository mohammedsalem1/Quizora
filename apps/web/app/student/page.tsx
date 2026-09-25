import { StudentQuizList } from "@/components/StudentQuizList";
import { getCurrentUser } from "@/lib/session";

export default async function StudentHome() {
  const user = await getCurrentUser(); // the layout has already checked this is a student

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <h1 dir="auto" className="text-2xl font-semibold">
        أهلاً {user?.fullName}
      </h1>
      <StudentQuizList />
    </main>
  );
}
