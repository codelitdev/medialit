type Env = Record<string, string | undefined>;

/** A whole-number setting of at least `min`. Unset or blank gives the
 * fallback; anything else that isn't valid throws, so a typo stops startup. */
export function wholeNumberSetting(
    env: Env,
    name: string,
    fallback: number,
    min = 1,
): number {
    const value = env[name];
    if (value === undefined || value.trim() === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min) {
        throw new Error(
            min === 1
                ? `${name} must be a positive whole number`
                : `${name} must be a whole number of at least ${min}`,
        );
    }
    return parsed;
}

/** A number above 0 (or at least 0 with `allowZero`) from `process.env`,
 * read on each call. Anything else gives the fallback. */
export function numberFromEnv(
    name: string,
    fallback: number,
    { allowZero = false } = {},
): number {
    const value = process.env[name];
    if (value === undefined || value.trim() === "") return fallback;
    const parsed = Number(value);
    const valid =
        Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0);
    return valid ? parsed : fallback;
}
