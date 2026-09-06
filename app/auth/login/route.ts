import { NextRequest, NextResponse } from "next/server";
import { authMode } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (authMode() !== "oidc") return NextResponse.redirect(new URL("/", request.url));
  const issuer = process.env.OIDC_ISSUER_URL;
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!issuer || !clientId) return new NextResponse("OIDC_ISSUER_URL und OIDC_CLIENT_ID müssen gesetzt sein.", { status: 500 });
  const discovery = await fetch(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, { cache: "no-store" }).then((response) => response.json() as Promise<{ authorization_endpoint: string }>);
  const state = crypto.randomUUID(), nonce = crypto.randomUUID();
  const callback = new URL("/auth/callback", request.url).toString();
  const url = new URL(discovery.authorization_endpoint);
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code", scope: "openid profile email", state, nonce }).toString();
  const response = NextResponse.redirect(url);
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  response.cookies.set("oidc_state", state, options); response.cookies.set("oidc_nonce", nonce, options);
  return response;
}
