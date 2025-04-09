"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Media } from "@medialit/models";
import { useState } from "react";

export default function FileInteractivity({
    media,
    keyid,
}: {
    media: Media & {
        access: "public" | "private";
    };
    keyid: string;
}) {
    const { toast } = useToast();
    const [fileDirectLink, setFileDirectLink] = useState();
    const [loading, setLoading] = useState(false);

    const directLink = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/app/${keyid}/files/get-media`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    mediaId: media.mediaId,
                    keyId: keyid,
                }),
            });

            if (!response.ok) {
                throw new Error(
                    `Some error occured while fetching direct link`,
                );
            }
            const data = await response.json();

            if (data?.media?.file) {
                setFileDirectLink(data.media.file);
                navigator.clipboard.writeText(data.media.file);
                toast({
                    description: "Direct link has been copied to the clipboard",
                });
            }
        } catch (e) {
            toast({
                description: "Error in fetching direct link",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div>
                <Label htmlFor="apikey" className="mb-2">
                    Media ID
                </Label>
                <div className="flex gap-2">
                    <Input value={media.mediaId} name="mediaId" disabled />
                    <Button
                        onClick={() => {
                            navigator.clipboard.writeText(media.mediaId);
                            toast({
                                description:
                                    "Media id has been copied to the clipboard",
                            });
                        }}
                    >
                        Copy
                    </Button>
                </div>
            </div>
            <div>
                <Label htmlFor="apikey" className="mb-2">
                    Direct Link
                </Label>
                <div className="flex gap-2">
                    <Input value={fileDirectLink} name="file" disabled />
                    <Button onClick={directLink} disabled={loading}>
                        {loading ? "Fetching..." : "Get direct link"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
