import { permanentRedirect } from "next/navigation";

/* Webhooks moved into App settings. Old links and bookmarks land there. */
export default async function Webhooks(props: {
    params: Promise<{ appId: string }>;
}) {
    const { appId } = await props.params;
    permanentRedirect(`/app/${encodeURIComponent(appId)}/settings#webhooks`);
}
