import { spawn } from 'child_process';

export function convertToWebp (path: string, quality: number = 75): Promise<void> {
    return new Promise((resolve: any, reject: any) => {
        const process = spawn(
            "cwebp",
            [`"${path}"`, `-o "${path}"`, `-q ${quality}`],
            {
                shell: true,
            }
        );

        process.on("exit", (code) => {
            if (code !== 0) {
                reject(new Error("Error in converting the file to Webp format."));
            }

            resolve();
        });
    });
} 