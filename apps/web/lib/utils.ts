import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import Apikey from "@/models/apikey";
import User from "@/models/user";
import { createHash, randomInt } from "crypto";
import { Session } from "next-auth";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
