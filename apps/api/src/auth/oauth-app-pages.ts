import { fromNodeHeaders } from "better-auth/node";
import express, {
    Router,
    type NextFunction,
    type Request,
    type RequestHandler,
    type Response,
} from "express";
import type { OAuthApp, OAuthAppSelectionAdapter } from "./oauth-app-selection";

export const SELECT_APP_PATH = "/oauth/select-app";

type SessionApi = {
    api: {
        getSession(input: { headers: Headers }): Promise<{
            user: { id: string };
            session: { id: string };
        } | null>;
    };
};

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Mirrors the hosted login and consent pages from oauth-server-kit.
const STYLES = `html{--brand-primary:#8c7a6b;color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f4f5;color:#171717;font-family:system-ui,sans-serif}
.card{width:100%;max-width:400px;padding:32px;border:1px solid #e4e4e7;border-radius:14px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04)}.logo{width:38px;height:38px;margin:0 auto 20px;display:grid;place-items:center;border-radius:50%;background:#171717;color:#fff;font-weight:700}
h1{margin:0 0 24px;text-align:center;font-size:22px;font-weight:650}.sub{margin:-12px 0 24px;text-align:center;color:#71717a;font-size:13px;line-height:1.5}.error{display:none;margin-bottom:16px;padding:10px 12px;border-radius:8px;background:#fef2f2;color:#b42318;font-size:13px}
form{margin:0}.apps{display:grid;gap:8px;margin-bottom:16px}.app{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #e4e4e7;border-radius:9px;background:#fafafa;cursor:pointer;font-size:14px}.app:has(input:checked){border-color:var(--brand-primary);background:#fff}.app input{margin:0;accent-color:var(--brand-primary)}.app-name{flex:1;font-weight:550;word-break:break-word}.badge{padding:2px 6px;border:1px solid #e4e4e7;border-radius:6px;color:#52525b;font-size:11px}
button{width:100%;margin-top:8px;padding:11px;border:1px solid var(--brand-primary);border-radius:8px;background:var(--brand-primary);color:#fff;font-size:14px;font-weight:550;cursor:pointer}button:focus-visible{outline:2px solid var(--brand-primary);outline-offset:2px}button:disabled{opacity:.55;cursor:not-allowed}`;

function page(body: string): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Choose a MediaLit app</title><style>${STYLES}</style></head><body><main class="card"><div class="logo">M</div>${body}</main></body></html>`;
}

function continueScript(authBasePath: string): string {
    return `async function continueAuthorization(){var response=await fetch(${JSON.stringify(`${authBasePath}/oauth2/continue`)},{method:"POST",headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify({postLogin:true,oauth_query:location.search.slice(1)})});var data={};try{data=await response.json()}catch{}var target=data.url||data.redirect_uri;if(!response.ok||!target)throw new Error();location.assign(target)}`;
}

function pickerPage(apps: OAuthApp[], authBasePath: string): string {
    const defaultApp = apps.find((app) => app.isDefault) ?? apps[0];
    const choices = apps
        .map(
            (app) =>
                `<label class="app"><input type="radio" name="app" value="${escapeHtml(app.keyId)}"${app === defaultApp ? " checked" : ""}><span class="app-name">${escapeHtml(app.name)}</span>${app.isDefault ? '<span class="badge">Default</span>' : ""}</label>`,
        )
        .join("");
    return page(
        `<h1>Choose an app</h1><p class="sub">The connected client will upload, list and delete files in this app.</p><div class="error" id="error"></div><form id="app-form"><div class="apps">${choices}</div><button type="submit">Continue</button></form><script>(function(){${continueScript(authBasePath)}var form=document.getElementById("app-form"),button=form.querySelector("button"),errorEl=document.getElementById("error");form.addEventListener("submit",async function(event){event.preventDefault();var selected=form.querySelector('input[name="app"]:checked');if(!selected)return;button.disabled=true;errorEl.style.display="none";try{var save=await fetch(${JSON.stringify(SELECT_APP_PATH)},{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({appId:selected.value})});if(!save.ok)throw new Error();await continueAuthorization()}catch{errorEl.textContent="Could not continue authorization.";errorEl.style.display="block";button.disabled=false}})})();</script>`,
    );
}

function asyncHandler(
    handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
    return (request, response, next: NextFunction) => {
        void handler(request, response).catch(next);
    };
}

/**
 * The post-login app picker. Better Auth redirects here (see
 * `oauth-app-selection.ts`) when the user has more than one app and has not
 * picked one in this authorization flow.
 */
export function createOAuthAppPages(options: {
    auth: SessionApi;
    adapter: OAuthAppSelectionAdapter;
    authBasePath: string;
}): Router {
    const router = Router();

    router.use(SELECT_APP_PATH, (_request, response, next) => {
        response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Cache-Control", "no-store");
        next();
    });

    router.get(
        SELECT_APP_PATH,
        asyncHandler(async (request, response) => {
            const session = await options.auth.api.getSession({
                headers: fromNodeHeaders(request.headers),
            });
            const oauthQuery = request.originalUrl.split("?")[1] ?? "";
            if (!session?.user) {
                response.redirect(`/oauth/login?${oauthQuery}`);
                return;
            }
            const apps = await options.adapter.listAppsForUser(session.user.id);
            if (apps.length <= 1) {
                response
                    .type("html")
                    .send(
                        page(
                            `<h1>Continuing&hellip;</h1><script>(function(){${continueScript(options.authBasePath)}continueAuthorization()})();</script>`,
                        ),
                    );
                return;
            }
            response.type("html").send(pickerPage(apps, options.authBasePath));
        }),
    );

    router.post(
        SELECT_APP_PATH,
        express.json(),
        asyncHandler(async (request, response) => {
            const session = await options.auth.api.getSession({
                headers: fromNodeHeaders(request.headers),
            });
            if (!session?.user) {
                response.status(401).json({ error: "unauthorized" });
                return;
            }
            const appId =
                typeof request.body?.appId === "string"
                    ? request.body.appId
                    : undefined;
            if (!appId) {
                response.status(400).json({
                    error: "invalid_request",
                    error_description: "appId is required",
                });
                return;
            }
            const apps = await options.adapter.listAppsForUser(session.user.id);
            const selected = apps.find((app) => app.keyId === appId);
            if (!selected) {
                response.status(404).json({
                    error: "app_not_found",
                    error_description: "This app does not exist.",
                });
                return;
            }
            await options.adapter.setSelection(session.session.id, selected.id);
            response.json({ ok: true });
        }),
    );

    return router;
}
