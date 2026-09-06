import { NextRequest, NextResponse } from "next/server";
import { authMode, createSession, getOidcRedirectUri, sessionCookie, verifyOidcToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (authMode() !== "oidc") return NextResponse.redirect(new URL("/", request.url));
  const code = request.nextUrl.searchParams.get("code"), state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("oidc_state")?.value, nonce = request.cookies.get("oidc_nonce")?.value;
  if (!code || !state || state !== expectedState || !nonce) return new NextResponse("Ungültige OIDC-Anmeldung.", { status: 400 });
  const issuer = process.env.OIDC_ISSUER_URL!, clientId = process.env.OIDC_CLIENT_ID!, clientSecret = process.env.OIDC_CLIENT_SECRET;
  const discovery = await fetch(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, { cache: "no-store" }).then((response) => response.json() as Promise<{ token_endpoint: string }>);
  const callback = getOidcRedirectUri(request.url);
  const tokenResponse = await fetch(discovery.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callback, client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}) }) });
  if (!tokenResponse.ok) return new NextResponse("Keycloak hat den Anmeldecode abgelehnt.", { status: 401 });
  const { id_token: idToken, access_token: accessToken } = await tokenResponse.json() as { id_token?: string; access_token?: string };
  if (!idToken) return new NextResponse("Keycloak lieferte kein ID-Token.", { status: 401 });
  const response = NextResponse.redirect(new URL("/", request.url));
  const session = await verifyOidcToken(idToken, nonce, accessToken);
  response.cookies.set(sessionCookie(await createSession(session.sub, session.roles)));
  response.cookies.delete("oidc_state"); response.cookies.delete("oidc_nonce");
  return response;
}
