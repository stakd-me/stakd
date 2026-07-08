import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/salt",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/health",
];

/**
 * Nonce-based CSP for page requests (production only). Next.js picks the
 * nonce up from the request's CSP header and stamps it onto its own inline
 * bootstrap scripts; we forward it via `x-nonce` for app code (e.g. the
 * next-themes script in the root layout).
 */
function withContentSecurityPolicy(request: NextRequest): NextResponse {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))
  );

  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // Public paths bypass auth check
    if (PUBLIC_PATHS.some((p) => pathname === p)) {
      return NextResponse.next();
    }

    // All other API routes: check for Authorization header presence
    // (actual JWT verification happens at route level)
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.next();
  }

  // Page requests get the per-request CSP nonce.
  return withContentSecurityPolicy(request);
}

export const config = {
  matcher: [
    "/api/:path*",
    // Pages, excluding static assets and prefetches (a per-request nonce
    // must not force those dynamic).
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
