"use client";

import React from "react";
import * as Popover from "@radix-ui/react-popover";
import {
    AvatarIcon,
    GearIcon,
    BackpackIcon,
    ExitIcon,
    DashboardIcon,
} from "@radix-ui/react-icons";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { auth } from "@/auth";

const PopoverNavMenu = async () => {
    // const { data: session } = useSession();
    const session = await auth()
    const pathname = usePathname();

    return (
        <>
            <Popover.Root>
                <Popover.Trigger asChild>
                    <button
                        className="rounded-full w-[38px] h-[38px] inline-flex items-center justify-center text-white bg-primary hover:bg-[#333333]  "
                        aria-label="Update dimensions"
                    >
                        <AvatarIcon className="w-6 h-6 " />
                    </button>
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content
                        align="end"
                        className="rounded p-3 w-[180px] bg-white shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2)] focus:shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2), will-change-[transform,opacity] data-[state=open]:data-[side=top]:animate-slideDownAndFade data-[state=open]:data-[side=right]:animate-slideLeftAndFade data-[state=open]:data-[side=bottom]:animate-slideUpAndFade data-[state=open]:data-[side=left]:animate-slideRightAndFade"
                        sideOffset={5}
                    >
                        <div className="flex flex-col gap-2.5">
                            {session ? (
                                <>
                                    <p className="text-secondary truncate w-15">
                                        {session?.user && session?.user?.email}
                                    </p>
                                    <p className="text-[15px] flex gap-2 items-center">
                                        <Link
                                            href="/dashboard"
                                            className="text-[15px] flex gap-2 items-center"
                                        >
                                            <DashboardIcon />
                                            Dashboard
                                        </Link>
                                    </p>
                                    <p className="text-[15px] flex gap-2 items-center">
                                        <GearIcon />
                                        Settings
                                    </p>
                                    <p className="text-[15px] flex gap-2 items-center">
                                        <BackpackIcon />
                                        Billing
                                    </p>
                                    <p className="border-t"></p>

                                    {pathname === "/" ? (
                                        <div className="md:hidden flex flex-col gap-2">
                                            <p className="text-[15px] flex gap-2 items-center">
                                                <Link href="/#features">
                                                    Features
                                                </Link>
                                            </p>
                                            <p className="text-[15px] flex gap-2 items-center">
                                                <Link href="/#pricing">
                                                    Pricing
                                                </Link>
                                            </p>
                                            <p className="text-[15px] flex gap-2 items-center">
                                                <Link href="/docs">Docs</Link>
                                            </p>
                                            <p className="border-t"></p>
                                        </div>
                                    ) : (
                                        ""
                                    )}
                                    <p>
                                        <button
                                            onClick={() => signOut()}
                                            className="text-[15px] flex gap-2 items-center"
                                        >
                                            <ExitIcon />
                                            Logout
                                        </button>
                                    </p>
                                </>
                            ) : (
                                <ul className="md:hidden flex flex-col gap-1 p-1 text-[15px] text-primary font-normal">
                                    <li>
                                        <Link href="/#features">Features</Link>
                                    </li>
                                    <li>
                                        <Link href="/#pricing">Pricing</Link>
                                    </li>
                                    <li>
                                        <Link href="/docs">Docs</Link>
                                    </li>
                                    <p className="border-t"></p>
                                    <button
                                        onClick={() => signIn()}
                                        className="text-[15px] flex gap-2 items-center"
                                    >
                                        SignIn
                                    </button>
                                </ul>
                            )}
                        </div>
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
        </>
    );
};

export default PopoverNavMenu;
