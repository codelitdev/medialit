"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Copy } from "lucide-react";

export default function CopyApikeyButton({ apikey }: { apikey: string }) {
    const { toast } = useToast();

    return (
        <Button
            variant="outline"
            size="icon"
            onClick={() => {
                navigator.clipboard.writeText(apikey);
                toast({
                    title: "Success",
                    description: "Apikey has been copied to the clipboard",
                });
            }}
        >
            <Copy className="h-4 w-4" />
        </Button>
    );
}
