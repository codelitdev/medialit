"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Tabs({ appId }: { appId: string }) {
    const currentPathName = usePathname();

    const tabs = [
        { name: "Files", href: `/app/${appId}/files` },
        { name: "Settings", href: `/app/${appId}/settings` },
    ];

    return (
        <ul className="flex gap-2 font-bold text-xl py-2">
            {tabs.map((tab) => (
                <li key={tab.href}>
                    <Link
                        href={tab.href}
                        className={
                            currentPathName === tab.href
                                ? "border-b-2 border-primary"
                                : ""
                        }
                    >
                        {tab.name}
                    </Link>
                </li>
            ))}
        </ul>
    );
}
