"use client";

import { useState, useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { redirect, useRouter } from "next/navigation";
import {
    deleteApiKeyOfUser,
    editApiKeyforUser,
} from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function Settings({ params }: { params: { name: string } }) {
    const [editApiKeyFormState, editApiKeyFormAction] = useFormState(
        editApiKeyforUser,
        { success: false }
    );

    const name = params.name;
    const decodedName = decodeURI(name);
    const { toast } = useToast();
    const router = useRouter();

    const [editApiKey, setEditApiKey] = useState(decodedName);
    const [deleteSuccess, setDeleteSuccess] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (deleteSuccess) {
            setOpen(false);
            router.push("/dashboard");
            toast({
                // variant: "destructive",
                title: "Deleted",
                description: `"${decodedName}" has been deleted`,
            });
        }
    }, [deleteSuccess]);

    useEffect(() => {
        if (editApiKeyFormState.success) {
            setOpen(false);
            router.refresh();
            toast({
                // variant: "destructive",
                title: "Updated",
                description: `"${editApiKey}" has been Updated`,
                action: (
                    <ToastAction
                        altText="Go to app"
                        onClick={() => {
                            router.push(`/dashboard/app/${editApiKey}/files`);
                        }}
                    >
                        Go to app
                    </ToastAction>
                ),
            });
        }
    }, [editApiKeyFormState.success]);

    return (
        <>
            <div className="border border-muted-foreground min-h-screen my-4 rounded p-2 md:p-2 lg:p-0">
                <Dialog>
                    <DialogTrigger asChild>
                        <Button className="!w-20 h-8 m-4">Delete app</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Delete app</DialogTitle>
                        </DialogHeader>
                        Are you sure, you want to delete &quot;{decodedName}
                        &quot;?
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button className="!w-20 h-8">Cancel</Button>
                            </DialogClose>
                            <DialogClose asChild>
                                <Button
                                    className="!w-20 h-8"
                                    onClick={() => {
                                        deleteApiKeyOfUser(decodedName);
                                        setDeleteSuccess(true);
                                    }}
                                >
                                    Delete
                                </Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button className="!w-20 h-8 m-4">Edit app</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Edit app</DialogTitle>
                        </DialogHeader>

                        <form action={editApiKeyFormAction}>
                            <div className="grid gap-4 py-4">
                                {editApiKeyFormState.error && (
                                    <p className="text-red-500">
                                        {editApiKeyFormState.error}
                                    </p>
                                )}
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label
                                        htmlFor="name"
                                        className="text-right"
                                    >
                                        Name
                                    </Label>
                                    <Input
                                        className="col-span-3"
                                        id="editApiKey"
                                        name="editApiKey"
                                        type="editApiKey"
                                        value={editApiKey}
                                        placeholder="Enter name"
                                        required
                                        onChange={(e) =>
                                            setEditApiKey(e.target.value)
                                        }
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button className="!w-20 h-8">
                                        Cancel
                                    </Button>
                                </DialogClose>
                                <DialogClose asChild>
                                    <Submit className="!w-20 h-8">
                                        Update
                                    </Submit>
                                </DialogClose>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </>
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
