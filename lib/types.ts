export type SenderPolicy = "allow_all" | "whitelist" | "blacklist" | "members_only";

export type Mailbox = {
  id: number; name: string; imap_host: string; imap_port: number; imap_username: string;
  imap_password?: string; imap_folder: string; imap_mark_seen: boolean;
  smtp_host?: string; smtp_port?: number; smtp_username?: string; smtp_password?: string; smtp_from?: string;
  smtp_tls_mode?: "starttls" | "implicit_tls" | "plain";
};

export type Distributor = { id: number; name: string; sender_policy: SenderPolicy };
export type DataSource = { id: number; name: string; driver: "postgres" | "mysql" | "sqlite"; username?: string; password?: string };
export type Condition = { column: string; op: "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE" | "NOT LIKE"; value: string | number | boolean };
export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };
export type DataSourcePreviewResponse = { matching: Record<string, JSONValue>[]; non_matching: Record<string, JSONValue>[]; limit: number };
export type MailingList = {
  id: number; name: string; list_type: "static" | "database"; datasource_id?: number;
  recipient_table?: string; email_column?: string; name_column?: string; filter?: Condition[];
};
export type Member = { id: number; mailing_list_id: number; name: string; email: string; receives_mail: boolean; member_since: string };
export type ProcessedMessage = { id: number; status: "processing" | "sent" | "failed" | "rejected"; mailbox_id?: number; error?: string; processed_at?: string };
