"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default async function Tabs({ params }: { params: { name: string } }) {
    const name = params.name;
    const currentPathName = usePathname();

    const tabs = [
        { name: "Files", href: `/dashboard/app/${name}/files` },
        { name: "Settings", href: `/dashboard/app/${name}/settings` },
    ];

    return (
        <>
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
        </>
    );
}
