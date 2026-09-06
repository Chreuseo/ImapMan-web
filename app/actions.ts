"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { imapmanFetch } from "@/lib/imapman";
import type { Condition, DataSourcePreviewResponse } from "@/lib/types";

const text = (form: FormData, name: string, required = false) => {
  const value = String(form.get(name) ?? "").trim();
  if (required && !value) throw new Error(`Feld „${name}“ ist erforderlich.`);
  return value;
};
const integer = (form: FormData, name: string, fallback?: number) => {
  const value = text(form, name);
  if (!value && fallback !== undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`Feld „${name}“ muss eine Zahl sein.`);
  return Number(value);
};
const done = (page: string) => { revalidatePath("/"); redirect(`/?page=${page}&success=Gespeichert`); };
const filter = (form: FormData): Condition[] => {
  const columns = form.getAll("filter_column").map(String);
  const operators = form.getAll("filter_op").map(String);
  const values = form.getAll("filter_value").map(String);
  const allowedOperators = new Set<Condition["op"]>(["=", "!=", "<", "<=", ">", ">=", "LIKE", "NOT LIKE"]);
  return columns.map((column, index) => {
    const value = values[index]?.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column) || !value || !allowedOperators.has(operators[index] as Condition["op"])) throw new Error("Jede Filterbedingung benötigt Spalte, zulässigen Operator und Wert.");
    return { column, op: operators[index] as Condition["op"], value: value === "true" ? true : value === "false" ? false : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value };
  });
};

export async function createMailbox(form: FormData) {
  await requireAuth();
  try {
    const smtp = ["smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from"].map((key) => text(form, key));
    const smtpTlsMode = text(form, "smtp_tls_mode");
    if (smtpTlsMode && !["starttls", "implicit_tls", "plain"].includes(smtpTlsMode)) throw new Error("Ungültiger SMTP-TLS-Modus.");
    if (smtp.some(Boolean) && smtp.some((value) => !value)) throw new Error("Eigener SMTP-Transport muss vollständig ausgefüllt sein.");
    await imapmanFetch("/mailboxes", { method: "POST", body: JSON.stringify({
      name: text(form, "name", true), imap_host: text(form, "imap_host", true), imap_port: integer(form, "imap_port", 993),
      imap_username: text(form, "imap_username", true), imap_password: text(form, "imap_password", true),
      imap_folder: text(form, "imap_folder", true), imap_mark_seen: form.get("imap_mark_seen") === "on",
      ...(smtp.every(Boolean) ? { smtp_host: smtp[0], smtp_port: Number(smtp[1]), smtp_username: smtp[2], smtp_password: smtp[3], smtp_from: smtp[4], ...(smtpTlsMode ? { smtp_tls_mode: smtpTlsMode } : {}) } : {}),
    }) });
  } catch (error) { redirect(`/?page=mailboxes&error=${encodeURIComponent(error instanceof Error ? error.message : "Unbekannter Fehler")}`); }
  done("mailboxes");
}

export async function createDistributor(form: FormData) {
  await requireAuth();
  try { await imapmanFetch("/distributors", { method: "POST", body: JSON.stringify({ name: text(form, "name", true), sender_policy: text(form, "sender_policy", true) }) }); }
  catch (error) { redirect(`/?page=distributors&error=${encodeURIComponent(error instanceof Error ? error.message : "Unbekannter Fehler")}`); }
  done("distributors");
}

export async function createList(form: FormData) {
  await requireAuth();
  try {
    const listType = text(form, "list_type", true);
    await imapmanFetch("/lists", { method: "POST", body: JSON.stringify({
      name: text(form, "name", true), list_type: listType,
      ...(listType === "database" ? { datasource_id: integer(form, "datasource_id"), recipient_table: text(form, "recipient_table", true), email_column: text(form, "email_column", true), name_column: text(form, "name_column") || undefined, filter: filter(form) } : {}),
    }) });
  } catch (error) { redirect(`/?page=lists&error=${encodeURIComponent(error instanceof Error ? error.message : "Unbekannter Fehler")}`); }
  done("lists");
}

export async function createDataSource(form: FormData) {
  await requireAuth();
  try { await imapmanFetch("/data-sources", { method: "POST", body: JSON.stringify({ name: text(form, "name", true), driver: text(form, "driver", true), dsn: text(form, "dsn", true), username: text(form, "username") || undefined, password: text(form, "password") || undefined }) }); }
  catch (error) { redirect(`/?page=data-sources&error=${encodeURIComponent(error instanceof Error ? error.message : "Unbekannter Fehler")}`); }
  done("data-sources");
}

export type DataSourceToolState = {
  error?: string;
  message?: string;
  preview?: DataSourcePreviewResponse;
};

export async function testDataSource(_: DataSourceToolState, form: FormData): Promise<DataSourceToolState> {
  try {
    await requireAuth();
    await imapmanFetch(`/data-sources/${integer(form, "data_source_id")}/test`, { method: "POST" });
    return { message: "Verbindung erfolgreich hergestellt." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Verbindungstest fehlgeschlagen." };
  }
}

export async function previewDataSource(_: DataSourceToolState, form: FormData): Promise<DataSourceToolState> {
  try {
    await requireAuth();
    const limit = integer(form, "limit", 20);
    if (limit < 1 || limit > 1_000) throw new Error("Das Limit muss zwischen 1 und 1000 liegen.");
    const preview = await imapmanFetch<DataSourcePreviewResponse>(`/data-sources/${integer(form, "data_source_id")}/preview`, {
      method: "POST",
      body: JSON.stringify({
        recipient_table: text(form, "recipient_table", true),
        email_column: text(form, "email_column", true),
        name_column: text(form, "name_column") || undefined,
        filter: filter(form),
        limit,
      }),
    });
    return { preview };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Vorschau konnte nicht geladen werden." };
  }
}

export async function createMember(form: FormData) {
  await requireAuth();
  const listId = integer(form, "list_id");
  try {
    await imapmanFetch(`/lists/${listId}/members`, { method: "POST", body: JSON.stringify({
      name: text(form, "name", true), email: text(form, "email", true), receives_mail: form.get("receives_mail") === "on",
    }) });
  } catch (error) { redirect(`/?page=lists&listId=${listId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unbekannter Fehler")}`); }
  revalidatePath("/");
  redirect(`/?page=lists&listId=${listId}&success=Mitglied gespeichert`);
}

export async function deleteResource(form: FormData) {
  await requireAuth();
  const page = text(form, "page", true);
  try { await imapmanFetch(text(form, "path", true), { method: "DELETE" }); }
  catch (error) { redirect(`/?page=${page}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unbekannter Fehler")}`); }
  done(page);
}

export async function linkConfiguration(form: FormData) {
  await requireAuth();
  const page = text(form, "page", true);
  try {
    await imapmanFetch(configurationPath(form), { method: "PUT" });
  } catch (error) { redirect(`/?page=${page}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unbekannter Fehler")}`); }
  done(page);
}

export async function unlinkConfiguration(form: FormData) {
  await requireAuth();
  const page = text(form, "page", true);
  try {
    await imapmanFetch(configurationPath(form), { method: "DELETE" });
  } catch (error) { redirect(`/?page=${page}&error=${encodeURIComponent(error instanceof Error ? error.message : "Unbekannter Fehler")}`); }
  done(page);
}

function configurationPath(form: FormData) {
  const kind = text(form, "kind", true);
  const left = integer(form, "left_id");
  const right = integer(form, "right_id");
  if (kind === "mailbox") return `/mailboxes/${left}/distributor/${right}`;
  if (kind === "recipient") return `/distributors/${left}/lists/${right}`;
  if (kind === "sender") return `/distributors/${left}/sender-lists/${right}`;
  throw new Error("Unbekannter Verknüpfungstyp.");
}
