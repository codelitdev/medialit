"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import Button from "../../components/Button";

export default function Dashboard() {
    const { data: session } = useSession();
    const [apiKeys, setApiKeys] = useState([]);

    if (!session) {
        redirect("/api/auth/sign-in");
    }

    const getApiKeys = async () => {
        const res = await fetch("/api/keys");
        if (res.status === 200) {
            const data = await res.json();
            setApiKeys(data);
        }
    };

    useEffect(() => {
        getApiKeys();
    }, []);

    return (
        <>
            <div className="flex justify-between">
                <div className="text-primary text-xl font-bold">Your apps</div>
                <Link href="/dashboard/app/new">
                    <Button className="!w-20">New app</Button>
                </Link>
            </div>
            <div className="border border-secondary min-h-screen my-5 rounded p-2 md:p-2 lg:p-0">
                <div className="flex flex-wrap gap-2.5 p-1 sm:gap-3 sm:p-5 md:gap-3 md:p-5 lg:gap-3">
                    {apiKeys.map((apikey: any, index: number) => (
                        <div
                            key={index}
                            className="shadow-[0_1px_4px_rgba(0,0,0,0.25)] relative h-[151px] w-[48%] sm:h-[151px] sm:w-[175px] md:h-[151px] md:w-[218px] lg:h-[151px] lg:w-[228px]"
                        >
                            <div className="flex items-center justify-center border h-[151px] w-full sm:h-[151px] sm:w-[175px] md:h-[151px] md:w-[218px] lg:h-[151px] lg:w-[228px]">
                                <Link href={`/dashboard/app/${apikey.name}/files`}>
                                    {apikey.name}
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
