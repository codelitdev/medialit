import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import Button from "./Button";
import PopoverNavMenu from "./PopoverNavMenu";
// import { usePathname } from "next/navigation";
import { auth } from "@/auth";
import AuthButton from "./AuthButton";

export default async function NavMenu() {
    const session = await auth();
    // const pathname = usePathname();

    return (
        <>
            {session ? (
                <nav className="flex justify-between p-4">
                    <div className="flex items-center space-x-4">
                        <div className="text-primary text-2xl font-extrabold">
                            <Link href="/">Medialit</Link>
                        </div>
                        <ul className="hidden md:flex md:gap-2 md:item-center text-lg text-primary font-normal">
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
                        <ul className="hidden md:flex md:gap-2 md:item-center text-lg text-primary font-normal">
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

                    <div className="md:hidden">
                        <PopoverNavMenu />
                    </div>
                    <div className="hidden md:block">
                        <AuthButton />
                    </div>
                </nav>
            )}
        </>
    );
};
