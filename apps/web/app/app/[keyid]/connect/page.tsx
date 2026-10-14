import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { getApikeyUsingKeyId } from "@/app/actions";
import { cliNeedsEndpoint, getPublicApiBase } from "@/lib/api-base";
import ConnectGuide from "./connect-guide";

export default async function ConnectPage(props: {
    params: Promise<{ keyid: string }>;
}) {
    const [{ keyid }, session] = await Promise.all([props.params, auth()]);
    if (!session) redirect("/login");

    const app = await getApikeyUsingKeyId(keyid);
    if (!app) redirect("/");

    const apiBase = getPublicApiBase(await headers());
    const includeCliEndpoint = cliNeedsEndpoint(apiBase);

    return (
        <>
            <div className="workspace-page-heading">
                <div>
                    <h1>Connect</h1>
                    <p>
                        Work with {app.name || "this app"} from an AI assistant
                        or your own code.
                    </p>
                </div>
            </div>
            <ConnectGuide
                appName={app.name || "this app"}
                apiEndpoint={apiBase}
                includeCliEndpoint={includeCliEndpoint}
                serverUrl={`${apiBase}/mcp`}
            />
        </>
    );
}
