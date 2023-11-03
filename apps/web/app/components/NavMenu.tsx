"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import styles from "./NavMenu.module.css";

function AuthButton() {
    const { data: session } = useSession();

    if (session) {
        return (
            <div className={styles.navbar}>
                {session?.user?.email} <br />
                <button onClick={() => signOut()}>Sign out</button>
            </div>
        );
    }
    return (
        <div className={styles.navbar}>
            Guest
            <button onClick={() => signIn()}>Sign in</button>
        </div>
    );
}

export default function NavMenu() {
    return (
        <div>
            <AuthButton />
        </div>
    );
}
