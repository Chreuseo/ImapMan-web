# ImapMan-web

Dockerisiertes Next.js-Verwaltungsfrontend für ImapMan. Es kommuniziert
ausschließlich serverseitig mit der ImapMan-API; das API-Secret und DSNs werden
nicht an den Browser ausgeliefert.

## Starten

```sh
cp .env.example .env
# IMAPMAN_API_URL und IMAPMAN_API_SECRET passend zum Go-Dienst setzen
docker compose up --build
```

Die Anwendung ist anschließend unter `http://localhost:3000` erreichbar.

Das Frontend sendet Anfragen an die ImapMan-API mit
`Authorization: Bearer <IMAPMAN_API_SECRET>`.

## Authentifizierung

`FRONTEND_AUTH_MODE` in `.env` steuert den Zugriff:

| Wert | Verhalten | Erforderliche Variablen |
|---|---|---|
| `none` | Keine Frontend-Authentifizierung; geeignet hinter Intranet/Reverse Proxy. | - |
| `basic` | HTTP Basic Auth im Browser. | `FRONTEND_BASIC_AUTH_USERNAME`, `FRONTEND_BASIC_AUTH_PASSWORD` |
| `oidc` | Keycloak über OIDC Authorization Code Flow. | `FRONTEND_SESSION_SECRET`, `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, optional `OIDC_CLIENT_SECRET`, `OIDC_REQUIRED_ROLE` |

Für Keycloak muss als gültige Redirect-URI
`https://<frontend-host>/auth/callback` beim Client hinterlegt sein. Der Wert
kann in `.env` über `OIDC_REDIRECT_URI` fest definiert werden; ohne Angabe
fällt die App auf die aktuelle Request-URL zurück. Der Keycloak-Issuer ist die
Realm-URL, z. B. `https://keycloak.example.org/realms/imapman`.
`FRONTEND_SESSION_SECRET` muss ein zufälliger, stabiler Wert mit mindestens 32
Byte sein.

Mit `OIDC_REQUIRED_ROLE` kann eine erforderliche Keycloak-Rolle festgelegt
werden. Die Anwendung akzeptiert sowohl Realm-Rollen als auch Client-Rollen
des unter `OIDC_CLIENT_ID` konfigurierten Clients. Die Rollen werden aus ID-
und Access-Token zusammengeführt und in der signierten Frontend-Session
gespeichert. Bleibt die Variable leer, erhalten alle erfolgreich angemeldeten
Keycloak-Benutzer Zugriff.

# ImapMan

ImapMan ist ein containerisierter Go-Dienst, der IMAP-Postfächer abholt und
deren Mails per SMTP an die verbundenen Mailinglisten weiterleitet. Ein
Postfach ist genau einem Verteiler zugeordnet; ein Verteiler kann mehrere
Listen enthalten.

## Starten

```sh
cp .env.example .env
# Werte in .env setzen, insbesondere IMAPMAN_API_SECRET.
docker compose -f docker-compose.example.yml up --build
```

Die Verwaltungs-API liegt unter `http://localhost:8080/api/v1`, der
OpenAPI-3-Vertrag unter `/openapi.yaml`. `/swagger` leitet zum Swagger Editor
mit diesem Vertrag weiter.

Die Architektur-, Verknuepfungs- und API-Grundlage fuer das separate
Next.js-Frontend steht in [docs/nextjs-frontend.md](docs/nextjs-frontend.md).

Die eigene ImapMan-Datenbank ist MariaDB; sie wird beim Start anhand von
`db/schema.sql` automatisch angelegt. Die zentrale Konfiguration ist eine
`.env`-Datei, die Docker mit `env_file` direkt an den Container übergibt. Sie
enthält HTTP, MariaDB, Polling und optional die
zentrale SMTP-Konfiguration. Die IMAP-Zugangsdaten liegen je Postfach in der
Verwaltungs-API. Ein Postfach kann mit vollständigen SMTP-Angaben den
zentralen Versand überschreiben. Passwörter werden beim Anlegen direkt an die
Verwaltungs-API übertragen und bei späteren Abrufen nicht zurückgegeben.

## API-Authentifizierung

Die Next.js-Verwaltungsanwendung muss jede Anfrage an `/api/v1` mit dem in
`.env` gesetzten Secret senden:

```http
Authorization: Bearer <IMAPMAN_API_SECRET>
```

`IMAPMAN_API_SECRET` wird beim Start zwingend verlangt. Für einen neuen Wert:

```sh
openssl rand -hex 32
```

## Empfängerquellen

`static`-Listen enthalten Mitglieder direkt in `mailing_list_members`.
`database`-Listen referenzieren eine separat angelegte Datenquelle
(`postgres`, `mysql` oder `sqlite`) sowie Tabelle und E-Mail-Spalte. Bei
ostgreSQL und MySQL kann die DSN `{username}` und `{password}` enthalten;
die Werte kommen aus `username` beziehungsweise der per `password_env`
referenzierten Umgebungsvariable. Die API gibt DSNs niemals zurück.

`filter` ist ein JSON-Array aus Bedingungen, etwa:

```json
[{"column":"enabled","op":"=","value":true}]
```

Tabellen- und Spaltennamen werden strikt validiert, Operatoren sind auf
Vergleiche und `LIKE` beschränkt und alle Werte werden als SQL-Parameter
gebunden.

Einzelne statische Mitglieder werden über `POST /api/v1/lists/{listID}/members`
angelegt und mit `DELETE /api/v1/lists/{listID}/members/{memberID}` entfernt.
Alle angelegten Hauptressourcen und Zuordnungen bieten ebenfalls passende
`DELETE`-Routen; Details stehen im OpenAPI-Vertrag.

## Absenderautorisierung

Jeder Verteiler hat eine `sender_policy`: `allow_all`, `whitelist`,
`blacklist` oder `members_only`. Bei Whitelist und Blacklist verknüpft
`PUT /api/v1/distributors/{distributorID}/sender-lists/{listID}` eine oder
mehrere statische oder datenbankgestützte Absenderlisten. `members_only`
prüft den Absender gegen die Listen, an die der Verteiler verteilt.

## Versand-Gruppierung

`delivery` in `config.yaml` definiert globale Standardwerte für `batch_size`,
`use_bcc`, `to_header` (`from` oder `undisclosed`) und `delay_between`.
Jede Mailingliste kann diese Werte mit dem `delivery`-Objekt der Listen-API
vollständig überschreiben; `delay_seconds` ist dort die Pause zwischen zwei
SMTP-Nachrichten. Bei `use_bcc: true` gehen bis zu `batch_size` Empfänger in
einem Envelope-Batch. Bei `false` wird einzeln versendet. Echte Zieladressen
werden immer nur dem SMTP-Envelope übergeben, nicht in `To`, `Cc` oder `Bcc`.