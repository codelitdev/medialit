"use client";

import { useFormState, useFormStatus } from "react-dom";
import { authenticate, sendCode } from "../app/actions";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { redirect, useRouter } from "next/navigation";

export default function LoginForm() {
    const [codeFormState, sendCodeFormAction] = useFormState(sendCode, {
        success: false,
    });
    const [verifyFormState, verifyCodeFormAction] = useFormState(authenticate, {
        success: false,
        checked: false,
    });
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const router = useRouter();

    if (verifyFormState.checked && verifyFormState.success) {
        router.refresh();
        redirect("/");
    }

    return (
        <>
            {codeFormState.success && (
                <form
                    action={verifyCodeFormAction}
                    className="flex flex-col gap-2 max-w-[300px]"
                >
                    {verifyFormState.error && (
                        <p className="text-red-500 text-sm font-bold">
                            Can&apos;t sign you in at this moment. Reason:{" "}
                            {verifyFormState.error}.
                        </p>
                    )}
                    <Input
                        id="email"
                        type="email"
                        name="email"
                        placeholder="Username"
                        hidden={true}
                        value={email}
                        readOnly
                        required
                    />
                    <Input
                        id="code"
                        type="code"
                        name="code"
                        placeholder="Code"
                        required
                        onChange={(e) => setCode(e.target.value)}
                        value={code}
                        minLength={6}
                    />
                    <Submit>Login</Submit>
                </form>
            )}
            {!codeFormState.success && (
                <form
                    action={sendCodeFormAction}
                    className="flex flex-col gap-2"
                >
                    {codeFormState.error && (
                        <p className="text-red-500">{codeFormState.error}</p>
                    )}
                    <Input
                        id="email"
                        type="email"
                        name="email"
                        placeholder="your@email.com"
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <Submit>Get code</Submit>
                </form>
            )}
        </>
    );
}

function Submit({ children }: { children: React.ReactNode }) {
    const status = useFormStatus();

    return (
        <Button type="submit" disabled={status.pending}>
            {children}
        </Button>
    );
}
