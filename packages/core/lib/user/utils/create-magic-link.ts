interface CreateMagicLinkProps {
    protocol: string;
    host: string;
    token: string;
}

export default function ({ protocol, host, token }: CreateMagicLinkProps) {
    return `${protocol}://${host}/user/login?token=${token}`;
}
