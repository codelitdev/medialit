"use client";

import React from "react";
import * as Popover from "@radix-ui/react-popover";
import {
    AvatarIcon,
    GearIcon,
    BackpackIcon,
    ExitIcon,
    DashboardIcon
} from "@radix-ui/react-icons";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

const PopoverNavMenu = () => {
    const { data: session, status } = useSession();
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
                        className="rounded p-3 w-[200px] bg-white shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2)] focus:shadow-[0_10px_38px_-10px_hsla(206,22%,7%,.35),0_10px_20px_-15px_hsla(206,22%,7%,.2), will-change-[transform,opacity] data-[state=open]:data-[side=top]:animate-slideDownAndFade data-[state=open]:data-[side=right]:animate-slideLeftAndFade data-[state=open]:data-[side=bottom]:animate-slideUpAndFade data-[state=open]:data-[side=left]:animate-slideRightAndFade"
                        sideOffset={5}
                    >
                        <div className="flex flex-col gap-2.5">
                            <p className="text-secondary truncate w-15">
                                {session?.user && session?.user?.email}
                            </p>
                            <p className="text-[15px] flex gap-2 items-center">
                                <Link href='/dashboard' className="text-[15px] flex gap-2 items-center">
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
                            <p>
                                <button
                                    onClick={() => signOut()}
                                    className="text-[15px] flex gap-2 items-center"
                                >
                                    <ExitIcon />
                                    Logout
                                </button>
                            </p>
                        </div>
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
        </>
    );
};

export default PopoverNavMenu;
