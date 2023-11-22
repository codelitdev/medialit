"use client";

import Button from "../components/Button";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

const apikeys = [
    {
        name: "Hola",
    },
    {
        name: "Hola2",
    },
    {
        name: "Hola3",
    },
    {
        name: "Hola4",
    },
    {
        name: "Hola5",
    },
];

export default function Dashboard() {
    const { data: session } = useSession();

    if (!session) {
        redirect("/api/auth/sign-in");
    }

    return (
        <>
        <div className="flex justify-between">
            <div className="text-primary text-xl font-bold">Your apps</div>
            <Button className="!w-20">New app</Button>
        </div>
            <div className="border border-secondary min-h-screen my-5 rounded p-2 md:p-2 lg:p-0">
                <div className="flex flex-wrap gap-2.5 p-1 sm:gap-3 sm:p-5 md:gap-3 md:p-5 lg:gap-3">
                    {apikeys.map((apikey: any, index: number) => (
                        <div
                            key={index}
                            className="shadow-[0_1px_4px_rgba(0,0,0,0.25)] relative h-[151px] w-[48%] sm:h-[151px] sm:w-[175px] md:h-[151px] md:w-[218px] lg:h-[151px] lg:w-[228px]"
                        >
                            <div className="flex items-center justify-center border h-[151px] w-full sm:h-[151px] sm:w-[175px] md:h-[151px] md:w-[218px] lg:h-[151px] lg:w-[228px]">
                                {apikey.name}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
