"use client";

import { useActionState } from "react";
import { previewDataSource, testDataSource, type DataSourceToolState } from "./actions";
import { FilterFields } from "./filter-fields";
import type { DataSource, JSONValue, MailingList } from "@/lib/types";

const initialState: DataSourceToolState = {};

export function DataSourceTools({ sources }: { sources: DataSource[] }) {
  const [testState, testAction, testing] = useActionState(testDataSource, initialState);
  const [previewState, previewAction, previewing] = useActionState(previewDataSource, initialState);
  return <section className="data-source-tools">
    <h2>Datenquelle prüfen</h2>
    <form action={testAction} className="tool-form">
      <label>Datenquelle<select name="data_source_id" required defaultValue=""><option value="" disabled>Auswählen</option>{sources.map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
      <button type="submit" disabled={testing || !sources.length}>{testing ? "Teste ..." : "Verbindung testen"}</button>
    </form>
    {testState.message && <p className="notice success">{testState.message}</p>}
    {testState.error && <p className="notice error">{testState.error}</p>}
    <form action={previewAction} className="preview-form">
      <h2>Tabellenvorschau</h2>
      <p className="hint">Zeigt passende und durch den Filter ausgeschlossene Datensätze getrennt an.</p>
      <label>Datenquelle<select name="data_source_id" required defaultValue=""><option value="" disabled>Auswählen</option>{sources.map((source) => <option value={source.id} key={source.id}>{source.name}</option>)}</select></label>
      <label>Empfängertabelle<input name="recipient_table" required /></label>
      <label>E-Mail-Spalte<input name="email_column" required /></label>
      <label>Namensspalte (optional)<input name="name_column" /></label>
      <label>Limit je Gruppe<input name="limit" type="number" min="1" max="1000" defaultValue="20" /></label>
      <FilterFields />
      <button type="submit" disabled={previewing || !sources.length}>{previewing ? "Lade ..." : "Vorschau laden"}</button>
    </form>
    {previewState.error && <p className="notice error">{previewState.error}</p>}
    {previewState.preview && <PreviewTables matching={previewState.preview.matching} nonMatching={previewState.preview.non_matching} limit={previewState.preview.limit} />}
  </section>;
}

export function SavedListPreview({ list }: { list: MailingList }) {
  const [previewState, previewAction, previewing] = useActionState(previewDataSource, initialState);
  const conditions = list.filter ?? [];
  return <div className="saved-list-preview">
    <h3>Gespeicherter Filter</h3>
    {conditions.length ? <table className="filter-summary"><thead><tr><th>Spalte</th><th>Operator</th><th>Wert</th></tr></thead><tbody>{conditions.map((condition, index) => <tr key={`${condition.column}-${index}`}><td>{condition.column}</td><td>{condition.op}</td><td>{String(condition.value)}</td></tr>)}</tbody></table> : <p className="hint">Kein Filter hinterlegt. Alle Datensätze werden berücksichtigt.</p>}
    <form action={previewAction} className="saved-list-preview-form">
      <input type="hidden" name="data_source_id" value={list.datasource_id ?? ""} />
      <input type="hidden" name="recipient_table" value={list.recipient_table ?? ""} />
      <input type="hidden" name="email_column" value={list.email_column ?? ""} />
      <input type="hidden" name="name_column" value={list.name_column ?? ""} />
      {conditions.map((condition, index) => <span key={`hidden-${condition.column}-${index}`}><input type="hidden" name="filter_column" value={condition.column} /><input type="hidden" name="filter_op" value={condition.op} /><input type="hidden" name="filter_value" value={String(condition.value)} /></span>)}
      <label>Limit je Gruppe<input name="limit" type="number" min="1" max="1000" defaultValue="20" /></label>
      <button type="submit" disabled={previewing}>{previewing ? "Lade ..." : "Filtervorschau laden"}</button>
    </form>
    {previewState.error && <p className="notice error">{previewState.error}</p>}
    {previewState.preview && <PreviewTables matching={previewState.preview.matching} nonMatching={previewState.preview.non_matching} limit={previewState.preview.limit} />}
  </div>;
}

function PreviewTables({ matching, nonMatching, limit }: { matching: Record<string, JSONValue>[]; nonMatching: Record<string, JSONValue>[]; limit: number }) {
  return <div className="preview-results"><p className="hint">Je Gruppe werden maximal {limit} Einträge angezeigt.</p><PreviewTable title="Entspricht dem Filter" rows={matching} /><PreviewTable title="Ausgefiltert" rows={nonMatching} /></div>;
}

function PreviewTable({ title, rows }: { title: string; rows: Record<string, JSONValue>[] }) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return <div><h3>{title}</h3>{rows.length ? <table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{formatValue(row[column])}</td>)}</tr>)}</tbody></table> : <p className="hint">Keine Einträge.</p>}</div>;
}

function formatValue(value: JSONValue | undefined) {
  if (value === undefined || value === null) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
