"use client";

import React, { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { redirect, useRouter } from "next/navigation";
import { createNewApiKey } from "@/app/dashboard/actions";

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
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

export default function NewApp() {
    const [open, setOpen] = useState(false);
    const [apiKeyFormState, createApiKeyFormAction] = useFormState(
        createNewApiKey,
        { success: false }
    );

    const [apiKey, setApiKey] = useState("");
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        if (apiKeyFormState.success) {
            setOpen(false)
            router.refresh()
            toast({
                title: `Success`,
                description: `App ${apiKey} is ready to go`,
                action: <ToastAction altText="Go to app" onClick={() => {
                    router.push(`/dashboard/app/${encodeURIComponent(apiKey)}/files`);
                }}>Go to app</ToastAction>
            });
        }
    }, [apiKeyFormState.success]);

    return (
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button className="!w-20 h-8">New app</Button>
                </DialogTrigger>
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
                                <Label htmlFor="name" className="text-right">
                                    Name
                                </Label>
                                <Input
                                    className="col-span-3"
                                    id="apiKey"
                                    name="apiKey"
                                    type="apiKey"
                                    placeholder="Enter name"
                                    required
                                    onChange={(e) => setApiKey(e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Submit
                                className="!w-20 h-8"
                            >
                                Create
                            </Submit>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
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
        <Button
            type="submit"
            disabled={status.pending}
            className={className}
        >
            {children}
        </Button>
    );
}
