"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import Button from "@/app/components/Button";
import Link from "next/link";

const medias = [
    {
        mediaId: "nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR",
        originalFileName: "banner.png",
        mimeType: "image/png",
        size: 57252,
        access: "private",
        thumbnail:
            "https://courselit-test.sgp1.cdn.digitaloceanspaces.com/medialit-service/nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR/thumb.webp",
        caption: "CourseLit banner",
        group: "true",
    },
    {
        mediaId: "nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR",
        originalFileName: "banner.png",
        mimeType: "image/png",
        size: 57252,
        access: "private",
        thumbnail:
            "https://courselit-test.sgp1.cdn.digitaloceanspaces.com/medialit-service/nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR/thumb.webp",
        caption: "CourseLit banner",
        group: "true",
    },
    {
        mediaId: "nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR",
        originalFileName: "banner.png",
        mimeType: "image/png",
        size: 57252,
        access: "private",
        thumbnail:
            "https://courselit-test.sgp1.cdn.digitaloceanspaces.com/medialit-service/nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR/thumb.webp",
        caption: "CourseLit banner",
        group: "true",
    },
    {
        mediaId: "nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR",
        originalFileName: "banner.png",
        mimeType: "image/png",
        size: 57252,
        access: "private",
        thumbnail:
            "https://courselit-test.sgp1.cdn.digitaloceanspaces.com/medialit-service/nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR/thumb.webp",
        caption: "CourseLit banner",
        group: "true",
    },
    {
        mediaId: "nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR",
        originalFileName: "banner.png",
        mimeType: "image/png",
        size: 57252,
        access: "private",
        thumbnail:
            "https://courselit-test.sgp1.cdn.digitaloceanspaces.com/medialit-service/nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR/thumb.webp",
        caption: "CourseLit banner",
        group: "true",
    },
    {
        mediaId: "nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR",
        originalFileName: "banner.png",
        mimeType: "image/png",
        size: 57252,
        access: "private",
        thumbnail:
            "https://courselit-test.sgp1.cdn.digitaloceanspaces.com/medialit-service/nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR/thumb.webp",
        caption: "CourseLit banner",
        group: "true",
    },
    {
        mediaId: "nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR",
        originalFileName: "banner.png",
        mimeType: "image/png",
        size: 57252,
        access: "private",
        thumbnail:
            "https://courselit-test.sgp1.cdn.digitaloceanspaces.com/medialit-service/nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR/thumb.webp",
        caption: "CourseLit banner",
        group: "true",
    },
    {
        mediaId: "nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR",
        originalFileName: "banner.png",
        mimeType: "image/png",
        size: 57252,
        access: "private",
        thumbnail:
            "https://courselit-test.sgp1.cdn.digitaloceanspaces.com/medialit-service/nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR/thumb.webp",
        caption: "CourseLit banner",
        group: "true",
    },
    {
        mediaId: "nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR",
        originalFileName: "banner.png",
        mimeType: "image/png",
        size: 57252,
        access: "private",
        thumbnail:
            "https://courselit-test.sgp1.cdn.digitaloceanspaces.com/medialit-service/nJ9WqHNxfRH8h9W_QAAQzzEMoymhYV5h4Jtyp_WR/thumb.webp",
        caption: "CourseLit banner",
        group: "true",
    },
];

export default function Apikey() {
    const { data: session } = useSession();

    if (!session) {
        redirect("/api/auth/sign-in");
    }

    return (
        <>
            <div className="text-primary font-semibold mb-3">
                All apps /<span className="text-secondary"> Hola</span>
            </div>
            <ul className="flex gap-2 font-bold text-xl">
                <li>
                    <Link href="#" className="hover:border-b-2 border-primary">
                        Files
                    </Link>
                </li>
                <li>
                    <Link href="#" className="hover:border-b-2 border-primary">
                        Settings
                    </Link>
                </li>
            </ul>
            <div className="border border-secondary min-h-screen my-5 rounded p-2 md:p-2 lg:p-0">
                <div className="flex flex-wrap gap-2.5 p-1 sm:gap-3 sm:p-5 md:gap-7 md:p-5 lg:gap-3">
                    {medias.map((media: any, index: number) => (
                        <div
                            key={index}
                            className="shadow-[0_1px_4px_rgba(0,0,0,0.25)] relative h-[148px] w-[48%] sm:h-[148px] sm:w-[148px] md:h-[148px] md:w-[148px] lg:h-[148px] lg:w-[148px]"
                        >
                            <div className="border bg-secondary h-[148px] w-full sm:h-[148px] sm:w-[148px] md:h-[148px] md:w-[148px] lg:h-[148px] lg:w-[148px]">
                                <Image
                                    src={media.thumbnail}
                                    width={0}
                                    height={0}
                                    alt="Media"
                                />
                            </div>
                            <div className="p-2 absolute bottom-0 bg-white w-full">
                                <div className="text-sm">
                                    {media.originalFileName}
                                </div>
                                <div className="text-secondary text-sm">
                                    {media.mimeType.split("/")[0]}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex items-center justify-center gap-2">
                <Button className="bg-secondary "> Previous </Button>
                <p>
                    <span className="font-bold">1</span> of 10 (98 Files){" "}
                </p>
                <Button> Next </Button>
            </div>
        </>
    );
}
