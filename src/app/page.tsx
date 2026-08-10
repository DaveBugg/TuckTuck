import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/auth";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE);

  if (token) {
    redirect("/dashboard");
  }
  redirect("/auth/login");
}
