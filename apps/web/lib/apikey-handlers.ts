import {
    createDatabase,
    createRepositories,
    type ApikeyRow,
} from "@medialit/db";
import { getUniqueId } from "@medialit/utils";

let repositories: ReturnType<typeof createRepositories> | undefined;

function getApiKeyRepository() {
    if (!repositories) {
        const connectionString = process.env.DB_CONNECTION_STRING;
        if (!connectionString)
            throw new Error("DB_CONNECTION_STRING is not configured");
        repositories = createRepositories(createDatabase(connectionString));
    }
    return repositories.apikeys;
}

export async function getApiKeysByUserId(
    userId: string,
    keyId?: string,
): Promise<ApikeyRow[] | null> {
    if (keyId) {
        const key = await getApiKeyRepository().findByUserIdAndKeyId(
            userId,
            keyId,
            { excludeDeleted: true },
        );
        return key ? [key] : [];
    }
    return getApiKeyRepository().findManyByUserId(userId, {
        excludeDeleted: true,
    });
}

export function getApikeyFromKeyId(
    userId: string,
    keyId: string,
): Promise<ApikeyRow | null> {
    return getApiKeyRepository().findByUserIdAndKeyId(userId, keyId, {
        excludeDeleted: true,
    });
}

export function createApiKey(userId: string, name: string): Promise<ApikeyRow> {
    return getApiKeyRepository().create({
        name,
        key: getUniqueId(),
        userId,
        default: false,
    });
}

export async function deleteApiKey(
    userId: string,
    keyId: string,
): Promise<void> {
    const key = await getApiKeyRepository().findByUserIdAndKeyId(
        userId,
        keyId,
        { excludeDeleted: true },
    );
    if (key?.default) throw new Error("Default API key cannot be deleted");
    await getApiKeyRepository().softDelete(userId, keyId);
}

export function editApiKey({
    userId,
    name,
    newName,
}: {
    userId: string;
    name: string;
    newName: string;
}): Promise<void> {
    return getApiKeyRepository().renameByUserIdAndName(userId, name, newName);
}

export async function getApikeyByUserId({
    userId,
    keyId,
}: {
    userId: string;
    keyId: string;
}): Promise<ApikeyRow | null> {
    const apikey = await getApikeyFromKeyId(userId, keyId);
    if (!apikey) throw new Error("Apikey not found");
    return apikey;
}
