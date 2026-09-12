// Real user request 2026-09-16 (ported from dreamteam-projections): every
// admin gate on this site used to treat "is anyone logged in" as good
// enough. This project shares its Supabase project with hailmary-hub,
// which plans to open real paying-customer signups later - every one of
// those future accounts would otherwise also count as "logged in" here and
// see/reach the admin area. Single source of truth so the nav link, the
// route gates, and every write action agree.
const ADMIN_EMAILS = new Set(["info@footyfits.co.uk", "tony@dreamteamtonic.co.uk"]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}
