import { Request } from "express";
import { User } from "../user/model";

type UploadRequest<T> = Request<{}, {}, T> & {
  user: User,
  files: {
    file: any
  };
};

export type UploadReqWithBody = UploadRequest<{caption: string; access: string}>