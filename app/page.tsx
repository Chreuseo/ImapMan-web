import Link from "next/link";
import { createDataSource, createDistributor, createList, createMailbox, createMember, linkConfiguration, unlinkConfiguration } from "./actions";
import { DeleteButton } from "./delete-button";
import { FilterFields } from "./filter-fields";
import { imapmanFetch } from "@/lib/imapman";
import type { DataSource, Distributor, MailingList, Mailbox, Member, ProcessedMessage } from "@/lib/types";

type Page = "dashboard" | "mailboxes" | "distributors" | "lists" | "data-sources" | "status";
const navigation: { id: Page; label: string }[] = [
  { id: "dashboard", label: "Übersicht" }, { id: "mailboxes", label: "Postfächer" },
  { id: "distributors", label: "Verteiler" }, { id: "lists", label: "Mailinglisten" },
  { id: "data-sources", label: "Datenquellen" }, { id: "status", label: "Verarbeitungsstatus" },
];
const Field = ({ name, label, type = "text", required = false, placeholder }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string }) =>
  <label>{label}<input name={name} type={type} required={required} placeholder={placeholder} /></label>;

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const page = navigation.some((entry) => entry.id === params.page) ? params.page as Page : "dashboard";
  let data: [Mailbox[], Distributor[], MailingList[], DataSource[], ProcessedMessage[]] | undefined;
  let loadError: string | undefined;
  try {
    const result = await Promise.all([
      imapmanFetch<Mailbox[] | null>("/mailboxes"), imapmanFetch<Distributor[] | null>("/distributors"),
      imapmanFetch<MailingList[] | null>("/lists"), imapmanFetch<DataSource[] | null>("/data-sources"),
      imapmanFetch<ProcessedMessage[] | null>("/processed-messages"),
    ]);
    data = [result[0] ?? [], result[1] ?? [], result[2] ?? [], result[3] ?? [], result[4] ?? []];
  } catch (error) { loadError = error instanceof Error ? error.message : "Die API ist nicht erreichbar."; }
  const [mailboxes = [], distributors = [], lists = [], sources = [], messages = []] = data ?? [];
  const selectedListId = Number(params.listId);
  const selectedList = lists.find((list) => list.id === selectedListId && list.list_type === "static");
  let members: Member[] = [];
  let mailboxAssignments: Record<number, Distributor | null> = {};
  let targetListAssignments: Record<number, MailingList[]> = {};
  let senderListAssignments: Record<number, MailingList[]> = {};
  if (selectedList) {
    try {
      members = await imapmanFetch<Member[] | null>(`/lists/${selectedList.id}/members`) ?? [];
    } catch (error) { loadError = error instanceof Error ? error.message : "Mitglieder konnten nicht geladen werden."; }
  }
  if (page === "mailboxes") {
    try {
      const assignments = await Promise.all(mailboxes.map(async (mailbox) => [mailbox.id, await imapmanFetch<Distributor | null>(`/mailboxes/${mailbox.id}/distributor`)] as const));
      mailboxAssignments = Object.fromEntries(assignments);
    } catch (error) { loadError = error instanceof Error ? error.message : "Postfachzuordnungen konnten nicht geladen werden."; }
  }
  if (page === "distributors") {
    try {
      const assignments = await Promise.all(distributors.map(async (distributor) => {
        const [targets, senders] = await Promise.all([
          imapmanFetch<MailingList[] | null>(`/distributors/${distributor.id}/lists`),
          imapmanFetch<MailingList[] | null>(`/distributors/${distributor.id}/sender-lists`),
        ]);
        return [distributor.id, targets ?? [], senders ?? []] as const;
      }));
      targetListAssignments = Object.fromEntries(assignments.map(([id, targets]) => [id, targets]));
      senderListAssignments = Object.fromEntries(assignments.map(([id, , senders]) => [id, senders]));
    } catch (error) { loadError = error instanceof Error ? error.message : "Verteilerzuordnungen konnten nicht geladen werden."; }
  }
  const flash = params.error ? { type: "error", message: params.error } : params.success ? { type: "success", message: params.success } : undefined;

  return <div className="shell">
    <aside>
      <div className="brand"><span>IM</span><div><strong>ImapMan</strong><small>Verwaltung</small></div></div>
      <nav>{navigation.map((entry) => <Link className={page === entry.id ? "active" : ""} href={`/?page=${entry.id}`} key={entry.id}>{entry.label}</Link>)}</nav>
      <p className="sidebar-note">Zugangsdaten werden ausschließlich für die jeweilige API-Anfrage übertragen.</p>
    </aside>
    <main>
      <header><div><p className="eyebrow">IMAPMAN KONFIGURATION</p><h1>{navigation.find((entry) => entry.id === page)?.label}</h1></div><span className="connection">● API verbunden</span></header>
      {flash && <p className={`notice ${flash.type}`}>{flash.message}</p>}
      {loadError ? <section className="notice error"><strong>Backend nicht verfügbar:</strong> {loadError}<br />Prüfen Sie IMAPMAN_API_URL, IMAPMAN_API_SECRET und die Erreichbarkeit des Dienstes.</section> :
        <Content page={page} mailboxes={mailboxes} distributors={distributors} lists={lists} sources={sources} messages={messages} selectedList={selectedList} members={members} mailboxAssignments={mailboxAssignments} targetListAssignments={targetListAssignments} senderListAssignments={senderListAssignments} />}
    </main>
  </div>;
}

function Content({ page, mailboxes, distributors, lists, sources, messages, selectedList, members, mailboxAssignments, targetListAssignments, senderListAssignments }: { page: Page; mailboxes: Mailbox[]; distributors: Distributor[]; lists: MailingList[]; sources: DataSource[]; messages: ProcessedMessage[]; selectedList?: MailingList; members: Member[]; mailboxAssignments: Record<number, Distributor | null>; targetListAssignments: Record<number, MailingList[]>; senderListAssignments: Record<number, MailingList[]> }) {
  if (page === "dashboard") return <><div className="metrics">
    <Metric label="Postfächer" value={mailboxes.length} /><Metric label="Verteiler" value={distributors.length} />
    <Metric label="Mailinglisten" value={lists.length} /><Metric label="Fehlgeschlagen" value={messages.filter((item) => item.status === "failed").length} warning />
  </div><section><h2>Letzte Verarbeitung</h2><MessageTable messages={messages.slice(0, 10)} /></section></>;
  if (page === "mailboxes") return <div className="split"><section><h2>Neues Postfach</h2><form action={createMailbox} className="form-grid">
    <Field name="name" label="Bezeichnung" required /><Field name="imap_host" label="IMAP-Host" required placeholder="imap.example.org" />
    <Field name="imap_port" label="IMAP-Port" type="number" placeholder="993" /><Field name="imap_username" label="IMAP-Benutzer" required />
    <Field name="imap_password" label="IMAP-Passwort" type="password" required /><Field name="imap_folder" label="Ordner" required placeholder="INBOX" />
    <label className="checkbox"><input name="imap_mark_seen" type="checkbox" defaultChecked /> Nach erfolgreicher Verarbeitung als gelesen markieren</label>
    <h3>Eigener SMTP-Transport <small>(optional, vollständig ausfüllen)</small></h3>
    <Field name="smtp_host" label="SMTP-Host" /><Field name="smtp_port" label="SMTP-Port" type="number" />
    <Field name="smtp_username" label="SMTP-Benutzer" /><Field name="smtp_password" label="SMTP-Passwort" type="password" />
    <Field name="smtp_from" label="Absenderadresse" type="email" /><label>SMTP-TLS-Modus (optional)<select name="smtp_tls_mode" defaultValue=""><option value="">Globalen Standard verwenden</option><option value="starttls">STARTTLS</option><option value="implicit_tls">Implizites TLS (SSL)</option><option value="plain">Ohne TLS</option></select></label><button type="submit">Postfach anlegen</button>
  </form><LinkForm title="Verteiler zuweisen" kind="mailbox" leftLabel="Postfach" rightLabel="Verteiler" left={mailboxes} right={distributors} /><LinkForm title="Zuordnung entfernen" kind="mailbox" leftLabel="Postfach" rightLabel="Verteiler" left={mailboxes} right={distributors} operation="unlink" /></section><div><Table title="Vorhandene Postfächer" rows={mailboxes} columns={["name", "imap_host", "imap_folder"]} page="mailboxes" path={(item) => `/mailboxes/${item.id}`} /><AssignmentTable title="Postfach-Zuordnungen" rows={mailboxes.map((mailbox) => ({ name: mailbox.name, assignments: mailboxAssignments[mailbox.id] ? [mailboxAssignments[mailbox.id]!.name] : [] }))} /></div></div>;
  if (page === "distributors") return <div className="split"><section><h2>Neuer Verteiler</h2><form action={createDistributor}>
    <Field name="name" label="Bezeichnung" required /><label>Absenderpolitik<select name="sender_policy" defaultValue="allow_all"><option value="allow_all">Alle Absender zulassen</option><option value="whitelist">Nur Senderlisten zulassen</option><option value="blacklist">Senderlisten sperren</option><option value="members_only">Nur Mitglieder der Ziellisten</option></select></label>
    <button type="submit">Verteiler anlegen</button>
  </form><LinkForm title="Zielliste verknüpfen" kind="recipient" leftLabel="Verteiler" rightLabel="Mailingliste" left={distributors} right={lists} /><LinkForm title="Ziellisten-Zuordnung entfernen" kind="recipient" leftLabel="Verteiler" rightLabel="Mailingliste" left={distributors} right={lists} operation="unlink" /><LinkForm title="Senderliste verknüpfen" kind="sender" leftLabel="Verteiler" rightLabel="Senderliste" left={distributors} right={lists} /><LinkForm title="Senderlisten-Zuordnung entfernen" kind="sender" leftLabel="Verteiler" rightLabel="Senderliste" left={distributors} right={lists} operation="unlink" /><p className="hint">Für Whitelist und Blacklist mindestens eine Senderliste verknüpfen. Bei members_only gelten die Ziellisten als erlaubte Absender.</p></section><div><Table title="Vorhandene Verteiler" rows={distributors} columns={["name", "sender_policy"]} page="distributors" path={(item) => `/distributors/${item.id}`} /><AssignmentTable title="Ziel-Mailinglisten" rows={distributors.map((distributor) => ({ name: distributor.name, assignments: (targetListAssignments[distributor.id] ?? []).map((list) => list.name) }))} /><AssignmentTable title="Sender-Mailinglisten" rows={distributors.map((distributor) => ({ name: distributor.name, assignments: (senderListAssignments[distributor.id] ?? []).map((list) => list.name) }))} /></div></div>;
  if (page === "lists") return <div className="split"><section><h2>Neue Mailingliste</h2><form action={createList}>
    <Field name="name" label="Bezeichnung" required /><label>Listentyp<select name="list_type" defaultValue="static"><option value="static">Statische Liste</option><option value="database">Datenbankliste</option></select></label>
    <h3>Datenbankliste <small>(nur für Typ Datenbank)</small></h3><label>Datenquelle<select name="datasource_id" defaultValue=""><option value="">Auswählen</option>{sources.map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
    <Field name="recipient_table" label="Empfängertabelle" /><Field name="email_column" label="E-Mail-Spalte" /><Field name="name_column" label="Namensspalte (optional)" /><FilterFields /><button type="submit">Liste anlegen</button>
  </form><MemberForm lists={lists} /></section><div><Table title="Vorhandene Listen" rows={lists} columns={["name", "list_type", "recipient_table"]} page="lists" path={(item) => `/lists/${item.id}`} /><section className="member-section"><h2>Statische Mitglieder</h2><form action="/" className="list-selector"><input type="hidden" name="page" value="lists" /><label>Liste auswählen<select defaultValue={selectedList?.id ?? ""} name="listId"><option value="">Auswählen</option>{lists.filter((list) => list.list_type === "static").map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></label><button type="submit">Anzeigen</button></form>{selectedList ? <MemberTable list={selectedList} members={members} /> : <p className="hint">Wählen Sie eine statische Liste aus.</p>}</section></div></div>;
  if (page === "data-sources") return <div className="split"><section><h2>Neue Datenquelle</h2><form action={createDataSource}>
    <Field name="name" label="Bezeichnung" required /><label>Treiber<select name="driver" defaultValue="postgres"><option value="postgres">PostgreSQL</option><option value="mysql">MySQL</option><option value="sqlite">SQLite</option></select></label>
    <Field name="dsn" label="DSN" required placeholder="postgres://host/database" /><Field name="username" label="Benutzer (optional)" /><Field name="password" label="Passwort (optional)" type="password" /><button type="submit">Datenquelle anlegen</button>
  </form><p className="hint">Die DSN wird nach dem Anlegen nicht mehr angezeigt.</p></section><Table title="Vorhandene Datenquellen" rows={sources} columns={["name", "driver", "username"]} page="data-sources" path={(item) => `/data-sources/${item.id}`} /></div>;
  return <section><h2>Verarbeitungsstatus</h2><MessageTable messages={messages} /></section>;
}

function Metric({ label, value, warning }: { label: string; value: number; warning?: boolean }) { return <article className={warning ? "metric warning" : "metric"}><span>{label}</span><strong>{value}</strong></article>; }
function MemberForm({ lists }: { lists: MailingList[] }) { const staticLists = lists.filter((list) => list.list_type === "static"); return <form action={createMember} className="link-form"><h3>Mitglied hinzufügen</h3><label>Statische Liste<select name="list_id" required defaultValue=""><option value="" disabled>Auswählen</option>{staticLists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}</select></label><Field name="name" label="Name" required /><Field name="email" label="E-Mail-Adresse" type="email" required /><label className="checkbox"><input name="receives_mail" type="checkbox" defaultChecked /> Empfängt Verteiler-Mails</label><button type="submit" disabled={!staticLists.length}>Mitglied anlegen</button></form>; }
function MemberTable({ list, members }: { list: MailingList; members: Member[] }) { return <><p className="hint">Mitglieder von <strong>{list.name}</strong></p><table><thead><tr><th>Name</th><th>E-Mail</th><th>Empfängt</th><th /></tr></thead><tbody>{members.length ? members.map((member) => <tr key={member.id}><td>{member.name}</td><td>{member.email}</td><td>{member.receives_mail ? "Ja" : "Nein"}</td><td><DeleteButton path={`/lists/${list.id}/members/${member.id}`} page="lists" name={member.email} /></td></tr>) : <tr><td colSpan={4}>Keine Mitglieder vorhanden.</td></tr>}</tbody></table></>; }
function AssignmentTable({ title, rows }: { title: string; rows: { name: string; assignments: string[] }[] }) { return <section className="assignment-table"><h2>{title}</h2><table><thead><tr><th>Objekt</th><th>Zuordnung</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.assignments.length ? row.assignments.join(", ") : "Keine Zuordnung"}</td></tr>)}</tbody></table></section>; }
function LinkForm<L extends { id: number; name: string }, R extends { id: number; name: string }>({ title, kind, leftLabel, rightLabel, left, right, operation = "link" }: { title: string; kind: "mailbox" | "recipient" | "sender"; leftLabel: string; rightLabel: string; left: L[]; right: R[]; operation?: "link" | "unlink" }) { return <form action={operation === "link" ? linkConfiguration : unlinkConfiguration} className="link-form"><h3>{title}</h3><input type="hidden" name="page" value={kind === "mailbox" ? "mailboxes" : "distributors"} /><input type="hidden" name="kind" value={kind} /><label>{leftLabel}<select name="left_id" required defaultValue=""><option value="" disabled>Auswählen</option>{left.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>{rightLabel}<select name="right_id" required defaultValue=""><option value="" disabled>Auswählen</option>{right.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className={operation === "unlink" ? "danger-button" : ""} type="submit">{operation === "unlink" ? "Verknüpfung entfernen" : "Verknüpfen"}</button></form>; }
function MessageTable({ messages }: { messages: ProcessedMessage[] }) { return <table><thead><tr><th>ID</th><th>Status</th><th>Postfach</th><th>Zeitpunkt</th><th>Hinweis</th></tr></thead><tbody>{messages.length ? messages.map((item) => <tr key={item.id}><td>{item.id}</td><td><span className={`badge ${item.status}`}>{item.status}</span></td><td>{item.mailbox_id ?? "—"}</td><td>{item.processed_at ? new Date(item.processed_at).toLocaleString("de-DE") : "—"}</td><td>{item.error ?? "—"}</td></tr>) : <tr><td colSpan={5}>Noch keine Nachrichten verarbeitet.</td></tr>}</tbody></table>; }
function Table<T extends { id: number; name: string }>({ title, rows, columns, page, path }: { title: string; rows: T[]; columns: (keyof T)[]; page: string; path: (item: T) => string }) { return <section><h2>{title}</h2><table><thead><tr>{columns.map((column) => <th key={String(column)}>{String(column).replaceAll("_", " ")}</th>)}<th /></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={String(column)}>{String(row[column] ?? "—")}</td>)}<td className="actions">{page === "lists" && "list_type" in row && row.list_type === "static" && <Link href={`/?page=lists&listId=${row.id}`}>Mitglieder</Link>}<DeleteButton path={path(row)} page={page} name={row.name} /></td></tr>) : <tr><td colSpan={columns.length + 1}>Keine Einträge vorhanden.</td></tr>}</tbody></table></section>; }
