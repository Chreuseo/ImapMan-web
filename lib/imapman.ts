import "server-only";

const baseUrl = () => {
  const url = process.env.IMAPMAN_API_URL;
  if (!url || !process.env.IMAPMAN_API_SECRET) throw new Error("IMAPMAN_API_URL und IMAPMAN_API_SECRET müssen gesetzt sein.");
  return url.replace(/\/$/, "");
};

export async function imapmanFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl()}/api/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.IMAPMAN_API_SECRET!}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `ImapMan API: ${response.status}`);
  }
  return (response.status === 204 ? undefined : response.json()) as T;
}
