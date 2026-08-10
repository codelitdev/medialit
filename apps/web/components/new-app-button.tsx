"use client";

import React, { useEffect, useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/codelit/dialog";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { toast } from "sonner";
import { Button } from "@/components/ui/codelit/button";
import { createNewApiKey } from "@/app/actions";
import { CURRENT_APP_COOKIE } from "@/lib/current-app-cookie";

export default function NewApp({
    open: openProp,
    onOpenChange: onOpenChangeProp,
    trigger,
}: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Pass `null` to render the dialog with no built-in trigger (fully controlled). */
    trigger?: React.ReactNode | null;
} = {}) {
    const [openState, setOpenState] = useState(false);
    const open = openProp ?? openState;
    const setOpen = onOpenChangeProp ?? setOpenState;

    const [apiKeyFormState, createApiKeyFormAction] = useActionState(
        createNewApiKey,
        { success: false },
    );

    const [appName, setAppName] = useState("");
    const router = useRouter();

    useEffect(() => {
        if (apiKeyFormState.success) {
            setOpen(false);
            if (apiKeyFormState.keyId) {
                document.cookie = `${CURRENT_APP_COOKIE}=${apiKeyFormState.keyId}; path=/; max-age=${60 * 60 * 24 * 365}`;
            }
            router.refresh();
            toast.success("Success", {
                description: `${appName} is ready to go`,
            });
        }
    }, [apiKeyFormState.success]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger !== null && (
                <DialogTrigger asChild>
                    {trigger ?? <Button>New app</Button>}
                </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create new app</DialogTitle>
                </DialogHeader>
                <form action={createApiKeyFormAction}>
                    <div className="grid gap-4 py-4">
                        {apiKeyFormState.error && (
                            <p className="text-destructive">
                                {apiKeyFormState.error}
                            </p>
                        )}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right">
                                Name
                            </Label>
                            <Input
                                className="col-span-3"
                                id="apiKey"
                                name="apiKey"
                                placeholder="Enter name"
                                required
                                onChange={(e) => setAppName(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Submit>Create</Submit>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
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
