import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/auth";
import AuthForm from "@/components/auth/AuthForm";

export const metadata = { title: "Sign In — Forex Signal Analyzer" };

export default async function AuthPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/");

  return <AuthForm />;
}
