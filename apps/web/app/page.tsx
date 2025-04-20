import { auth } from "@/auth";
import { getApiKeys } from "./actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewApp from "@/components/new-app-button";
import { FolderPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getTotalSpaceByApikey } from "./app/[keyid]/settings/actions";

export default async function Home() {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }
    const apiKeys: any = await getApiKeys();

    return (
        <>
            {/* <Card>
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
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-blue-500 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min((storage / maxStorage) * 100, 100)}%` }}
                        />
                    </div>
                </div>
            </CardContent>
        </Card> */}
            <div className="flex justify-between mb-8">
                <div className="text-primary text-xl font-bold">Your apps</div>
                <NewApp />
            </div>
            <div className="">
                {apiKeys?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {apiKeys.map((apikey: any) => (
                            <Link
                                href={`/app/${apikey.keyId}/files`}
                                key={apikey.keyId}
                            >
                                <Card className="h-[151px] hover:bg-accent transition-colors">
                                    <CardContent className="flex items-center justify-center h-full p-6">
                                        <span className="text-lg font-medium">
                                            {apikey.name || "Untitled"}
                                        </span>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-[400px] gap-4">
                        <FolderPlus className="w-16 h-16 text-muted-foreground" />
                        <p className="text-muted-foreground text-lg">
                            No apps yet
                        </p>
                        <p className="text-muted-foreground text-sm">
                            Create your first app to start uploading files
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}
