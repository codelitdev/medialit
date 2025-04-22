import { Media } from "./media";
import { createReadStream } from "fs";
import { Readable } from "stream";

const BROWSER_ENVIRONMENT_ERROR =
    "MediaLit SDK is only meant to be used in a server-side Node.js environment";
const API_KEY_REQUIRED = "API Key is required";

export interface MediaLitConfig {
    apiKey?: string;
    endpoint?: string;
}

export interface UploadOptions {
    group?: string;
    access?: "private" | "public";
    caption?: string;
}

export interface MediaStats {
    storage: number;
    maxStorage: number;
}

export interface MediaSettings {
    useWebP?: boolean;
    webpOutputQuality?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
}

// Type to handle both file paths and buffers/streams
export type FileInput = string | Buffer | Readable;

export class MediaLit {
    private apiKey: string;
    private endpoint: string;

    constructor(config?: MediaLitConfig) {
        this.checkBrowserEnvironment();
        const apiKey = config?.apiKey || process.env.MEDIALIT_API_KEY || "";
        if (!apiKey) {
            throw new Error(API_KEY_REQUIRED);
        }
        this.apiKey = apiKey;
        this.endpoint =
            config?.endpoint ||
            process.env.MEDIALIT_ENDPOINT ||
            "https://api.medialit.cloud";
    }

    private checkBrowserEnvironment() {
        if (typeof window !== "undefined" || typeof document !== "undefined") {
            throw new Error(BROWSER_ENVIRONMENT_ERROR);
        }
    }

    private async createFormData(
        file: FileInput,
    ): Promise<{ formData: any; filename: string }> {
        this.checkBrowserEnvironment();
        const FormData = (await import("form-data")).default;
        const formData = new FormData();

        if (typeof file === "string") {
            // File path
            formData.append("file", createReadStream(file));
            return { formData, filename: file.split("/").pop() || "unknown" };
        } else if (Buffer.isBuffer(file)) {
            formData.append("file", file, "file");
            return { formData, filename: "buffer" };
        } else if (file instanceof Readable) {
            formData.append("file", file);
            return { formData, filename: "stream" };
        }
        throw new Error(
            "Invalid file input. Must be a file path, Buffer, or Readable stream",
        );
    }

    async upload(file: FileInput, options: UploadOptions = {}): Promise<Media> {
        this.checkBrowserEnvironment();
        if (!this.apiKey) {
            throw new Error(API_KEY_REQUIRED);
        }

        const { formData } = await this.createFormData(file);

        if (options.access) formData.append("access", options.access);
        if (options.caption) formData.append("caption", options.caption);
        if (options.group) formData.append("group", options.group);
        formData.append("apikey", this.apiKey);

        const response = await fetch(`${this.endpoint}/media/create`, {
            method: "POST",
            headers: {
                ...formData.getHeaders(),
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Upload failed");
        }

        return response.json();
    }

    async uploadWithPresignedUrl(
        presignedUrl: string,
        file: FileInput,
        options: UploadOptions = {},
    ): Promise<Media> {
        this.checkBrowserEnvironment();
        const { formData } = await this.createFormData(file);

        if (options.access) formData.append("access", options.access);
        if (options.caption) formData.append("caption", options.caption);
        if (options.group) formData.append("group", options.group);

        const response = await fetch(presignedUrl, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(
                error.message || "Upload with presigned URL failed",
            );
        }

        return response.json();
    }

    async delete(mediaId: string): Promise<void> {
        this.checkBrowserEnvironment();
        if (!this.apiKey) {
            throw new Error(API_KEY_REQUIRED);
        }

        const response = await fetch(
            `${this.endpoint}/media/delete/${mediaId}`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    apikey: this.apiKey,
                }),
            },
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Deletion failed");
        }
    }

    async get(mediaId: string): Promise<Media> {
        this.checkBrowserEnvironment();
        if (!this.apiKey) {
            throw new Error(API_KEY_REQUIRED);
        }

        const response = await fetch(`${this.endpoint}/media/get/${mediaId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                apikey: this.apiKey,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to get media");
        }

        return response.json();
    }

    async list(
        page: number = 1,
        limit: number = 10,
        filters: { access?: "private" | "public"; group?: string } = {},
    ): Promise<Media[]> {
        this.checkBrowserEnvironment();
        if (!this.apiKey) {
            throw new Error(API_KEY_REQUIRED);
        }

        const params = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString(),
        });

        if (filters.access) params.append("access", filters.access);
        if (filters.group) params.append("group", filters.group);

        const response = await fetch(
            `${this.endpoint}/media/get?${params.toString()}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    apikey: this.apiKey,
                }),
            },
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to list media");
        }

        return response.json();
    }

    async getPresignedUploadUrl(
        options: { group?: string } = {},
    ): Promise<string> {
        this.checkBrowserEnvironment();
        if (!this.apiKey) {
            throw new Error(API_KEY_REQUIRED);
        }

        const response = await fetch(
            `${this.endpoint}/media/presigned/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    apikey: this.apiKey,
                    ...(options.group ? { group: options.group } : {}),
                }),
            },
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to get presigned URL");
        }

        const result = await response.json();
        return result.message;
    }

    async getCount(): Promise<number> {
        this.checkBrowserEnvironment();
        if (!this.apiKey) {
            throw new Error(API_KEY_REQUIRED);
        }

        const response = await fetch(`${this.endpoint}/media/get/count`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                apikey: this.apiKey,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to get count");
        }

        const result = await response.json();
        return result.count;
    }

    async getStats(): Promise<MediaStats> {
        this.checkBrowserEnvironment();
        if (!this.apiKey) {
            throw new Error(API_KEY_REQUIRED);
        }

        const response = await fetch(`${this.endpoint}/media/get/size`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                apikey: this.apiKey,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to get stats");
        }

        return response.json();
    }

    async getSettings(): Promise<MediaSettings> {
        this.checkBrowserEnvironment();
        if (!this.apiKey) {
            throw new Error(API_KEY_REQUIRED);
        }

        const response = await fetch(`${this.endpoint}/settings/media/get`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                apikey: this.apiKey,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to get media settings");
        }

        return response.json();
    }

    async updateSettings(settings: MediaSettings): Promise<void> {
        this.checkBrowserEnvironment();
        if (!this.apiKey) {
            throw new Error(API_KEY_REQUIRED);
        }

        const response = await fetch(`${this.endpoint}/settings/media/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                apikey: this.apiKey,
                ...settings,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to update media settings");
        }
    }
}
