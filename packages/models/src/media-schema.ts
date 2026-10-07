import { Media } from "./media";

export type MediaWithUserId = Media & {
    userId: string;
    temp?: boolean;
};
