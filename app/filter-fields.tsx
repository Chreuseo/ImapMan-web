"use client";

import { useState } from "react";

const operators = ["=", "!=", "<", "<=", ">", ">=", "LIKE", "NOT LIKE"] as const;
type FilterRow = { id: number; column: string; op: typeof operators[number]; value: string };

export function FilterFields() {
  const [rows, setRows] = useState<FilterRow[]>([]);
  const update = (id: number, key: keyof Omit<FilterRow, "id">, value: string) =>
    setRows((current) => current.map((row) => row.id === id ? { ...row, [key]: value } : row));

  return <fieldset className="filter-fields">
    <legend>Filterbedingungen <small>(optional)</small></legend>
    <p>Mehrere Bedingungen werden mit UND verknüpft.</p>
    {rows.map((row) => <div className="filter-row" key={row.id}>
      <input aria-label="Spalte" name="filter_column" value={row.column} onChange={(event) => update(row.id, "column", event.target.value)} placeholder="Spalte" />
      <select aria-label="Operator" name="filter_op" value={row.op} onChange={(event) => update(row.id, "op", event.target.value)}>
        {operators.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
      </select>
      <input aria-label="Wert" name="filter_value" value={row.value} onChange={(event) => update(row.id, "value", event.target.value)} placeholder="Wert" />
      <button className="danger" type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>Entfernen</button>
    </div>)}
    <button className="secondary" type="button" onClick={() => setRows((current) => [...current, { id: Date.now(), column: "", op: "=", value: "" }])}>Bedingung hinzufügen</button>
  </fieldset>;
}
