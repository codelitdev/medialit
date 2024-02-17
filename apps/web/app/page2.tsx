"use client";

import Link from "next/link";
import Features from "../components/features";
import Pricing from "../components/Pricing";
import Button from "../components/button";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
    const session = await auth();

    if (!session) {
        return redirect("/login");
    }

    return (
        <div className="flex flex-col gap-4 md:gap-8">
            <section className="mb-5 flex items-center justify-center text-center md:p-10 lg:p-20">
                <div className="p-4 flex flex-col items-center gap-4">
                    <div className="text-primary max-w-[640px] font-bold text-3xl md:text-4xl lg:text-6xl">
                        Easy file uploads for serverless apps
                    </div>
                    <p className="text-muted-foregroundP">
                        Upload, store, transform, deliver for your files.
                        Automatically generate thumbnails too!
                    </p>
                    <Link href={"/"}>
                        <Button>Get started</Button>
                    </Link>
                </div>
            </section>
            <Features />
            <Pricing />
        </div>
    );
}
