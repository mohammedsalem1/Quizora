import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getCurrentUser } from "@/lib/session";

export default async function StudentLayout({
  children,
}: LayoutProps<"/student">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "STUDENT") redirect("/");

  return (
    <>
      <AppHeader user={user} />
      {children}
    </>
  );
}
