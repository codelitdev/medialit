"use client";

import Link from "next/link";
import Features from "./components/Features";
import Pricing from "./components/Pricing";
import Button from "./components/Button";

export default function Home() {
    return (
        <>
            <section className="mb-5 flex items-center justify-center text-center p-20">
                <div className="p-4 flex flex-col items-center gap-4">
                    <div className="text-primary w-[640px] font-bold text-6xl ">
                        Easy file uploads for serverless apps
                    </div>
                    <p className="text-secondary">
                        Upload, store, transform, deliver for your files.
                        Automatically generate thumbnails too!
                    </p>
                    <Link href={"/dashboard"}>
                       <Button>Get started</Button>
                    </Link>
                </div>
            </section>
            <Features />
            <Pricing />
        </>
    );
}
