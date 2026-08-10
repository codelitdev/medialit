// Not httpOnly, deliberately: this is just "which app am I looking at" —
// not a credential. Every server action re-derives the actual Apikey
// server-side from the authenticated session, this cookie only picks which
// one the dashboard renders.
//
// Split into its own module (no server-only imports) so client components
// can reference the cookie name without pulling in next/headers.
export const CURRENT_APP_COOKIE = "medialit_current_keyid";
