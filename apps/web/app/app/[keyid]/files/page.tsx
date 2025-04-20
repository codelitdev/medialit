import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMediaFiles, getCount } from "./actions";
import type { Media } from "@medialit/models";
import FilePreview from "./file-preview";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    DoubleArrowLeftIcon,
    DoubleArrowRightIcon,
} from "@radix-ui/react-icons";
import { FileText, Youtube } from "lucide-react";

export default async function Media(props: {
    params: Promise<{ keyid: string }>;
    searchParams: Promise<{ page: string }>;
}) {
    const searchParams = await props.searchParams;
    const params = await props.params;
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

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        totalPages === 0 ? (totalPages = 1) : totalPages;
    } catch (error: any) {
        return <div>Something went wrong: {error.message}</div>;
    }

    return (
        <>
            {medias.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">
                        Upload your first file
                    </h3>
                    <div className="flex gap-2">
                        <a
                            href="https://www.youtube.com/watch?v=QrYn82zK4es"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                        >
                            <Youtube className="w-4 h-4 mr-2" />
                            Watch tutorial
                        </a>
                        <a
                            href="https://medialit.cloud/blog/getting-started/MRAoM_zAiywn_d4Lnqm0A"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                        >
                            Open Docs
                        </a>
                    </div>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start mb-8">
                        {medias.map((media: any, index: number) => (
                            <FilePreview
                                key={media.id}
                                media={media}
                                keyid={keyid}
                            />
                        ))}
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
            )}
        </>
    );
}
