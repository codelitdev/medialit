import { auth } from "@/auth";
import LoginForm from "@/components/login-form";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function LoginPage() {
    const session = await auth();

    if (session) {
        redirect("/");
    }

    return (
        <div className="flex flex-col gap-8 items-center">
            <h1 className="mt-40 font-bold text-2xl">Sign in</h1>
            <LoginForm />
            <p className="text-xs mb-40">
                By signing in, you agree to our{" "}
                <a href="https://medialit.cloud/p/terms">
                    <span className="underline">Terms</span>
                </a>{" "}
                and{" "}
                <a href="https://medialit.cloud/p/privacy">
                    <span className="underline">Privacy policy</span>
                </a>
                .
            </p>
        </div>
    );
}
