"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteApiKeyOfUser } from "@/app/actions";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

export default function DeleteAppButton({
    appName,
    keyId,
}: {
    appName: string;
    keyId: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    async function deleteApp() {
        setPending(true);
        setError("");
        const result = await deleteApiKeyOfUser(keyId);
        setPending(false);
        if (!result.success) {
            setError(result.error || "Could not delete this app.");
            return;
        }
        setOpen(false);
        router.push("/");
        router.refresh();
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button type="button" className="workspace-button danger">
                    Delete app
                </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>Delete {appName}?</DialogTitle>
                    <DialogDescription>
                        This removes the app and its files and revokes its API
                        key. This can’t be undone.
                    </DialogDescription>
                </DialogHeader>
                {error ? (
                    <p className="inline-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <DialogFooter>
                    <button
                        type="button"
                        className="workspace-button secondary"
                        disabled={pending}
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="workspace-button danger"
                        disabled={pending}
                        onClick={deleteApp}
                    >
                        {pending ? "Deleting…" : "Delete app"}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
