import { Media } from "@medialit/models";
import Image from "next/image";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import FileInteractivity from "./file-interactivity";

export default function FilePreview({
    media,
    keyid,
}: {
    media: Media & {
        thumbnail: string;
        access: "public" | "private";
    };
    keyid: string;
}) {
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
                            </div>
                            <div className="flex justify-between items-center">
                                <Label htmlFor="filename">Size</Label>
                                <div className="text-sm">
                                    {(media.size / 1024 / 1024).toFixed(2)} MB
                                    {/* {media.size >= 1024
                                        ? `${(media.size / 1024 / 1024).toFixed(2)} MB`
                                        : `${(media.size / 1024).toFixed(2)} KB`} */}
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
                    <FileInteractivity media={media} keyid={keyid} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
