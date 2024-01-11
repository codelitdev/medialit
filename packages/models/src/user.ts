import mongoose from "mongoose";

export interface User {
    userId: string;
    email: string;
    active: boolean;
    name?: string;
}
