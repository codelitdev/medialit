import { auth } from "@/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redirect } from "next/navigation";
import CopyApikeyButton from "./copy-apikey-button";
import UpdateSettingsForm from "./update-settings-form";
import { getApikeyUsingKeyId } from "@/app/actions";
import DeleteAppButton from "./delete-app-button";
import { getTotalSpaceByApikey } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default async function Settings(props: {
    params: Promise<{ keyid: string }>;
    searchParams: Promise<{ page: string }>;
}) {
    const params = await props.params;
    const session = await auth();
    if (!session) {
        redirect("/login");
    }

    const keyid = params.keyid;
    const apikey = await getApikeyUsingKeyId(keyid);

    if (!apikey) {
        return null;
    }

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
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-300"
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
