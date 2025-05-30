import { spawn } from "node:child_process";

export function convertToWebp(path: string, quality = 75): Promise<void> {
    return new Promise((resolve: any, reject: any) => {
        const process = spawn(
            "cwebp",
            [`"${path}"`, `-o "${path}"`, `-q ${quality}`],
            {
                shell: true,
            },
        );

        process.on("exit", (code: number) => {
            if (code !== 0) {
                reject(
                    new Error("Error in converting the file to Webp format."),
                );
            }

            resolve();
        });
    });
}
