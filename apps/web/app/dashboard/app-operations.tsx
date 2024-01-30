"use client";

import React from "react";
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

export default function AppOperations() {
    const [apiKeyFormState, createApiKeyFormAction] = useFormState(
        createNewApiKey,
        { success: false }
    );

    const [apiKey, setApiKey] = useState("");
    const router = useRouter();
    const { toast } = useToast();

    if (apiKeyFormState.success) {
        router.refresh();
        redirect("/dashboard");
    }

    return (
        <>
            <Dialog>
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
                                onClick={() => {
                                    apiKeyFormState.success &&
                                        toast({
                                            variant: "success",
                                            title: `New app "${apiKey}" has been Creted`,
                                        });
                                }}
                            >
                                Create
                            </Submit>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}

function Submit({
    children,
    onClick,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
    onClick: (...args: any[]) => void;
}) {
    const status = useFormStatus();

    return (
        <Button
            type="submit"
            disabled={status.pending}
            className={className}
            onClick={onClick}
        >
            {children}
        </Button>
    );
}
