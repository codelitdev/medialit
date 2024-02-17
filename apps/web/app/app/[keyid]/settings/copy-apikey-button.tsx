"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function CopyApikeyButton({ apikey }: { apikey: string }) {
    const { toast } = useToast();

    return (
        <Button
            onClick={() => {
                navigator.clipboard.writeText(apikey);
                toast({
                    title: "Success",
                    description: "Apikey has been copied to the clipboard",
                });
            }}
        >
            Copy
        </Button>
    );
}
