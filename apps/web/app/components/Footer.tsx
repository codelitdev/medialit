"use client";

import React from "react";
import Link from "next/link";
import { GitHubLogoIcon, DiscordLogoIcon } from "@radix-ui/react-icons";

const Footer = () => {
    return (
        <footer className="bg-primary ">
            <div className="mx-auto max-w-[1024px] flex justify-between h-20 px-5 items-center">
                <div className="text-white text-sm">
                    &copy; 2023 CodeLit.dev. All rights reserved
                </div>
                <div className="text-white text-sm flex gap-4">
                    <Link
                        href={"https://github.com/codelitdev/medialit"}
                        target="_blank"
                    >
                        <GitHubLogoIcon className="w-5 h-5" />
                    </Link>
                    <Link
                        href={"https://discord.gg/AysdDP4wxe"}
                        target="_blank"
                    >
                        <DiscordLogoIcon className="w-5 h-5" />
                    </Link>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
