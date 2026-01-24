import { PathKey } from "./constants";

export type PathKey = (typeof PathKey)[keyof typeof PathKey];
