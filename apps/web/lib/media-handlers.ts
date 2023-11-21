import { Media } from "@medialit/models";

const medialitServer = process.env.API_SERVER || "https://api.medialit.cloud";

interface GetPaginatedMediaProps {
    group?: string;
    page?: number;
    limit?: number;
    access?: "public" | "private";
    apikey: string;
    internalApikey: string;
}

export async function getPaginatedMedia({
    apikey,
    internalApikey,
    group,
    page,
    limit,
    access,
}: GetPaginatedMediaProps): Promise<Media[]> {
    const urlParams = new URLSearchParams();
    if (group) {
        urlParams.append("group", group);
    }
    urlParams.append("page", page ? page.toString() : "1");
    urlParams.append("limit", limit ? limit.toString() : "20");
    if (access) {
        urlParams.append("access", access);
    }

    const response: any = await fetch(
        `${medialitServer}/media/get?` + urlParams.toString(),
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                apikey,
                internalApikey,
            }),
            credentials: "same-origin",
        }
    );
    const jsonResponse = await response.json();

    if (response.status === 200) {
        return jsonResponse;
    } else {
        throw new Error(jsonResponse.error);
    }
}

export async function getMedia({
    mediaId,
    apikey,
    internalApikey,
}: {
    mediaId: string;
    apikey: string;
    internalApikey: string;
}): Promise<Media> {
    let response: any = await fetch(`${medialitServer}/media/get/${mediaId}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            apikey,
            internalApikey,
        }),
    });
    response = await response.json();
    return response;
}

export async function getPresignedUrlForUpload({
    apikey,
    internalApikey,
    group,
}: {
    apikey: string;
    internalApikey: string;
    group?: string;
}): Promise<string> {
    let response: any = await fetch(
        `${medialitServer}/media/presigned/create`,
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                apikey,
                internalApikey,
                group,
            }),
        }
    );
    response = await response.json();

    if (response.error) {
        throw new Error(response.error);
    }

    return response.message;
}

export async function deleteMedia({
    mediaId,
    apikey,
    internalApikey,
}: {
    mediaId: string;
    apikey: string;
    internalApikey: string;
}): Promise<boolean> {
    let response: any = await fetch(
        `${medialitServer}/media/delete/${mediaId}`,
        {
            method: "DELETE",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                apikey,
                internalApikey,
            }),
        }
    );
    response = await response.json();

    if (response.error) {
        throw new Error(response.error);
    }

    if (response.message === "success") {
        return true;
    } else {
        throw new Error(response.message);
    }
}
