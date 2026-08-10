import { auth } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderPlus, FileText, Youtube } from "lucide-react";
import {
    DoubleArrowLeftIcon,
    DoubleArrowRightIcon,
} from "@radix-ui/react-icons";
import { AlertTriangle } from "lucide-react";

import { getApiKeys, getApikeyUsingKeyId } from "./actions";
import { resolveCurrentKeyId } from "@/lib/current-app";
import NewApp from "@/components/new-app-button";
import { Button } from "@/components/ui/codelit/button";
import { Card, CardContent } from "@/components/ui/codelit/card";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/codelit/tabs";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

import { getMediaFiles, getCount } from "./app/[keyid]/files/actions";
import FilePreview from "./app/[keyid]/files/file-preview";
import { getTotalSpaceByApikey } from "./app/[keyid]/settings/actions";
import CopyApikeyButton from "./app/[keyid]/settings/copy-apikey-button";
import UpdateSettingsForm from "./app/[keyid]/settings/update-settings-form";
import DeleteAppButton from "./app/[keyid]/settings/delete-app-button";

const MEDIAS_PER_PAGE = 10;

export default async function Home(props: {
    searchParams: Promise<{ tab?: string; page?: string }>;
}) {
    const session = await auth();
    if (!session) {
        redirect("/login");
    }

    const apiKeys = (await getApiKeys()) ?? [];

    if (apiKeys.length === 0) {
        return (
            <>
                <div className="flex justify-between mb-8">
                    <div className="text-primary text-xl font-bold">
                        Your apps
                    </div>
                    <NewApp />
                </div>
                <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                    <FolderPlus className="w-16 h-16 text-muted-foreground" />
                    <p className="text-muted-foreground text-lg">No apps yet</p>
                    <p className="text-muted-foreground text-sm">
                        Create your first app to start uploading files
                    </p>
                </div>
            </>
        );
    }

    const keyid = await resolveCurrentKeyId(apiKeys);
    const apikey = keyid ? await getApikeyUsingKeyId(keyid) : null;

    if (!keyid || !apikey) {
        return null;
    }

    const searchParams = await props.searchParams;
    const tab = searchParams.tab === "settings" ? "settings" : "files";

    return (
        <>
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">{apikey.name}</h1>
                <NewApp />
            </div>
            <Tabs defaultValue={tab} className="w-full mb-8">
                <TabsList>
                    <Link href="/?tab=files">
                        <TabsTrigger value="files">Files</TabsTrigger>
                    </Link>
                    <Link href="/?tab=settings">
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                    </Link>
                </TabsList>
            </Tabs>
            {tab === "files" ? (
                <FilesTab keyid={keyid} page={searchParams.page || "1"} />
            ) : (
                <SettingsTab keyid={keyid} apikey={apikey} />
            )}
        </>
    );
}

async function FilesTab({ keyid, page }: { keyid: string; page: string }) {
    let medias: Awaited<ReturnType<typeof getMediaFiles>>;
    let totalPages: number;
    let totalMediaCount: number;
    try {
        totalMediaCount = await getCount(keyid);
        medias = await getMediaFiles(keyid, +page);
        totalPages = medias ? Math.ceil(totalMediaCount / MEDIAS_PER_PAGE) : 0;
        if (totalPages === 0) totalPages = 1;
    } catch (error: any) {
        return <div>Something went wrong: {error.message}</div>;
    }

    if (medias.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">
                    Upload your first file
                </h3>
                <div className="flex gap-2">
                    <Button asChild variant="outline">
                        <a
                            href="https://www.youtube.com/watch?v=QrYn82zK4es"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Youtube className="w-4 h-4" />
                            Watch tutorial
                        </a>
                    </Button>
                    <Button asChild variant="outline">
                        <a
                            href="https://medialit.cloud/blog/getting-started/MRAoM_zAiywn_d4Lnqm0A"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Open Docs
                        </a>
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start mb-8">
                {medias.map((media: any) => (
                    <FilePreview
                        key={media.mediaId}
                        media={media}
                        keyid={keyid}
                    />
                ))}
            </div>
            <Pagination>
                <PaginationContent>
                    <PaginationItem>
                        <PaginationLink
                            href={`/?tab=files&page=${1}`}
                            className={
                                parseInt(page) === 1
                                    ? "pointer-events-none text-muted-foreground"
                                    : ""
                            }
                        >
                            <DoubleArrowLeftIcon className="h-4 w-4" />
                        </PaginationLink>
                    </PaginationItem>
                    <PaginationItem
                        className={
                            parseInt(page) === 1
                                ? "pointer-events-none text-muted-foreground"
                                : ""
                        }
                    >
                        <PaginationPrevious
                            href={
                                parseInt(page) === 1
                                    ? `/?tab=files&page=${Number(page)}`
                                    : `/?tab=files&page=${Number(page) - 1}`
                            }
                        />
                    </PaginationItem>
                    <PaginationItem className="text-sm">
                        <span className="font-bold">{page}</span> of{" "}
                        {totalPages} ({totalMediaCount} Files)
                    </PaginationItem>
                    <PaginationItem
                        className={
                            parseInt(page) === totalPages
                                ? "pointer-events-none text-muted-foreground"
                                : ""
                        }
                    >
                        <PaginationNext
                            href={`/?tab=files&page=${Number(page) + 1}`}
                        />
                    </PaginationItem>
                    <PaginationItem>
                        <PaginationLink
                            href={`/?tab=files&page=${totalPages}`}
                            className={
                                parseInt(page) === totalPages
                                    ? "pointer-events-none text-muted-foreground"
                                    : ""
                            }
                        >
                            <DoubleArrowRightIcon className="h-4 w-4" />
                        </PaginationLink>
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        </>
    );
}

async function SettingsTab({
    keyid,
    apikey,
}: {
    keyid: string;
    apikey: NonNullable<Awaited<ReturnType<typeof getApikeyUsingKeyId>>>;
}) {
    const { storage, maxStorage } = await getTotalSpaceByApikey(keyid);

    return (
        <>
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <Label htmlFor="name" className="mb-2">
                                Storage
                            </Label>
                            <p className="font-semibold">
                                {(storage / 1024 / 1024).toFixed(2)} MB
                            </p>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full transition-all duration-300"
                                style={{
                                    width: `${Math.min((storage / maxStorage) * 100, 100)}%`,
                                }}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
            <Card className="my-4">
                <CardContent className="pt-6">
                    <div className="flex flex-col gap-4">
                        <div>
                            <Label htmlFor="apikey" className="mb-2">
                                Apikey
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    id="apikey"
                                    value={apikey.key}
                                    type="password"
                                    disabled
                                />
                                <CopyApikeyButton apikey={apikey.key} />
                            </div>
                        </div>
                        <UpdateSettingsForm
                            keyId={apikey.keyId}
                            name={apikey.name}
                        />
                    </div>
                </CardContent>
            </Card>
            <Card className="border-destructive">
                <CardContent className="pt-6">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            <h3 className="font-semibold">Danger Zone</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Once you delete an app, there is no going back.
                            Please be certain.
                        </p>
                        <DeleteAppButton apikey={apikey} />
                    </div>
                </CardContent>
            </Card>
        </>
    );
}
