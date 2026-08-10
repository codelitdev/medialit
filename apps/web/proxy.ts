import { NextResponse } from "next/server";

// Authentication is checked by Server Components against Better Auth's
// API-owned session. No browser OAuth access/refresh-token BFF is needed.
export function proxy() {
    return NextResponse.next();
}
