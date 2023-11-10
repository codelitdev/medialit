"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Button from "./Button";
import PopoverNavMenu from "./PopoverNavMenu";

function AuthButton() {
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

const NavMenu = () => {
    const { data: session } = useSession();

    return (
        <>
            {session ? (
                <nav className="flex justify-between p-4">
                    <div className="text-primary text-2xl font-extrabold">
                        <Link href="/">Medialit</Link>
                    </div>
                    <div>
                        <PopoverNavMenu />
                    </div>
                </nav>
            ) : (
                <nav className="bg-white flex items-center justify-between p-4">
                    <div className="flex items-center space-x-4">
                        <div className="text-primary text-2xl font-extrabold">
                            <Link href="/">Medialit</Link>
                        </div>
                        <ul className="flex gap-2 text-lg text-primary font-normal item-center">
                            <li>
                                <Link href="/#features">Features</Link>
                            </li>
                            <li>
                                <Link href="/#pricing">Pricing</Link>
                            </li>
                            <li>
                                <Link href="/docs">Docs</Link>
                            </li>
                        </ul>
                    </div>

                    {session ? (
                        <PopoverNavMenu />
                    ) : (
                        <div className="flex items-center gap-2">
                            <AuthButton />
                        </div>
                    )}
                </nav>
            )}
        </>
    );
};

export default NavMenu;
