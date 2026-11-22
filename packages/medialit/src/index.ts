import type { Media } from "./types";
import { readFile } from "fs/promises";
import { basename } from "path";
import { Readable } from "stream";
import { lookup } from "mime-types";

const BROWSER_ENVIRONMENT_ERROR =
    "MediaLit SDK is only meant to be used in a server-side Node.js environment";
const API_KEY_REQUIRED = "API Key is required";
const INVALID_MEDIA_ID = "Invalid media ID";

export interface MediaLitConfig {
    apiKey?: string;
    /** An OAuth access token, used instead of an API key. */
    accessToken?: string;
    endpoint?: string;
}

export interface UploadOptions {
    group?: string;
    access?: "private" | "public";
    caption?: string;
    /** Defaults to the file's name for a path. Its extension sets the type. */
    fileName?: string;
    /** Defaults to the type for the file name's extension. */
    mimeType?: string;
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

export type WebhookEvent = "media.processing.ready" | "media.processing.failed";

export interface WebhookEndpoint {
    id: string;
    url: string;
    events: WebhookEvent[];
    enabled: boolean;
    /** The signing secret's last characters. */
    secretHint: string;
    /** Signing secret (Standard Webhooks). Returned only by `createWebhook`
     * and by `updateWebhook` with `rotateSecret`; read it later with
     * `revealWebhookSecret`. */
    secret?: string;
    createdAt: string;
    updatedAt: string;
}

export interface WebhookEndpointInput {
    url: string;
    /** Defaults to every event. */
    events?: WebhookEvent[];
    /** Defaults to true. */
    enabled?: boolean;
}

export interface WebhookEndpointUpdate {
    url?: string;
    events?: WebhookEvent[];
    enabled?: boolean;
    /** Replace the signing secret with a new one. */
    rotateSecret?: boolean;
}

/** A test event's outcome: only a status code or a generic error class. */
export type WebhookTestResult =
    | { result: "delivered"; status: number }
    | { result: "failed"; status?: number; error?: string };

// Type to handle both file paths and buffers/streams
export type FileInput = string | Buffer | Readable;

export class MediaLit {
    private apiKey?: string;
    private accessToken?: string;
    public endpoint: string;

    constructor(config?: MediaLitConfig) {
        this.checkBrowserEnvironment();
        if (config?.accessToken) {
            this.accessToken = config.accessToken;
        } else {
            this.apiKey = config?.apiKey || process.env.MEDIALIT_API_KEY;
            if (!this.apiKey) {
                throw new Error(API_KEY_REQUIRED);
            }
        }
        this.endpoint =
            config?.endpoint ||
            process.env.MEDIALIT_ENDPOINT ||
            "https://api.medialit.cloud";
    }

    /**
     * Media IDs are nanoids. Anything else could change which endpoint the
     * request reaches (for example "../signature/create") when an app passes
     * a user-supplied ID, so it is rejected before any request is made.
     */
    private mediaUrl(action: "get" | "seal" | "delete", mediaId: string) {
        if (typeof mediaId !== "string" || !/^[A-Za-z0-9_-]+$/.test(mediaId)) {
            throw new Error(INVALID_MEDIA_ID);
        }
        return `${this.endpoint}/media/${action}/${mediaId}`;
    }

    private authHeaders(): Record<string, string> {
        return this.accessToken
            ? { authorization: `Bearer ${this.accessToken}` }
            : { "x-medialit-apikey": this.apiKey! };
    }

    private checkBrowserEnvironment() {
        if (typeof window !== "undefined" || typeof document !== "undefined") {
            throw new Error(BROWSER_ENVIRONMENT_ERROR);
        }
    }

    private async createFormData(
        file: FileInput,
        options: UploadOptions,
    ): Promise<FormData> {
        // Copied into Uint8Arrays because Node's Buffer type is not a BlobPart.
        const parts: Uint8Array[] = [];
        let name = options.fileName;
        if (typeof file === "string") {
            parts.push(new Uint8Array(await readFile(file)));
            name ??= basename(file);
        } else if (Buffer.isBuffer(file)) {
            parts.push(new Uint8Array(file));
        } else if (file instanceof Readable) {
            for await (const chunk of file) {
                parts.push(new Uint8Array(Buffer.from(chunk)));
            }
            const path = (file as Readable & { path?: unknown }).path;
            if (typeof path === "string") name ??= basename(path);
        } else {
            throw new Error(
                "Invalid file input. Must be a file path, Buffer, or Readable stream",
            );
        }
        name ??= "file";
        const type =
            options.mimeType || lookup(name) || "application/octet-stream";

        // Node's fetch only sends its own FormData, not the form-data package.
        const formData = new FormData();
        formData.append("file", new Blob(parts as BlobPart[], { type }), name);
        return formData;
    }

    async upload(file: FileInput, options: UploadOptions = {}): Promise<Media> {
        const formData = await this.createFormData(file, options);

        if (options.access) formData.append("access", options.access);
        if (options.caption) formData.append("caption", options.caption);
        if (options.group) formData.append("group", options.group);

        const response = await fetch(`${this.endpoint}/media/create`, {
            method: "POST",
            headers: {
                ...this.authHeaders(),
            },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Upload failed");
        }

        return response.json();
    }

    async delete(mediaId: string): Promise<void> {
        const response = await fetch(this.mediaUrl("delete", mediaId), {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                ...this.authHeaders(),
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Deletion failed");
        }
    }

    async seal(mediaId: string): Promise<Media> {
        const response = await fetch(this.mediaUrl("seal", mediaId), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...this.authHeaders(),
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to seal media");
        }

        return response.json();
    }

    async get(mediaId: string): Promise<Media> {
        const response = await fetch(this.mediaUrl("get", mediaId), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...this.authHeaders(),
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to get media");
        }

        return response.json();
    }

    async list(
        page: number = 1,
        limit: number = 10,
        filters: { access?: "private" | "public"; group?: string } = {},
    ): Promise<Media[]> {
        // The API reads these from the body, not the query string.
        const response = await fetch(`${this.endpoint}/media/get`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...this.authHeaders(),
            },
            body: JSON.stringify({ page, limit, ...filters }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to list media");
        }

        return response.json();
    }

    async getSignature(options: { group?: string } = {}): Promise<string> {
        const response = await fetch(
            `${this.endpoint}/media/signature/create`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...this.authHeaders(),
                },
                body: JSON.stringify({
                    ...(options.group ? { group: options.group } : {}),
                }),
            },
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to get signature");
        }

        const result = await response.json();
        return result.signature;
    }

    async getCount(): Promise<number> {
        const response = await fetch(`${this.endpoint}/media/get/count`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...this.authHeaders(),
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to get count");
        }

        const result = await response.json();
        return result.count;
    }

    async getStats(): Promise<MediaStats> {
        const response = await fetch(`${this.endpoint}/media/get/size`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...this.authHeaders(),
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to get stats");
        }

        return response.json();
    }

    async getSettings(): Promise<MediaSettings> {
        const response = await fetch(`${this.endpoint}/settings/media/get`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...this.authHeaders(),
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to get media settings");
        }

        return response.json();
    }

    async updateSettings(settings: MediaSettings): Promise<void> {
        const response = await fetch(`${this.endpoint}/settings/media/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...this.authHeaders(),
            },
            body: JSON.stringify({
                ...settings,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to update media settings");
        }
    }

    private async webhookRequest<T>(
        action: "create" | "get" | "update" | "delete" | "test" | "secret",
        body: Record<string, unknown>,
        failure: string,
    ): Promise<T> {
        const response = await fetch(
            `${this.endpoint}/settings/webhooks/${action}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...this.authHeaders(),
                },
                body: JSON.stringify(body),
            },
        );
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || failure);
        }
        return response.json();
    }

    /** The app's webhook endpoints. Secrets are left out; see
     * `revealWebhookSecret`. */
    async listWebhooks(): Promise<WebhookEndpoint[]> {
        const result = await this.webhookRequest<{
            endpoints: WebhookEndpoint[];
        }>("get", {}, "Failed to list webhooks");
        return result.endpoints;
    }

    /** Adds an endpoint and returns it with its signing secret. */
    async createWebhook(input: WebhookEndpointInput): Promise<WebhookEndpoint> {
        return this.webhookRequest(
            "create",
            { ...input },
            "Failed to create webhook",
        );
    }

    async updateWebhook(
        id: string,
        update: WebhookEndpointUpdate,
    ): Promise<WebhookEndpoint> {
        return this.webhookRequest(
            "update",
            { ...update, id },
            "Failed to update webhook",
        );
    }

    /** An endpoint's signing secret. Needs write access. */
    async revealWebhookSecret(id: string): Promise<string> {
        const result = await this.webhookRequest<{ secret: string }>(
            "secret",
            { id },
            "Failed to read the webhook secret",
        );
        return result.secret;
    }

    async deleteWebhook(id: string): Promise<void> {
        await this.webhookRequest("delete", { id }, "Failed to delete webhook");
    }

    /** Sends a signed `webhook.test` event to the endpoint now. */
    async testWebhook(id: string): Promise<WebhookTestResult> {
        return this.webhookRequest(
            "test",
            { id },
            "Failed to send a test webhook",
        );
    }
}

export type {
    Media,
    MediaDerivative,
    MediaProcessing,
    ProcessingStatus,
} from "./types";
export { createSignatureHandler } from "./signature-handler";
export type {
    SignatureGrant,
    SignatureHandlerOptions,
} from "./signature-handler";
