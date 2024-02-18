import { auth } from "@/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redirect } from "next/navigation";
import CopyApikeyButton from "./copy-apikey-button";
import UpdateSettingsForm from "./update-settings-form";
import { getApikeyUsingKeyId } from "@/app/actions";
import DeleteAppButton from "./delete-app-button";
import { Separator } from "@/components/ui/separator";
import { getTotalSpaceByApikey } from "./actions";

export default async function Settings({
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
    const apikey = await getApikeyUsingKeyId(keyid);

    if (!apikey) {
        return null;
    }

    const totalSpaceOccupied = await getTotalSpaceByApikey(keyid);

    return (
        <section className="border border-muted-foreground border-slate-200 min-h-[480px] my-4 rounded p-4 flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <Label htmlFor="name" className="mb-2">
                    Storage
                </Label>
                <p className="font-semibold">
                    {(totalSpaceOccupied / 1024 / 1024).toFixed(2)} MB
                </p>
            </div>
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
            <UpdateSettingsForm name={apikey.name} />
            <Separator className="my-8" />
            <DeleteAppButton apikey={apikey} />
        </section>
    );
}
