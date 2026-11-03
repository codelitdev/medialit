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
            // No shell: source contains a client-controlled extension.
            const ffmpeg = spawn("ffmpeg", [
                "-y",
                "-i",
                source,
                "-vframes",
                "1",
                "-filter:v",
                "scale=-2:720",
                destination,
            ]);
            ffmpeg.on("error", reject);
            ffmpeg.on("exit", (code) => {
                if (code !== 0) {
                    reject(new Error(`ffmpeg exited with code ${code}`));
                    return;
                }
                const script = spawn(scriptPath, [destination, destination]);
                script.on("error", reject);
                script.on("exit", (scriptCode) =>
                    scriptCode === 0
                        ? resolve(1)
                        : reject(
                              new Error(
                                  `Child process exited with code ${scriptCode}`,
                              ),
                          ),
                );
            });
            return;
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
