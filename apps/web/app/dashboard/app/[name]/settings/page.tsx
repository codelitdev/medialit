"use client";

import { deleteApiKeyOfUser } from "@/app/dashboard/actions";
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

const Settings = ({
    params,
}: {
    params: { name: string };
}) => {
    const name = params.name;
    const decodedName = decodeURI(name);
    const { toast } = useToast();

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
                        Are you sure, you want to delete &quot;{decodedName}&quot;?
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button className="!w-20 h-8">Cancel</Button>
                            </DialogClose>
                            <DialogClose asChild>
                                <Button
                                    className="!w-20 h-8"
                                    onClick={() => {
                                        deleteApiKeyOfUser(decodedName)
                                        toast({
                                            variant: "destructive",
                                            title: `"${decodedName}" has been deleted`,
                                        });
                                    }
                                    }
                                >
                                    Delete
                                </Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
};

export default Settings;
