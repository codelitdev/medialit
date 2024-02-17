"use client";

import { useState, useEffect } from "react";
// import { useFormState, useFormStatus } from "react-dom";
import { redirect, useRouter } from "next/navigation";
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
import { deleteApiKeyOfUser, editApiKeyforUser } from "@/app/actions";
import { Apikey } from "@medialit/models";

export default function DeleteAppButton({
    apikey,
}: {
    apikey: Pick<Apikey, "name" | "keyId" | "key">;
}) {
    // const [editApiKeyFormState, editApiKeyFormAction] = useFormState(
    //     editApiKeyforUser,
    //     { success: false }
    // );

    const { toast } = useToast();
    const router = useRouter();

    // const [editApiKey, setEditApiKey] = useState(decodedName);
    const [deleteSuccess, setDeleteSuccess] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (deleteSuccess) {
            setOpen(false);
            router.push("/");
            toast({
                title: "Deleted",
                description: `"${apikey.name}" has been deleted`,
            });
        }
    }, [deleteSuccess]);

    // useEffect(() => {
    //     if (editApiKeyFormState.success) {
    //         setOpen(false);
    //         router.refresh();
    //         toast({
    //             title: "Updated",
    //             description: `"${editApiKey}" has been Updated`,
    //             action: (
    //                 <ToastAction
    //                     altText="Go to app"
    //                     onClick={() => {
    //                         router.push(`/app/${editApiKey}/files`);
    //                     }}
    //                 >
    //                     Go to app
    //                 </ToastAction>
    //             ),
    //         });
    //     }
    // }, [editApiKeyFormState.success]);

    return (
        <div className="">
            <Dialog>
                <DialogTrigger asChild>
                    <Button className="bg-red-600">Delete app</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Delete app</DialogTitle>
                    </DialogHeader>
                    Are you sure, you want to delete &quot;{apikey.name}
                    &quot;?
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button>Cancel</Button>
                        </DialogClose>
                        <DialogClose asChild>
                            <Button
                                onClick={() => {
                                    deleteApiKeyOfUser(apikey.keyId);
                                    setDeleteSuccess(true);
                                }}
                            >
                                Delete
                            </Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* <Dialog open={open} onOpenChange={setOpen}>
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
                                        type="editApiKey"
                                        name="newName"
                                        value={editApiKey}
                                        placeholder="Enter name"
                                        required
                                        onChange={(e) =>
                                            setEditApiKey(e.target.value)
                                        }
                                    />
                                    <Input
                                        className="col-span-3"
                                        id="name"
                                        type="hidden"
                                        name="name"
                                        value={decodedName}
                                        placeholder="Enter name"
                                        required
                                        readOnly
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
                </Dialog> */}
        </div>
    );
}

// function Submit({
//     children,
//     className = "",
// }: {
//     children: React.ReactNode;
//     className?: string;
// }) {
//     const status = useFormStatus();

//     return (
//         <Button type="submit" disabled={status.pending} className={className}>
//             {children}
//         </Button>
//     );
// }
