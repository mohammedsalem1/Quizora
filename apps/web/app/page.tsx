import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

// Sends each user to their own area.
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.role === "TEACHER" ? "/teacher" : "/student");
}
