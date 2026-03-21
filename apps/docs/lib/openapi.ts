import path from "path";
import { fileURLToPath } from "url";
import { createOpenAPI } from "fumadocs-openapi/server";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const openapiSpecPath = path.resolve(
    currentDir,
    "../../api/src/swagger_output.json",
);

export const openapi = createOpenAPI({
    input: [openapiSpecPath],
});
