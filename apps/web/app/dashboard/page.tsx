"use client";

import Image from "next/image";
import Button from "../components/Button";

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
];

export default function Dashboard() {

    return (
        <>
            <div className="text-primary text-xl font-bold">Your files</div>
            <div className="border border-secondary min-h-screen my-5 p-4 rounded">
                <div className="flex flex-wrap gap-5 p-2">
                    {medias.map((media: any) => (
                        <div className="shadow-[0_1px_4px_rgba(0,0,0,0.25)] h-[148px] w-[148px] relative">
                            <div className="border bg-secondary h-[148px] w-[148px]">
                                <Image
                                    src={media.thumbnail}
                                    width={0}
                                    height={0}
                                    alt="Media"
                                />
                            </div>
                            <div className="p-2 absolute bottom-0 bg-white w-full">
                                <div>{media.originalFileName}</div>
                                <div className="text-secondary">
                                    {media.mimeType.split("/")[0]}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex items-center justify-center gap-2">
                <Button className="bg-secondary "> Previous </Button>
                <p> <span className="font-bold">1</span> of 10 (98 Files) </p>
                <Button> Next </Button>
            </div>
        </>
    );
}
