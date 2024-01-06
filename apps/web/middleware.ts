// export { default } from "next-auth/middleware";

// export const config = { matcher: ["/dashboard"] };

import { auth } from "./auth";

export const middleware = auth;

export const config = {
    // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
    matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
