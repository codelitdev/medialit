import { Router } from "express";
import { createOAuthPagesRouter } from "@codelitdev/oauth-server-kit/express";
import { authBasePath, hostedLoginMethods, webClientUrl } from "./better-auth";

const router = Router();

router.use(
    createOAuthPagesRouter({
        appName: "MediaLit",
        authBasePath,
        allowedRedirectOrigins: [webClientUrl],
        defaultRedirectUrl: new URL("/", webClientUrl).toString(),
        loginMethods: hostedLoginMethods,
    }),
);

export default router;
