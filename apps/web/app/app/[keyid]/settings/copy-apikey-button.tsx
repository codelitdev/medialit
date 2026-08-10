"use client";

import { IconButton } from "@/components/ui/codelit/icon-button";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export default function CopyApikeyButton({ apikey }: { apikey: string }) {
    return (
        <IconButton
            variant="outline"
            title="Copy API key"
            aria-label="Copy API key"
            onClick={() => {
                navigator.clipboard.writeText(apikey);
                toast.success("Apikey has been copied to the clipboard");
            }}
        >
            <Copy className="h-4 w-4" />
        </IconButton>
    );
}
