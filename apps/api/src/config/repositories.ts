import { createRepositories, type Repositories } from "@medialit/db";
import { getDb } from "./db";

let repositories: Repositories | undefined;

export default function getRepositories(): Repositories {
    if (!repositories) {
        repositories = createRepositories(getDb());
    }
    return repositories;
}
