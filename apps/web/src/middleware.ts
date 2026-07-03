import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedEmail } from "@/lib/auth";

export const config = {
  matcher: [
    // Run on every route except Next.js internals and public assets.
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)",
  ],
};

export function middleware(req: NextRequest) {
  const email = getAuthenticatedEmail(req);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = process.env.ALLOWED_EMAILS?.split(",").map((e) => e.trim());
  if (allowed?.length && email !== "service-token" && !allowed.includes(email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.next();
}
