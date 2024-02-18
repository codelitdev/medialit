"use client";

import { Media } from "@medialit/models";
import Image from "next/image";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

export default function FilePreview({
    media,
}: {
    media: Media & {
        thumbnail: string;
        access: "public" | "private";
    };
}) {
    const { toast } = useToast();

    return (
        <Dialog>
            <DialogTrigger asChild>
                <div className="shadow-[0_1px_4px_rgba(0,0,0,0.25)] relative h-[148px] w-[48%] sm:h-[148px] sm:w-[148px] md:h-[148px] md:w-[148px] lg:h-[148px] lg:w-[148px]">
                    <div className="border bg-muted-foreground relative h-[148px] w-full sm:h-[148px] sm:w-[148px] md:h-[148px] md:w-[148px] lg:h-[148px] lg:w-[148px]">
                        <Image
                            src={media.thumbnail}
                            alt="Media"
                            priority={true}
                            quality={100}
                            fill
                        />
                    </div>
                    <div className="p-2 absolute bottom-0 bg-white w-full">
                        <div className="text-sm truncate">
                            {media.originalFileName}
                        </div>
                        <div className="text-muted-foreground text-sm">
                            {media.mimeType.split("/")[0]}
                        </div>
                    </div>
                </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>File details</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 lg:flex-row">
                        <form className="flex flex-col gap-4">
                            <div className="flex flex-col">
                                <Label htmlFor="filename" className="mb-2">
                                    File name
                                </Label>
                                <Input
                                    type="text"
                                    value={media.originalFileName}
                                    disabled={true}
                                    name="filename"
                                />
                            </div>
                            <div className="flex flex-col">
                                <Label htmlFor="filename" className="mb-2">
                                    Group
                                </Label>
                                <Input
                                    type="text"
                                    value={media.group}
                                    disabled={true}
                                    name="group"
                                />
                            </div>
                            <div className="flex justify-between items-center">
                                <Label htmlFor="filename">Public</Label>
                                <Switch
                                    checked={media.access !== "private"}
                                    disabled={true}
                                    name="public"
                                />
                                {/* <Input
                                type="text"
                                value={media.originalFileName}
                                disabled={true}
                                name="filename"
                                /> */}
                            </div>
                            <div className="flex justify-between items-center">
                                <Label htmlFor="filename">Size</Label>
                                <div className="text-sm">
                                    {(media.size / 1024 / 1024).toFixed(2)} MB
                                </div>
                            </div>
                            <div className="flex justify-between items-center">
                                <Label htmlFor="filename">Mime type</Label>
                                <div className="text-sm">{media.mimeType}</div>
                            </div>
                        </form>
                        <div className="flex justify-center items-center max-h-[200px] overflow-y-scroll">
                            <Image
                                alt="File preview"
                                src={media.thumbnail}
                                sizes="40vw"
                                width={200}
                                height={200}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div>
                            <Label htmlFor="apikey" className="mb-2">
                                Media ID
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    value={media.mediaId}
                                    name="mediaId"
                                    disabled
                                />
                                <Button
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            media.mediaId
                                        );
                                        toast({
                                            description:
                                                "Media id has been copied to the clipboard",
                                        });
                                    }}
                                >
                                    Copy
                                </Button>
                            </div>
                        </div>
                        {media.access === "public" && (
                            <div>
                                <Label htmlFor="apikey" className="mb-2">
                                    Direct Link
                                </Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={media.mediaId}
                                        name="mediaId"
                                        disabled
                                    />
                                    <Button
                                        onClick={() => {
                                            navigator.clipboard.writeText(
                                                media.mediaId
                                            );
                                            toast({
                                                description:
                                                    "Media id has been copied to the clipboard",
                                            });
                                        }}
                                    >
                                        Copy
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {/* <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary">Done</Button>
                    </DialogClose>
                </DialogFooter> */}
            </DialogContent>
        </Dialog>
    );
}
