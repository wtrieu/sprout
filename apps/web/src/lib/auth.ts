import { NextRequest, NextResponse } from "next/server";

const ACCESS_EMAIL_HEADER = "cf-access-authenticated-user-email";
// Cloudflare Access injects a signed JWT on EVERY authenticated request (both
// human logins and service tokens) and strips the client-supplied
// CF-Access-Client-Id/-Secret headers before forwarding to the origin. So the
// presence of the assertion — not the client-id — is the signal that a request
// passed Access. (cf-access-client-id kept only as a fallback for setups that
// forward it.)
const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const SERVICE_TOKEN_HEADER = "cf-access-client-id";

/**
 * Returns the authenticated email if the request was admitted by Cloudflare
 * Access, or null otherwise. Service tokens carry no user email, so they are
 * recognized by the CF Access JWT assertion that Access adds after validating
 * the token at the edge.
 *
 * In dev (DEV_BYPASS_AUTH=true) returns the ALLOWED_EMAIL env value.
 */
export const getAuthenticatedEmail = (req: NextRequest | Request): string | null => {
  if (process.env.DEV_BYPASS_AUTH === "true") {
    return process.env.ALLOWED_EMAILS?.split(",")[0]?.trim() ?? "dev@local";
  }

  const headers = "headers" in req ? req.headers : (req as Request).headers;
  const email = headers.get(ACCESS_EMAIL_HEADER);
  if (email) return email;

  if (headers.get(ACCESS_JWT_HEADER) || headers.get(SERVICE_TOKEN_HEADER)) {
    return "service-token";
  }
  return null;
};

export const requireAuth = (
  req: NextRequest | Request,
): { email: string } | NextResponse => {
  const email = getAuthenticatedEmail(req);
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = process.env.ALLOWED_EMAILS?.split(",").map((e) => e.trim());
  if (allowed?.length && email !== "service-token" && !allowed.includes(email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return { email };
};
