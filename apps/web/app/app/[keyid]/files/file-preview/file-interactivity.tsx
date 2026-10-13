"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function FileInteractivity({
    media,
    fileUrl,
    loadError,
}: {
    media: { access: "public" | "private" };
    fileUrl: string;
    loadError: boolean;
}) {
    const isPublic = media.access !== "private";

    const copyUrl = () => {
        navigator.clipboard.writeText(fileUrl);
        toast.success("Success", {
            description: isPublic
                ? "Link has been copied to the clipboard"
                : "Temporary link has been copied to the clipboard",
        });
    };

    return (
        <div className="file-actions">
            {isPublic ? (
                <div className="file-url-field">
                    <Label htmlFor="file-url">File URL</Label>
                    <div className="file-url-row">
                        <input
                            id="file-url"
                            className="file-url-input"
                            readOnly
                            value={
                                fileUrl ||
                                (loadError ? "Could not load the file URL" : "")
                            }
                            placeholder="Loading…"
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={copyUrl}
                            disabled={!fileUrl}
                            aria-label="Copy file URL"
                        >
                            <Copy aria-hidden="true" />
                        </Button>
                    </div>
                </div>
            ) : null}

            <div className="file-access-row">
                <div>
                    <p className="file-access-title">
                        {isPublic ? "Public" : "Private"}
                    </p>
                    <p>
                        {isPublic
                            ? "Anyone with the URL can view this file. Access is set at upload and can’t be changed."
                            : "Only signed links that expire can open this file. Access is set at upload and can’t be changed."}
                    </p>
                </div>
                <span className={`file-badge${isPublic ? " is-public" : ""}`}>
                    {isPublic ? "Public" : "Private"}
                </span>
            </div>

            <div className="file-dialog-buttons">
                <Button variant="outline" onClick={copyUrl} disabled={!fileUrl}>
                    <Copy aria-hidden="true" />
                    {isPublic ? "Copy direct link" : "Copy temporary link"}
                </Button>
                {isPublic ? null : (
                    <p className="w-full text-xs text-muted-foreground">
                        This link stops working after a short time.
                    </p>
                )}
            </div>
        </div>
    );
}
