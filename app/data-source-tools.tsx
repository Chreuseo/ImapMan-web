"use client";

import { useActionState } from "react";
import { previewDataSource, testDataSource, type DataSourceToolState } from "./actions";
import { FilterFields } from "./filter-fields";
import type { DataSource, JSONValue } from "@/lib/types";

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
