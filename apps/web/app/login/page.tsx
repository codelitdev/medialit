import LoginForm from "@/components/LoginForm";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-8 items-center">
      <h1 className="mt-40 font-bold text-2xl">Sign in</h1>
      <LoginForm />
      <p className="text-xs mb-40">
        By signing in, you agree to our{" "}
        <Link href="/terms">
          <span className="underline">Terms</span>
        </Link>{" "}
        and{" "}
        <Link href="/privacy">
          <span className="underline">Privacy policy</span>
        </Link>
        .
      </p>
    </div>
  );
}
