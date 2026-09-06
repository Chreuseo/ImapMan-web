import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

const SESSION = "imapman_session";
const secret = () => new TextEncoder().encode(process.env.FRONTEND_SESSION_SECRET);

export function authMode() {
  const mode = process.env.FRONTEND_AUTH_MODE ?? "none";
  if (!["none", "basic", "oidc"].includes(mode)) throw new Error("FRONTEND_AUTH_MODE muss none, basic oder oidc sein.");
  return mode as "none" | "basic" | "oidc";
}

export async function createSession(subject: string) {
  if (!process.env.FRONTEND_SESSION_SECRET) throw new Error("FRONTEND_SESSION_SECRET fehlt.");
  return new SignJWT({ sub: subject }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(secret());
}

export async function isAuthenticated() {
  const mode = authMode();
  if (mode === "none") return true;
  const requestHeaders = await headers();
  if (mode === "basic") {
    const expected = process.env.FRONTEND_BASIC_AUTH_USERNAME && process.env.FRONTEND_BASIC_AUTH_PASSWORD
      ? `Basic ${Buffer.from(`${process.env.FRONTEND_BASIC_AUTH_USERNAME}:${process.env.FRONTEND_BASIC_AUTH_PASSWORD}`).toString("base64")}` : "";
    return requestHeaders.get("authorization") === expected;
  }
  const token = (await cookies()).get(SESSION)?.value;
  if (!token || !process.env.FRONTEND_SESSION_SECRET) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

export async function requireAuth() {
  if (!(await isAuthenticated())) throw new Error("Nicht autorisiert.");
}

export function sessionCookie(value: string) {
  return { name: SESSION, value, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 };
}

export async function verifyOidcToken(idToken: string, nonce: string) {
  const issuer = process.env.OIDC_ISSUER_URL;
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!issuer || !clientId) throw new Error("OIDC_ISSUER_URL und OIDC_CLIENT_ID müssen gesetzt sein.");
  const discovery = await fetch(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, { cache: "no-store" }).then((r) => r.json() as Promise<{ jwks_uri: string }>);
  const { payload } = await jwtVerify(idToken, createRemoteJWKSet(new URL(discovery.jwks_uri)), { issuer, audience: clientId });
  if (payload.nonce !== nonce || !payload.sub) throw new Error("Ungültige OIDC-Antwort.");
  const requiredRole = process.env.OIDC_REQUIRED_ROLE;
  if (requiredRole && !keycloakRoles(payload, clientId).includes(requiredRole)) {
    throw new Error("Ihr Keycloak-Konto besitzt nicht die erforderliche Rolle.");
  }
  return payload.sub;
}

function keycloakRoles(payload: Record<string, unknown>, clientId: string) {
  const roles: string[] = [];
  const realmAccess = payload.realm_access;
  if (isRoleContainer(realmAccess)) roles.push(...realmAccess.roles);
  const resourceAccess = payload.resource_access;
  if (isObject(resourceAccess) && isRoleContainer(resourceAccess[clientId])) roles.push(...resourceAccess[clientId].roles);
  return roles;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRoleContainer(value: unknown): value is { roles: string[] } {
  return isObject(value) && Array.isArray(value.roles) && value.roles.every((role) => typeof role === "string");
}

export function denyBasic() {
  return new NextResponse("Anmeldung erforderlich.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="ImapMan Verwaltung", charset="UTF-8"' } });
}
