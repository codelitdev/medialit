"use client";

import React, {
    useActionState,
    useCallback,
    useEffect,
    useRef,
    useState,
    type MouseEventHandler,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createNewApiKey } from "@/app/actions";
import { Plus } from "lucide-react";
import { toast } from "sonner";

type CreateAppState = {
    success: boolean;
    error?: string;
    keyId?: string;
};

export default function NewApp({
    compact = false,
    className = "",
    showTrigger = true,
    open,
    onOpenChange,
}: {
    compact?: boolean;
    className?: string;
    showTrigger?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const [internalOpen, setInternalOpen] = useState(false);
    const dialogOpen = open ?? internalOpen;
    const handleOpenChange = useCallback(
        (nextOpen: boolean) => {
            setInternalOpen(nextOpen);
            onOpenChange?.(nextOpen);
        },
        [onOpenChange],
    );
    const [apiKeyFormState, createApiKeyFormAction] = useActionState(
        createNewApiKey,
        { success: false } as CreateAppState,
    );
    const handledSuccessState = useRef<CreateAppState | null>(null);

    const [appName, setAppName] = useState("");
    const router = useRouter();

    useEffect(() => {
        if (
            !apiKeyFormState.success ||
            handledSuccessState.current === apiKeyFormState
        ) {
            return;
        }

        handledSuccessState.current = apiKeyFormState;
        const keyId = apiKeyFormState.keyId;
        handleOpenChange(false);
        if (keyId) {
            router.push(`/app/${encodeURIComponent(keyId)}/files`);
        }
        router.refresh();
        toast.success("Success", {
            description: `App ${appName} is ready to go`,
        });
    }, [apiKeyFormState, appName, handleOpenChange, router]);

    return (
        <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
            {showTrigger ? (
                <DialogTrigger asChild>
                    <NewAppTrigger compact={compact} className={className} />
                </DialogTrigger>
            ) : null}
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create new app</DialogTitle>
                </DialogHeader>
                <form action={createApiKeyFormAction}>
                    <div className="grid gap-4 py-4">
                        {apiKeyFormState.error && (
                            <p className="text-red-500">
                                {apiKeyFormState.error}
                            </p>
                        )}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="apiKey" className="text-right">
                                Name
                            </Label>
                            <Input
                                className="col-span-3"
                                id="apiKey"
                                name="apiKey"
                                type="text"
                                placeholder="Enter name"
                                required
                                onChange={(e) => setAppName(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Submit className="!w-20 h-8">Create</Submit>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function NewAppTrigger({
    compact = false,
    className = "",
    onClick,
}: {
    compact?: boolean;
    className?: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
    return (
        <Button
            type="button"
            onClick={onClick}
            className={`workspace-button !h-9 ${compact ? "" : "!w-full !justify-start"} ${className}`}
        >
            {!compact ? (
                <span className="new-app-plus">+</span>
            ) : (
                <Plus size={15} />
            )}
            New app
        </Button>
    );
}

function Submit({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    const status = useFormStatus();

    return (
        <Button type="submit" disabled={status.pending} className={className}>
            {children}
        </Button>
    );
}
