import { AccessControl as AccessControlConstants } from "./constants";

export type AccessControl =
    (typeof AccessControlConstants)[keyof typeof AccessControlConstants];
