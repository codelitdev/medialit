import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMediaFiles, getCount } from "./actions";
import { Media } from "@medialit/models";
import { Button } from "@/components/ui/button";
import FilePreview from "./file-preview";

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
    } catch (error) {
        return <div>Something went wrong</div>;
    }

    return (
        <>
            <div className="border border-muted-foreground border-slate-200 min-h-[480px] my-5 rounded p-2 md:p-2 lg:p-0">
                <div className="flex flex-wrap gap-2.5 p-1 sm:gap-3 sm:p-5 md:gap-7 md:p-5 lg:gap-3">
                    {medias.map((media: any, index: number) => (
                        <FilePreview key={media.id} media={media} />
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-center gap-2">
                <Link href={`/app/${keyid}/files?page=${Number(page) - 1}`}>
                    <Button
                        disabled={page ? parseInt(page) <= 1 : true}
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
                <p>
                    <span className="font-bold">{page}</span> of {totalPages} (
                    {medias.length} Files)
                </p>
                <Link href={`/app/${keyid}/files?page=${Number(page) + 1}`}>
                    <Button
                        disabled={page ? parseInt(page) >= totalPages : true}
                        className={
                            page
                                ? parseInt(page) >= totalPages
                                    ? "!bg-muted-foreground"
                                    : ""
                                : ""
                        }
                    >
                        {" "}
                        Next{" "}
                    </Button>
                </Link>
            </div>
        </>
    );
}
