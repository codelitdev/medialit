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
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import FileInteractivity from "./file-interactivity";
import {
    FileText,
    FileImage,
    FileVideo,
    FileAudio,
    FileCode,
    FileArchive,
    File,
} from "lucide-react";

const FileTypeIcon = ({ mimeType }: { mimeType: string }) => {
    const [type] = mimeType.split("/");
    const iconSize = 48;

    switch (type) {
        case "image":
            return <FileImage size={iconSize} className="text-blue-500" />;
        case "video":
            return <FileVideo size={iconSize} className="text-purple-500" />;
        case "audio":
            return <FileAudio size={iconSize} className="text-green-500" />;
        case "text":
            return <FileText size={iconSize} className="text-gray-500" />;
        case "application":
            if (mimeType.includes("pdf")) {
                return <FileText size={iconSize} className="text-red-500" />;
            } else if (
                mimeType.includes("zip") ||
                mimeType.includes("rar") ||
                mimeType.includes("tar")
            ) {
                return (
                    <FileArchive size={iconSize} className="text-orange-500" />
                );
            } else if (
                mimeType.includes("json") ||
                mimeType.includes("javascript") ||
                mimeType.includes("xml")
            ) {
                return <FileCode size={iconSize} className="text-yellow-500" />;
            }
            return <File size={iconSize} className="text-gray-500" />;
        default:
            return <File size={iconSize} className="text-gray-500" />;
    }
};

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
                <Card className="cursor-pointer hover:shadow-lg transition-shadow">
                    <CardContent className="p-0">
                        <div className="relative h-[148px] w-full flex items-center justify-center bg-muted">
                            {media.thumbnail ? (
                                <Image
                                    src={media.thumbnail}
                                    alt="Media"
                                    priority={true}
                                    quality={100}
                                    fill
                                    className="object-cover rounded-t-lg"
                                />
                            ) : (
                                <FileTypeIcon mimeType={media.mimeType} />
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="p-2 flex flex-col items-start">
                        <div className="text-sm truncate w-full">
                            {media.originalFileName}
                        </div>
                        <div className="text-muted-foreground text-sm">
                            {media.mimeType.split("/")[0]}
                        </div>
                    </CardFooter>
                </Card>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] gap-0 p-0">
                <div className="relative h-[200px] w-full flex items-center justify-center bg-muted">
                    {media.thumbnail ? (
                        <Image
                            alt="File preview"
                            src={media.thumbnail}
                            fill
                            className="object-cover rounded-t-lg"
                            priority
                        />
                    ) : (
                        <FileTypeIcon mimeType={media.mimeType} />
                    )}
                </div>
                <div className="p-6">
                    <DialogHeader>
                        <DialogTitle className="text-xl">
                            File details
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-muted-foreground">
                                    File name
                                </Label>
                                <div className="font-medium mt-1">
                                    {media.originalFileName}
                                </div>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">
                                    Group
                                </Label>
                                <div className="font-medium mt-1">
                                    {media.group}
                                </div>
                            </div>
                        </div>
                        <Separator />
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-muted-foreground">
                                    Size
                                </Label>
                                <div className="font-medium mt-1">
                                    {(media.size / 1024 / 1024).toFixed(2)} MB
                                </div>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">
                                    Mime type
                                </Label>
                                <div className="font-medium mt-1">
                                    {media.mimeType}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <Label className="text-muted-foreground">
                                Public access
                            </Label>
                            <Switch
                                checked={media.access !== "private"}
                                disabled={true}
                                name="public"
                            />
                        </div>
                        <Separator />
                        <FileInteractivity media={media} keyid={keyid} />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
