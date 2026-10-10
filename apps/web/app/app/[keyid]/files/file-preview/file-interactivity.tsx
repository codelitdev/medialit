"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

export default function FileInteractivity({
    media,
    keyid,
}: {
    media: Pick<import("@medialit/models").Media, "mediaId"> & {
        access: "public" | "private";
    };
    keyid: string;
}) {
    const [fileDirectLink, setFileDirectLink] = useState("");
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
                toast.success("Success", {
                    description: "Direct link has been copied to the clipboard",
                });
            }
        } catch (e) {
            toast.error("Uh oh!", {
                description: "Error in fetching direct link",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="file-interactivity">
            <div className="file-id-field">
                <Label htmlFor="media-id" className="mb-2">
                    Media ID
                </Label>
                <div className="flex gap-2">
                    <Input
                        id="media-id"
                        value={media.mediaId}
                        name="mediaId"
                        disabled
                    />
                    <Button
                        className="workspace-button secondary"
                        onClick={() => {
                            navigator.clipboard.writeText(media.mediaId);
                            toast.success("Success", {
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
                <Label htmlFor="direct-link" className="mb-2">
                    Direct Link
                </Label>
                <div className="flex gap-2">
                    <Input
                        id="direct-link"
                        value={fileDirectLink}
                        name="file"
                        disabled
                    />
                    <Button
                        className="workspace-button secondary"
                        onClick={directLink}
                        disabled={loading}
                    >
                        {loading ? "Fetching..." : "Get direct link"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
