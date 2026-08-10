import { createRepositories, type Repositories } from "../db/repositories";
import { getDb } from "./db";

let repositories: Repositories | undefined;

export default function getRepositories(): Repositories {
    if (!repositories) {
        repositories = createRepositories(getDb());
    }
    return repositories;
}
