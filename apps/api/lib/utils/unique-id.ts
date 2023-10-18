import { nanoid } from "nanoid";

export default function getUniqueId(size?: number) {
    return size ? nanoid(size) : nanoid();
}
