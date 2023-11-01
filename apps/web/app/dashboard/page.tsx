"use client";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function Dashboard() {
    const { data: session } = useSession();

    return (
        <div>
            <Link href="/">Home</Link>
            {session?.user && <>Welcome {session?.user?.email}</>}
        </div>
    );
}
