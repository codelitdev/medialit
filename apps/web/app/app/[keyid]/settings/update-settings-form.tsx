"use client";

import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { useFormStatus } from "react-dom";
import { updateAppName } from "./actions";
import { useEffect, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function UpdateSettingsForm({
    keyId,
    name,
}: {
    keyId: string;
    name: string;
}) {
    const [state, updateNameAction] = useActionState(updateAppName, {
        success: false,
    });
    const [newName, setNewName] = useState(name);
    const router = useRouter();

    useEffect(() => {
        function refresh() {
            router.refresh();
        }

        if (state.success) {
            refresh();
        }

        if (state.error) {
            toast.error("Error", {
                description:
                    "There was a problem saving your changes. Please try again.",
            });
        }
    }, [state]);

    return (
        <div>
            <Label htmlFor="newName" className="mb-2">
                App name
            </Label>
            <form action={updateNameAction} className="flex gap-2">
                <Input
                    name="newName"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <Input name="keyId" value={keyId} type="hidden" />
                <Submit>Save</Submit>
            </form>
        </div>
    );
}

function Submit({ children }: { children: React.ReactNode }) {
    const status = useFormStatus();

    return (
        <Button type="submit" disabled={status.pending}>
            {children}
        </Button>
    );
}
