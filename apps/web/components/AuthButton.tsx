'use client'

import Button from "./Button";
import { signIn, signOut, useSession } from "next-auth/react";

export default function AuthButton() {
    const { data: session } = useSession();
    if (session) {
        return (
            <div>
                <Button className={"w-20"} onClick={() => signOut()}>
                    Sign out
                </Button>
            </div>
        );
    }
    return (
        <div>
            <Button className="w-20" onClick={() => signIn()}>
                Sign in
            </Button>
        </div>
    );
}