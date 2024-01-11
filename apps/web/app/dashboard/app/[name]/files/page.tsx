import Image from "next/image";
import Button from "@/components/Button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMediaFiles } from "./actions";

export default async function Media({
    params,
    searchParams,
}: {
    params: { name: string };
    searchParams: { page: string };
}) {
    const session = await auth();
    const name = params.name;
    const page = searchParams.page;
    const medias: any = await getMediaFiles(name, +page);

    // FIXME: Fix the total page (value is not coming correctly on frontend)
    const mediasPerPage = 10;
    const totalPages = medias
        ? Math.ceil(medias.length / Number(mediasPerPage))
        : 0;

    if (!session) {
        redirect("/login");
    }

    return (
        <>
            <div className="text-primary font-semibold mb-3">
                All apps /<span className="text-muted-foreground"> {name}</span>
            </div>
            <ul className="flex gap-2 font-bold text-xl">
                <li>
                    <Link
                        href={`/dashboard/app/${name}/files`}
                        className="hover:border-b-2 border-primary"
                    >
                        Files
                    </Link>
                </li>
                <li>
                    <Link
                        href={`/dashboard/app/${name}/settings`}
                        className="hover:border-b-2 border-primary"
                    >
                        Settings
                    </Link>
                </li>
            </ul>
            <div className="border border-muted-foreground min-h-screen my-5 rounded p-2 md:p-2 lg:p-0">
                <div className="flex flex-wrap gap-2.5 p-1 sm:gap-3 sm:p-5 md:gap-7 md:p-5 lg:gap-3">
                    {medias.map((media: any, index: number) => (
                        <div
                            key={index}
                            className="shadow-[0_1px_4px_rgba(0,0,0,0.25)] relative h-[148px] w-[48%] sm:h-[148px] sm:w-[148px] md:h-[148px] md:w-[148px] lg:h-[148px] lg:w-[148px]"
                        >
                            <div className="border bg-muted-foreground relative h-[148px] w-full sm:h-[148px] sm:w-[148px] md:h-[148px] md:w-[148px] lg:h-[148px] lg:w-[148px]">
                                <Image
                                    src={media.thumbnail}
                                    alt="Media"
                                    priority={true}
                                    quality={100}
                                    fill
                                />
                            </div>
                            <div className="p-2 absolute bottom-0 bg-white w-full">
                                <div className="text-sm truncate">
                                    {media.originalFileName}
                                </div>
                                <div className="text-muted-foreground text-sm">
                                    {media.mimeType.split("/")[0]}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-center gap-2">
                <Link
                    href={`/dashboard/app/${name}/files?page=${
                        Number(page) - 1
                    }`}
                >
                    <Button
                        disabled={page ? parseInt(page) <= 1 : ""}
                        className={
                            page
                                ? parseInt(page) <= 1
                                    ? "!bg-muted-foreground"
                                    : ""
                                : ""
                        }
                    >
                        Previous
                    </Button>
                </Link>
                {/* FIXME:  totalPages*/}
                <p>
                    <span className="font-bold">{page}</span> of {totalPages} (
                    {medias.length} Files)
                </p>
                <Link
                    href={`/dashboard/app/${name}/files?page=${
                        Number(page) + 1
                    }`}
                >
                    <Button> Next </Button>
                </Link>
            </div>
        </>
    );
}
