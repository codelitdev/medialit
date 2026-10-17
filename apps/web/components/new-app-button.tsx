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
import { createNewApp, type CreateAppState } from "@/app/actions";
import ApiKeyReveal from "@/components/api-key-reveal";
import { Plus } from "lucide-react";
import { toast } from "sonner";

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
    const [createState, createAppFormAction] = useActionState(createNewApp, {
        success: false,
    } as CreateAppState);
    const handledSuccessState = useRef<CreateAppState | null>(null);
    /* The new app's first key, shown once before moving on to the app. */
    const [created, setCreated] = useState<{
        appId: string;
        key: string;
    } | null>(null);

    const [appName, setAppName] = useState("");
    const router = useRouter();

    const goToApp = useCallback(
        (appId: string) => {
            router.push(`/app/${encodeURIComponent(appId)}/files`);
            router.refresh();
        },
        [router],
    );

    const handleOpenChange = useCallback(
        (nextOpen: boolean) => {
            setInternalOpen(nextOpen);
            onOpenChange?.(nextOpen);
            if (!nextOpen && created) {
                // Closing the key step counts as continuing to the app.
                setCreated(null);
                goToApp(created.appId);
            }
        },
        [created, goToApp, onOpenChange],
    );

    useEffect(() => {
        if (
            !createState.success ||
            handledSuccessState.current === createState
        ) {
            return;
        }

        handledSuccessState.current = createState;
        toast.success("Success", {
            description: `App ${appName} is ready to go`,
        });
        if (createState.appId && createState.key) {
            setCreated({ appId: createState.appId, key: createState.key });
            return;
        }
        handleOpenChange(false);
        if (createState.appId) goToApp(createState.appId);
    }, [createState, appName, handleOpenChange, goToApp]);

    return (
        <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
            {showTrigger ? (
                <DialogTrigger asChild>
                    <NewAppTrigger compact={compact} className={className} />
                </DialogTrigger>
            ) : null}
            <DialogContent className="sm:max-w-[480px]">
                {created ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Your app’s API key</DialogTitle>
                            <DialogDescription>
                                Use it with the SDK or REST API. You can create
                                more keys in the app’s settings.
                            </DialogDescription>
                        </DialogHeader>
                        <ApiKeyReveal secret={created.key} />
                        <DialogFooter>
                            <Button
                                type="button"
                                onClick={() => handleOpenChange(false)}
                            >
                                Continue to app
                            </Button>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Create new app</DialogTitle>
                        </DialogHeader>
                        <form action={createAppFormAction}>
                            <div className="grid gap-4 py-4">
                                {createState.error && (
                                    <p className="text-red-500">
                                        {createState.error}
                                    </p>
                                )}
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label
                                        htmlFor="app-name"
                                        className="text-right"
                                    >
                                        Name
                                    </Label>
                                    <Input
                                        className="col-span-3"
                                        id="app-name"
                                        name="name"
                                        type="text"
                                        placeholder="Enter name"
                                        required
                                        onChange={(e) =>
                                            setAppName(e.target.value)
                                        }
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Submit className="!w-20 h-8">Create</Submit>
                            </DialogFooter>
                        </form>
                    </>
                )}
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
