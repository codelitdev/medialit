"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormState, useFormStatus } from "react-dom";
import { updateAppName } from "./actions";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";

export default function UpdateSettingsForm({ name }: { name: string }) {
    const [state, updateNameAction] = useFormState(updateAppName, {
        success: false,
    });
    const [newName, setNewName] = useState(name);
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        function refresh() {
            router.refresh();
        }

        if (state.success) {
            refresh();
        }

        if (state.error) {
            toast({
                title: "Error",
                description:
                    "There was a problem saving your changes. Please try again.",
                variant: "destructive",
            });
        }
    }, [state]);

    return (
        <div>
            <Label htmlFor="name" className="mb-2">
                App name
            </Label>
            <form action={updateNameAction} className="flex gap-2">
                <Input
                    name="newName"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <Input name="name" value={name} type="hidden" />
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
