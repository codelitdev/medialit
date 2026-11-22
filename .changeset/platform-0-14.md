---
"@medialit/api": patch
"@medialit/web": patch
---

Update the Codelit platform packages to 0.14.1 and Better Auth to 1.7.22, which carries Better Auth security fixes. On the sign-in page, "Continue with email" now waits for the security check, and the page fits phone screens. Sessions use hardened cookie settings without renaming the cookie when `AUTH_COOKIE_DOMAIN` is set, so nobody is signed out. A new `TRUST_PROXY` setting lists the proxies to trust for the client address; `ENABLE_TRUST_PROXY` keeps working.
