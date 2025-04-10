import { auth } from "@/auth";
import { getApiKeys } from "./actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewApp from "@/components/new-app-button";

export default async function Home() {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }
    const apiKeys: any = await getApiKeys();

    return (
        <>
            <div className="flex justify-between">
                <div className="text-primary text-xl font-bold">Your apps</div>
                <NewApp />
            </div>
            <div className="border border-muted-foreground min-h-screen my-5 rounded p-2 md:p-2 lg:p-0">
                <div className="flex flex-wrap gap-2.5 p-1 sm:gap-3 sm:p-5 md:gap-3 md:p-5 lg:gap-3">
                    {apiKeys?.map((apikey: any, index: number) => (
                        <div
                            key={apikey.keyId}
                            className="shadow-[0_1px_4px_rgba(0,0,0,0.25)] relative h-[151px] w-[48%] sm:h-[151px] sm:w-[175px] md:h-[151px] md:w-[218px] lg:h-[151px] lg:w-[228px]"
                        >
                            <div className="flex items-center justify-center border h-[151px] w-full sm:h-[151px] sm:w-[175px] md:h-[151px] md:w-[218px] lg:h-[151px] lg:w-[228px]">
                                <Link href={`/app/${apikey.keyId}/files`}>
                                    {apikey.name || "Untitled"}
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
