import { spawn } from "child_process";
import path from "path";

// Defaults for image thumbnails
interface VideoOptions {
    width: number;
    height: number;
}

interface ImageOptions {
    width: number;
    height: number;
    preserveAspectRatio: boolean;
}

const imageOptions: ImageOptions = {
    width: 100,
    height: 100,
    preserveAspectRatio: true,
};

// Defaults for video thumbnails
const videoOptions: VideoOptions = {
    width: 100,
    height: -1,
};

const VIDEO_TYPE = "video";
const IMAGE_TYPE = "image";

type mediaType = "video" | "image";

const thumbGenerator = (
    source: string,
    destination: string,
    options: VideoOptions | ImageOptions,
    type: mediaType
) =>
    new Promise((resolve, reject) => {
        if (!source || !destination) {
            reject(new Error("Source or destination path missing"));
        }

        let convert;
        if (type === IMAGE_TYPE) {
            let input;
            if (/^\.gif$/.test(path.extname(source))) {
                input = `${source}[0-0]`;
            } else {
                input = source;
            }
            convert = spawn("convert", [
                input,
                "-thumbnail",
                `${options.width}x${options.height}${
                    (options as ImageOptions).preserveAspectRatio ? "" : "!"
                }`,
                destination,
            ]);
        } else {
            convert = spawn(
                "ffmpeg",
                [
                    "-itsoffset -1",
                    `-i "${source}"`,
                    "-vframes 1",
                    `-filter:v scale="${options.width}:${options.height}"`,
                    `"${destination}"`,
                ],
                { shell: true }
            );
        }

        if (process.env.DEBUG === "true") {
            convert.stderr.on("data", (data: any) => {
                // eslint-disable-next-line no-console
                console.error(data.toString());
            });
        }

        convert.on("exit", (code: number) => {
            if (code !== 0) {
                reject(new Error(`Child process exited with code ${code}`));
            }

            resolve(1);
        });
    });

const forImage = (source: string, destination: string, options: ImageOptions) =>
    thumbGenerator(
        source,
        destination,
        Object.assign({}, imageOptions, options),
        IMAGE_TYPE
    );

const forVideo = (source: string, destination: string, options: VideoOptions) =>
    thumbGenerator(
        source,
        destination,
        Object.assign({}, videoOptions, options),
        VIDEO_TYPE
    );

export default {
    forImage,
    forVideo,
};
