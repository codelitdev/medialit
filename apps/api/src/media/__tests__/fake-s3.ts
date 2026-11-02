import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Just enough of S3 for the upload paths: path-style PUT, copy, DELETE and
 * tagging. Objects are kept in memory as `bucket/key`.
 */
export class FakeS3 {
    readonly objects = new Map<string, Buffer>();
    private server: Server | null = null;
    url = "";

    async start(): Promise<void> {
        this.server = http.createServer((req, res) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => this.handle(req, res, Buffer.concat(chunks)));
        });
        await new Promise<void>((resolve) =>
            this.server!.listen(0, "127.0.0.1", resolve),
        );
        this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    }

    async stop(): Promise<void> {
        await new Promise<void>((resolve) =>
            this.server ? this.server.close(() => resolve()) : resolve(),
        );
    }

    keys(bucket: string): string[] {
        const prefix = `${bucket}/`;
        return [...this.objects.keys()]
            .filter((key) => key.startsWith(prefix))
            .map((key) => key.slice(prefix.length))
            .sort();
    }

    private handle(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        body: Buffer,
    ) {
        const url = new URL(req.url ?? "/", this.url);
        const objectKey = decodeURIComponent(url.pathname.slice(1));
        const copySource = req.headers["x-amz-copy-source"];

        if (req.method === "PUT" && copySource) {
            const source = decodeURIComponent(String(copySource)).replace(
                /^\//,
                "",
            );
            const found = this.objects.get(source);
            if (!found) {
                res.writeHead(404).end();
                return;
            }
            this.objects.set(objectKey, found);
            res.writeHead(200, { "content-type": "application/xml" });
            res.end("<CopyObjectResult><ETag>x</ETag></CopyObjectResult>");
            return;
        }
        if (req.method === "PUT") {
            this.objects.set(objectKey, body);
            res.writeHead(200, { etag: '"x"' }).end();
            return;
        }
        if (req.method === "DELETE") {
            this.objects.delete(objectKey);
            res.writeHead(204).end();
            return;
        }
        if (req.method === "GET" && url.searchParams.has("tagging")) {
            res.writeHead(200, { "content-type": "application/xml" });
            res.end("<Tagging><TagSet></TagSet></Tagging>");
            return;
        }
        res.writeHead(404).end();
    }
}
