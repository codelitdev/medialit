import { NextRequest } from "next/server";
import { redirectToAppHome } from "@/lib/current-app";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ keyid: string }> },
) {
    const { keyid } = await params;
    return redirectToAppHome(keyid, request, "settings");
}
