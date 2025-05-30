import { spawn } from "child_process";
import path from "path";

const VIDEO_TYPE = "video";
const IMAGE_TYPE = "image";

type mediaType = "video" | "image";

const thumbGenerator = (source: string, destination: string, type: mediaType) =>
    new Promise((resolve, reject) => {
        if (!source || !destination) {
            reject(new Error("Source or destination path missing"));
        }

        let convert;
        const scriptPath = path.resolve(
            __dirname,
            "../bin/generate-thumbnail.sh",
        );
        if (type === IMAGE_TYPE) {
            let input;
            if (/^\.gif$/.test(path.extname(source))) {
                input = `${source}[0-0]`;
            } else {
                input = source;
            }
            convert = spawn(scriptPath, [input, destination]);
        } else {
            convert = spawn(
                `ffmpeg -y -i "${source}" -vframes 1 -filter:v scale="-2:720" ${destination} && ${scriptPath} ${destination} ${destination}`,
                [],
                { shell: true },
            );
            // convert = spawn(
            //     "ffmpeg",
            //     [
            //         "-y",
            //         "-itsoffset -1",
            //         `-i "${source}"`,
            //         "-vframes 1",
            //         `-filter:v scale="-2:720"`,
            //         `"${destination}"`,
            //     ],
            //     { shell: true }
            // );
        }

        if (process.env.DEBUG === "true") {
            convert.stderr.on("data", (data: any) => {
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

const forImage = (source: string, destination: string) =>
    thumbGenerator(source, destination, IMAGE_TYPE);

const forVideo = (source: string, destination: string) =>
    thumbGenerator(source, destination, VIDEO_TYPE);

export default {
    forImage,
    forVideo,
};
