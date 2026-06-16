# Custom OAuth Flow for Web app

We will replace NextAuth completely in `apps/web` with a custom PKCE-based OAuth 2.0 flow using HTTP-only cookies.

## Proposed Changes

### Web Application (`apps/web`)

#### [NEW] [auth.ts](file:///home/rajat/dev/proj/medialit/apps/web/auth.ts)

- Replace NextAuth exports with:
    - `auth()`: Reads `session_user` and `session_access_token` cookies. Returns `{ user, accessToken }` or null.
    - `signOut()`: Revokes `session_refresh_token`, clears session cookies, and redirects to `/login`.

#### [DELETE] [auth.config.ts](file:///home/rajat/dev/proj/medialit/apps/web/auth.config.ts)

- Remove `auth.config.ts`.

#### [MODIFY] [middleware.ts](file:///home/rajat/dev/proj/medialit/apps/web/middleware.ts)

- Implement custom routing protection:
    - Check if `session_access_token` cookie exists.
    - If the access token is missing, expired, or near expiry while a refresh token exists, use `session_refresh_token` to call `/oauth/token` with `grant_type=refresh_token`.
    - Store the rotated `access_token` and `refresh_token` cookies returned by the OAuth server.
    - If refresh fails, clear local session cookies and redirect to `/login`.
    - If not, redirect unauthenticated users to `/login`.
    - Exclude `/login`, `/api/auth/callback/medialit`, `/api/auth/signout`, and static assets from routing protection.

#### [MODIFY] [login/page.tsx](file:///home/rajat/dev/proj/medialit/apps/web/app/login/page.tsx)

- Redesign the `/login` route:
    - Generate a secure random `state` and `code_verifier`.
    - Generate the SHA-256 `code_challenge`.
    - Save the `code_verifier` in a short-lived HTTP-only cookie `oauth_code_verifier`.
    - Redirect the user to `${process.env.API_SERVER}/oauth/authorize?response_type=code&client_id=web-client&redirect_uri=http://localhost:3000/api/auth/callback/medialit&code_challenge=${challenge}&code_challenge_method=S256&state=${state}`.

#### [NEW] [route.ts](file:///home/rajat/dev/proj/medialit/apps/web/app/api/auth/callback/medialit/route.ts)

- Create callback API route:
    - Verify `state`.
    - Retrieve `oauth_code_verifier` from cookies.
    - Perform token exchange at `${process.env.API_SERVER}/oauth/token`.
    - Retrieve user profile at `${process.env.API_SERVER}/oauth/userinfo`.
    - Save `session_access_token`, `session_refresh_token`, and `session_user` in secure HTTP-only cookies.
    - Redirect to `/`.

#### [NEW] [route.ts](file:///home/rajat/dev/proj/medialit/apps/web/app/api/auth/signout/route.ts)

- Create signout endpoint:
    - Revoke `session_refresh_token` via `${process.env.API_SERVER}/oauth/revoke`.
    - Clear `session_access_token`, `session_refresh_token`, and `session_user` cookies.
    - Redirect to `/login`.

#### [MODIFY] [auth-button.tsx](file:///home/rajat/dev/proj/medialit/apps/web/components/auth-button.tsx)

- Update to use the custom `auth()` helper and use standard link redirection to `/api/auth/signout` on signout.

#### [DELETE] [route.ts](file:///home/rajat/dev/proj/medialit/apps/web/app/api/auth/[...nextauth]/route.ts)

- Remove the legacy NextAuth dynamic route handler.

## Verification Plan

### Manual Verification

- Unauthenticated access redirects to `/login`.
- Verify the API's styled authorization screen is presented.
- Entering OTP redirects back to `/` with cookies set.
- Near-expired access tokens are refreshed and refresh-token rotation updates both token cookies.
- Deleting cookies triggers redirect back to `/login`.
- Clicking Sign out revokes the refresh token, clears cookies, and redirects to `/login`.
