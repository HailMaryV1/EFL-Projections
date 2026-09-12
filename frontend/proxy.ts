import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/adminAccess";

// Same site-wide gate as dreamteam-projections' own proxy.ts (ported
// unchanged - game-agnostic already): HTTP Basic Auth in front of the
// whole domain if SITE_PASSWORD is set (a no-op locally where it isn't,
// so nobody gets accidentally locked out of their own machine), plus
// Supabase-Auth gating for /admin specifically. Next.js 16 renamed
// Middleware to Proxy (same mechanism, new file/export name).
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

function hasValidSiteAccess(request: NextRequest): boolean {
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword) return true;
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(authHeader.slice(6));
  } catch {
    return false;
  }
  const separatorIndex = decoded.indexOf(":");
  const password = separatorIndex === -1 ? decoded : decoded.slice(separatorIndex + 1);
  return timingSafeEqual(password, sitePassword);
}

export default async function proxy(request: NextRequest) {
  if (!hasValidSiteAccess(request)) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Hail Mary", charset="UTF-8"' },
    });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedRoute = request.nextUrl.pathname.startsWith("/admin");

  // Real fix 2026-09-16 (ported from dreamteam-projections): "is signed in"
  // isn't the same as "is the admin" - see lib/adminAccess.ts for why that
  // distinction matters once this shared Supabase project has real
  // customer accounts.
  if (isProtectedRoute && !isAdminEmail(user?.email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
