"use client";

import React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { redirect, useRouter } from "next/navigation";
import { createNewApiKey, deleteApiKeyOfUser } from "@/app/dashboard/actions";

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

    const [deleteKeyFormState, deleteApiKeyFormAction] = useFormState(
        deleteApiKeyOfUser,
        { success: false }
    );

    const [apiKey, setApiKey] = useState("");
    const [deleteApiKey, setDeleteApiKey] = useState("");

    const router = useRouter();
    const { toast } = useToast();

    if (apiKeyFormState.success) {
        router.refresh();
        redirect("/dashboard");
    }

    if (deleteKeyFormState.success) {
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

            {/* for delete  */}
            <Dialog>
                <DialogTrigger asChild>
                    <Button className="!w-20 h-8">Delete app</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Delete app</DialogTitle>
                    </DialogHeader>
                    <form action={deleteApiKeyFormAction}>
                        <div className="grid gap-4 py-4">
                            {deleteKeyFormState.error && (
                                <p className="text-red-500">
                                    {deleteKeyFormState.error}
                                </p>
                            )}
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">
                                    Name
                                </Label>
                                <Input
                                    className="col-span-3"
                                    id="deleteApiKey"
                                    name="deleteApiKey"
                                    type="deleteApiKey"
                                    placeholder="Enter name"
                                    required
                                    onChange={(e) =>
                                        setDeleteApiKey(e.target.value)
                                    }
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Submit
                                className="!w-20 h-8"
                                onClick={() => {
                                    deleteKeyFormState.success &&
                                        toast({
                                            variant: "destructive",
                                            title: `New app "${deleteApiKey}" has been deleted`,
                                        });
                                }}
                            >
                                Delete
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
