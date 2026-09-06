import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

const SESSION = "imapman_session";

export interface AuthSession {
  sub: string;
  roles: string[];
}

const secret = () => new TextEncoder().encode(process.env.FRONTEND_SESSION_SECRET);

export function authMode() {
  const mode = process.env.FRONTEND_AUTH_MODE ?? "none";
  if (!["none", "basic", "oidc"].includes(mode)) throw new Error("FRONTEND_AUTH_MODE muss none, basic oder oidc sein.");
  return mode as "none" | "basic" | "oidc";
}

export async function createSession(subject: string, roles: string[] = []) {
  if (!process.env.FRONTEND_SESSION_SECRET) throw new Error("FRONTEND_SESSION_SECRET fehlt.");
  return new SignJWT({ sub: subject, roles: [...new Set(roles)] })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
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

export async function getSession(): Promise<AuthSession | null> {
  const token = (await cookies()).get(SESSION)?.value;
  if (!token || !process.env.FRONTEND_SESSION_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string") return null;
    const roles = Array.isArray(payload.roles) ? payload.roles.filter((role): role is string => typeof role === "string") : [];
    return { sub: payload.sub, roles };
  } catch {
    return null;
  }
}

export function sessionCookie(value: string) {
  return { name: SESSION, value, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 };
}

export async function verifyOidcToken(idToken: string, nonce: string, accessToken?: string): Promise<AuthSession> {
  const issuer = process.env.OIDC_ISSUER_URL;
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!issuer || !clientId) throw new Error("OIDC_ISSUER_URL und OIDC_CLIENT_ID müssen gesetzt sein.");
  const discovery = await fetch(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, { cache: "no-store" }).then((r) => r.json() as Promise<{ jwks_uri: string }>);
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const { payload } = await jwtVerify(idToken, jwks, { issuer, audience: clientId });
  if (payload.nonce !== nonce || !payload.sub) throw new Error("Ungültige OIDC-Antwort.");
  const requiredRole = process.env.OIDC_REQUIRED_ROLE;
  const accessPayload = accessToken ? await jwtVerify(accessToken, jwks, { issuer }).then(({ payload: tokenPayload }) => tokenPayload) : undefined;
  const roles = [...new Set([...keycloakRoles(payload, clientId), ...(accessPayload ? keycloakRoles(accessPayload, clientId) : [])])];
  if (requiredRole) {
    if (!roles.includes(requiredRole)) {
      console.error("OIDC role check failed", {
        requiredRole,
        foundRoles: roles,
        realmAccess: payload.realm_access,
        resourceAccess: payload.resource_access,
      });
      throw new Error("Ihr Keycloak-Konto besitzt nicht die erforderliche Rolle.");
    }
    console.log("OIDC role check passed", { requiredRole, foundRoles: roles });
  }
  return { sub: payload.sub, roles };
}

function keycloakRoles(payload: Record<string, unknown>, clientId: string) {
  const roles: string[] = [];
  const directRoles = payload.roles;
  if (Array.isArray(directRoles)) roles.push(...directRoles.filter((role): role is string => typeof role === "string"));
  const realmAccess = payload.realm_access;
  if (isRoleContainer(realmAccess)) roles.push(...realmAccess.roles);
  const resourceAccess = payload.resource_access;
  if (isObject(resourceAccess) && isObject(resourceAccess[clientId]) && isRoleContainer(resourceAccess[clientId])) roles.push(...resourceAccess[clientId].roles);
  return [...new Set(roles)];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRoleContainer(value: unknown): value is { roles: string[] } {
  return isObject(value) && Array.isArray(value.roles) && value.roles.every((role) => typeof role === "string");
}

export function getOidcRedirectUri(requestUrl?: string) {
  if (process.env.OIDC_REDIRECT_URI) return process.env.OIDC_REDIRECT_URI;
  if (!requestUrl) throw new Error("OIDC_REDIRECT_URI fehlt und kein Request-URL ist verfügbar.");
  return new URL("/auth/callback", requestUrl).toString();
}

export function denyBasic() {
  return new NextResponse("Anmeldung erforderlich.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="ImapMan Verwaltung", charset="UTF-8"' } });
}
