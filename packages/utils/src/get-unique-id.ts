import { nanoid } from "nanoid";

export default function getUniqueId(size?: number) {
    return typeof size === "number" ? nanoid(size) : nanoid();
}
