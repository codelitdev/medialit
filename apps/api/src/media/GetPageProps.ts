import { AccessControl } from "@medialit/models";
import mongoose from "mongoose";

export default interface GetPageProps {
    userId: mongoose.Types.ObjectId;
    apikey: string;
    access: AccessControl;
    page: number;
    recordsPerPage: number;
    group?: string;
}
