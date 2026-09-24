import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getCurrentUser } from "@/lib/session";

export default async function TeacherLayout({
  children,
}: LayoutProps<"/teacher">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "TEACHER") redirect("/");

  return (
    <>
      <AppHeader user={user} />
      {children}
    </>
  );
}
