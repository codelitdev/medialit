"use client";

import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export default function CopyApikeyButton({ apikey }: { apikey: string }) {
    return (
        <Button
            variant="outline"
            size="icon"
            onClick={() => {
                navigator.clipboard.writeText(apikey);
                toast.success("Success", {
                    description: "Apikey has been copied to the clipboard",
                });
            }}
        >
            <Copy className="h-4 w-4" />
        </Button>
    );
}
