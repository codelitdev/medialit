/**
 * Which IP addresses a webhook may be delivered to. The tenant picks the URL, so delivery must never reach loopback,
 * private, link-local (cloud metadata), CGNAT, multicast or reserved
 * addresses, nor IPv6 forms that embed one of those IPv4 addresses.
 */
import { isIP } from "node:net";

type Range = { bytes: number[]; bits: number };

function v4(cidr: string): Range {
    const [address, bits] = cidr.split("/");
    return { bytes: address.split(".").map(Number), bits: Number(bits) };
}

/** IPv4 ranges that are not globally reachable (IANA special-purpose
 * registry), plus multicast and the reserved 240/4 block. */
const BLOCKED_V4: Range[] = [
    "0.0.0.0/8", // "this network"
    "10.0.0.0/8", // private
    "100.64.0.0/10", // CGNAT
    "127.0.0.0/8", // loopback
    "169.254.0.0/16", // link-local, cloud metadata
    "172.16.0.0/12", // private
    "192.0.0.0/24", // IETF protocol assignments
    "192.0.2.0/24", // documentation
    "192.88.99.0/24", // 6to4 relay anycast
    "192.168.0.0/16", // private
    "198.18.0.0/15", // benchmarking
    "198.51.100.0/24", // documentation
    "203.0.113.0/24", // documentation
    "224.0.0.0/4", // multicast
    "240.0.0.0/4", // reserved, and the broadcast address
].map(v4);

function v6(cidr: string): Range {
    const [address, bits] = cidr.split("/");
    return { bytes: ipv6Bytes(address)!, bits: Number(bits) };
}

/** Only global unicast (2000::/3) is allowed, minus these. Everything
 * outside it (`::`, `::1`, fc00::/7, fe80::/10, ff00::/8, 100::/64 and
 * the rest) is refused. */
const ALLOWED_V6 = v6("2000::/3");
const BLOCKED_GLOBAL_V6: Range[] = [
    "2001::/23", // IETF protocol assignments, Teredo
    "2001:db8::/32", // documentation
    "3fff::/20", // documentation
].map(v6);

/** IPv6 ranges that carry an IPv4 address in their last 32 bits. The
 * embedded address is checked as IPv4. */
const EMBEDS_V4: Range[] = [
    "::ffff:0:0/96", // IPv4-mapped
    "::/96", // IPv4-compatible (deprecated); also covers :: and ::1
    "64:ff9b::/96", // NAT64
    "64:ff9b:1::/48", // local NAT64
].map(v6);

function inRange(bytes: number[], range: Range): boolean {
    let bits = range.bits;
    for (let i = 0; bits > 0; i++, bits -= 8) {
        const mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
        if ((bytes[i] & mask) !== (range.bytes[i] & mask)) return false;
    }
    return true;
}

/** The 16 bytes of an IPv6 address, or null if it isn't one. Accepts a
 * trailing dotted IPv4 part (`::ffff:127.0.0.1`) and a zone (`fe80::1%eth0`). */
export function ipv6Bytes(input: string): number[] | null {
    const address = input.replace(/^\[|\]$/g, "").split("%")[0];
    if (isIP(address) !== 6) return null;
    let head = address;
    let tail: number[] = [];
    const dotted = address.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) {
        const parts = dotted[2].split(".").map(Number);
        tail = [(parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]];
        head = dotted[1].endsWith("::") ? dotted[1] : dotted[1].slice(0, -1);
    }
    const [left, right] = head.includes("::") ? head.split("::") : [head, null];
    const parse = (part: string) =>
        part === "" ? [] : part.split(":").map((group) => parseInt(group, 16));
    const leftGroups = parse(left);
    const rightGroups = right === null ? [] : parse(right);
    const missing = 8 - tail.length - leftGroups.length - rightGroups.length;
    const groups = [
        ...leftGroups,
        ...(right === null ? [] : new Array(missing).fill(0)),
        ...rightGroups,
        ...tail,
    ];
    if (groups.length !== 8) return null;
    return groups.flatMap((group) => [group >> 8, group & 0xff]);
}

function blockedV4(bytes: number[]): boolean {
    return BLOCKED_V4.some((range) => inRange(bytes, range));
}

/**
 * True when the address must not receive webhooks. Anything that isn't a
 * valid IP address is refused too.
 */
export function isBlockedAddress(address: string): boolean {
    const plain = address.replace(/^\[|\]$/g, "");
    if (isIP(plain) === 4) {
        return blockedV4(plain.split(".").map(Number));
    }
    const bytes = ipv6Bytes(plain);
    if (!bytes) return true;
    if (EMBEDS_V4.some((range) => inRange(bytes, range))) {
        return blockedV4(bytes.slice(12));
    }
    // 6to4 (2002::/16) carries an IPv4 address in bytes 2–5.
    if (bytes[0] === 0x20 && bytes[1] === 0x02) {
        return blockedV4(bytes.slice(2, 6));
    }
    if (!inRange(bytes, ALLOWED_V6)) return true;
    return BLOCKED_GLOBAL_V6.some((range) => inRange(bytes, range));
}
