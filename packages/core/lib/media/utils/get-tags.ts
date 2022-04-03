export default function getTags(userId: string, group?: string) {
    const tags = new URLSearchParams();
    tags.append("user", userId);
    if (group) {
        tags.append("group", group);
    }

    return tags.toString();
}
