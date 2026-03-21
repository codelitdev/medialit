import { docs } from "../.source/server";
import { loader, multiple } from "fumadocs-core/source";
import { createElement } from "react";
import { icons } from "lucide-react";
import { openapiPlugin, openapiSource } from "fumadocs-openapi/server";
import { openapi } from "@/lib/openapi";

const apiSource = await openapiSource(openapi, {
    baseDir: "api",
});

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
    // it assigns a URL to your pages
    baseUrl: "/",
    source: multiple({
        docs: docs.toFumadocsSource(),
        openapi: apiSource,
    }),
    plugins: [openapiPlugin()],
    icon(icon) {
        if (icon && icon in icons)
            return createElement(icons[icon as keyof typeof icons]);
    },
});
