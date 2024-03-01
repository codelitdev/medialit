import { User } from "@medialit/models";
import { Request } from "express";

type UploadRequest<T> = Request<
    Record<string, unknown>,
    Record<string, unknown>,
    T
> & {
    user: User;
    files: {
        file: any;
    };
};

export type UploadReqWithBody = UploadRequest<{
    caption: string;
    access: string;
}>;
