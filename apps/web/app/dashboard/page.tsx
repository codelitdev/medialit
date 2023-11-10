"use client";

import Link from "next/link";
import PopoverNavMenu from "../components/PopoverNavMenu";

export default function Dashboard() {
    return (
        <>
            <nav className="flex justify-between">
                <div className="text-primary text-2xl font-extrabold">
                    <Link href="/">Medialit</Link>
                </div>
                <div>
                    <PopoverNavMenu />
                </div>
            </nav>
        </>
    );
}
