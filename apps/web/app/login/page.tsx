"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function sendCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setPending(true);
        const response = await fetch(
            "/api/auth/email-otp/send-verification-otp",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, type: "sign-in" }),
            },
        );
        setPending(false);
        if (!response.ok) {
            setError("Unable to send a sign-in code.");
            return;
        }
        setSent(true);
    }

    async function verifyCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setPending(true);
        const response = await fetch("/api/auth/sign-in/email-otp", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                email,
                otp,
                name: email.split("@")[0],
            }),
        });
        setPending(false);
        if (!response.ok) {
            setError("That code is invalid or expired.");
            return;
        }
        window.location.assign("/");
    }

    return (
        <Card className="max-w-md mx-auto">
            <CardHeader>
                <CardTitle>Sign in</CardTitle>
            </CardHeader>
            <CardContent>
                {!sent ? (
                    <form onSubmit={sendCode} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                                required
                            />
                        </div>
                        <Button type="submit" disabled={pending}>
                            Send sign-in code
                        </Button>
                    </form>
                ) : (
                    <form onSubmit={verifyCode} className="flex flex-col gap-4">
                        <p>Enter the code sent to {email}.</p>
                        <p className="text-sm text-muted-foreground">
                            In local development, the API prints the code to the
                            console.
                        </p>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="otp">Sign-in code</Label>
                            <Input
                                id="otp"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                value={otp}
                                onChange={(event) => setOtp(event.target.value)}
                                required
                            />
                        </div>
                        <Button type="submit" disabled={pending}>
                            Sign in
                        </Button>
                    </form>
                )}
                {error ? (
                    <p className="text-red-500 mt-4" role="alert">
                        {error}
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );
}
