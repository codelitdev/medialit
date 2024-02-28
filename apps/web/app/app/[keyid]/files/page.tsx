import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMediaFiles, getCount } from "./actions";
import { Media } from "@medialit/models";
import FilePreview from "./file-preview";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    DoubleArrowLeftIcon,
    DoubleArrowRightIcon,
} from "@radix-ui/react-icons";

export default async function Media({
    params,
    searchParams,
}: {
    params: { keyid: string };
    searchParams: { page: string };
}) {
    const session = await auth();
    if (!session) {
        redirect("/login");
    }

    const keyid = params.keyid;
    const page = searchParams.page || "1";
    let medias: Media[] = [];
    const mediasPerPage = 10;
    let totalPages = 0;
    let totalMediaCount;
    try {
        totalMediaCount = await getCount(keyid);
        medias = await getMediaFiles(keyid, +page);
        totalPages = medias
            ? Math.ceil(totalMediaCount.count / Number(mediasPerPage))
            : 0;

        totalPages === 0 ? (totalPages = 1) : totalPages;
    } catch (error: any) {
        return <div>Something went wrong: {error.message}</div>;
    }

    return (
        <>
            <div className="border border-muted-foreground border-slate-200 min-h-[480px] my-5 rounded p-2 md:p-2 lg:p-0">
                <div className="flex flex-wrap gap-2.5 p-1 sm:gap-3 sm:p-5 md:gap-7 md:p-5 lg:gap-3">
                    {medias.map((media: any, index: number) => (
                        <FilePreview
                            key={media.id}
                            media={media}
                            keyid={keyid}
                        />
                    ))}
                </div>
            </div>
            <Pagination>
                <PaginationContent>
                    <PaginationItem>
                        <PaginationLink
                            href={`/app/${keyid}/files?page=${1}`}
                            className={`
                     ${
                         parseInt(page) === 1
                             ? "pointer-events-none text-slate-400"
                             : ""
                     }
                 `}
                        >
                            <DoubleArrowLeftIcon className="h-4 w-4" />
                        </PaginationLink>
                    </PaginationItem>
                    <PaginationItem
                        className={`
                                    ${
                                        parseInt(page) === 1
                                            ? "pointer-events-none text-slate-400"
                                            : ""
                                    }
                                `}
                    >
                        <PaginationPrevious
                            href={
                                parseInt(page) === 1
                                    ? `/app/${keyid}/files?page=${Number(page)}`
                                    : `/app/${keyid}/files?page=${
                                          Number(page) - 1
                                      }`
                            }
                        />
                    </PaginationItem>
                    <PaginationItem className="text-sm">
                        <span className="font-bold">{page}</span> of{" "}
                        {totalPages} ({medias.length} Files)
                    </PaginationItem>
                    <PaginationItem
                        className={`
                                    ${
                                        parseInt(page) === totalPages
                                            ? "pointer-events-none text-slate-400"
                                            : ""
                                    }
                                `}
                    >
                        <PaginationNext
                            href={`/app/${keyid}/files?page=${
                                Number(page) + 1
                            }`}
                        />
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationLink
                            href={`/app/${keyid}/files?page=${totalPages}`}
                            className={`
                        ${
                            parseInt(page) === totalPages
                                ? "pointer-events-none text-slate-400"
                                : ""
                        }
                    `}
                        >
                            <DoubleArrowRightIcon className="h-4 w-4" />
                        </PaginationLink>
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        </>
    );
}
