"use client";

import { deleteResource } from "./actions";

export function DeleteButton({ path, page, name }: { path: string; page: string; name: string }) {
  return <form action={deleteResource} onSubmit={(event) => { if (!window.confirm(`„${name}“ wirklich löschen? Zugehörige Zuordnungen können ebenfalls entfernt werden.`)) event.preventDefault(); }}>
    <input type="hidden" name="path" value={path} /><input type="hidden" name="page" value={page} />
    <button className="danger" type="submit">Löschen</button>
  </form>;
}
