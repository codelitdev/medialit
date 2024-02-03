import mongoose from "mongoose";

export default interface GetPageProps {
    userId: mongoose.Types.ObjectId;
    access: "public-read" | "private";
    page: number;
    recordsPerPage: number;
    group?: string;
}
