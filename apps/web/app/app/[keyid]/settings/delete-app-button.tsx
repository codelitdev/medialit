"use client";

import { useState, useEffect } from "react";
// import { useFormState, useFormStatus } from "react-dom";
import { redirect, useRouter } from "next/navigation";
import { Button } from "@/components/ui/codelit/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/codelit/dialog";
import { toast } from "sonner";
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

    const router = useRouter();

    // const [editApiKey, setEditApiKey] = useState(decodedName);
    const [deleteSuccess, setDeleteSuccess] = useState(false);
    useEffect(() => {
        if (deleteSuccess) {
            router.push("/");
            toast.success("Deleted", {
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
                    <Button variant="destructive">Delete app</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Delete app</DialogTitle>
                    </DialogHeader>
                    Are you sure, you want to delete &quot;{apikey.name}
                    &quot;?
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <DialogClose asChild>
                            <Button
                                variant="destructive"
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
