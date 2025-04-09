const courselitServer = process.env.COURSELIT_SERVER;
const courselitApikey = process.env.COURSELIT_APIKEY;

export async function createUser({ email }: { email: string }) {
    if (!courselitServer || !courselitApikey) {
        return;
    }

    const endPoint = `${courselitServer}/api/user`;

    let response: any = await fetch(endPoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            email,
            apikey: courselitApikey,
        }),
    });

    if (response.ok) {
        response = await response.json();

        if (response.error) {
            throw new Error(response.error);
        }

        return response;
    } else {
        throw new Error(
            `${response.status}, ${response.statusText}, ${endPoint}`,
        );
    }
}
