/**
 * A stand-in for Neon's SQL-over-HTTP gateway, so the `DB_DRIVER=neon` code path
 * can be exercised without a network route to Neon.
 *
 * The protocol is small: the driver POSTs `{ queries: [{ sql, params }] }` to the
 * endpoint and reads back `{ results: [{ command, rowCount, fields, rows }] }`,
 * where every value is in PostgreSQL's *text* format (a failed statement answers
 * HTTP 400 with `{ message, code }`). That matters: over HTTP, Postgres types are
 * parsed by the driver from the OID in `fields`, numbers arrive as text, and
 * `bigint` (which `count()` returns) stays a string. This helper implements the
 * protocol and forwards each statement to a real PostgreSQL server, so the HTTP
 * path and the socket path can be pointed at identical data and compared.
 *
 * Usage (programmatic):
 *
 *   const proxy = await startNeonHttpProxy({ target: process.env.DATABASE_URL });
 *   process.env.NEON_FETCH_ENDPOINT = proxy.endpoint;   // → http://127.0.0.1:PORT/sql
 *   ...
 *   await proxy.stop();
 *
 * Usage (as a process, e.g. to run the API itself over the HTTP driver):
 *
 *   node tests/helpers/neon-http-proxy.mjs --port 5433 --target "postgresql://…"
 */
import http from 'node:http';
import { Pool } from 'pg';

/** Render a JS value the way Postgres would send it in text format. */
function toText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? 't' : 'f';
  if (value instanceof Date) {
    // A `timestamp without time zone` is the wall clock the server sent, so the
    // calendar fields are read back as they were parsed (never as UTC).
    const pad = (n, size = 2) => String(n).padStart(size, '0');
    return (
      `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ` +
      `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${pad(
        value.getMilliseconds(),
        3,
      )}`
    );
  }
  if (Buffer.isBuffer(value)) return `\\x${value.toString('hex')}`;
  // `json`/`jsonb` values are the only composite types this schema uses (the
  // relational queries build them with `json_build_array`), and on the wire they are
  // JSON text — not the `{…}` form PostgreSQL uses for real arrays.
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export async function startNeonHttpProxy({ target, port = 0 }) {
  const pool = new Pool({ connectionString: target, options: '-c timezone=UTC', max: 4 });
  const statements = [];

  const server = http.createServer(async (req, res) => {
    let payload;
    try {
      payload = await readBody(req);
    } catch {
      payload = {};
    }
    // A single statement arrives as `{ query, params }`; a batch (a transaction, or
    // `sql([...])`) as `{ queries: [{ sql, params }, …] }` — and the answer to a
    // batch is wrapped in `results`, while a single statement is answered flat.
    const batched = Array.isArray(payload.queries);
    const queries = batched ? payload.queries : [{ sql: payload.query, params: payload.params }];

    const results = [];
    for (const item of queries) {
      const text = item.sql ?? item.query;
      statements.push({ sql: text, params: item.params ?? [] });
      try {
        // `rowMode: 'array'` keeps duplicate column names apart, exactly as the
        // proxy's text protocol does; the driver re-attaches the names from `fields`.
        const result = await pool.query({
          text: text,
          values: item.params ?? [],
          rowMode: 'array',
        });
        results.push({
          command: result.command ?? '',
          rowCount: result.rowCount ?? 0,
          fields: (result.fields ?? []).map((field) => ({
            name: field.name,
            tableID: field.tableID ?? 0,
            columnID: field.columnID ?? 0,
            dataTypeID: field.dataTypeID,
            dataTypeSize: field.dataTypeIDSize ?? -1,
            dataTypeModifier: field.dataTypeModifier ?? -1,
            format: 'text',
          })),
          rows: (result.rows ?? []).map((row) => row.map(toText)),
        });
      } catch (err) {
        // The gateway answers a failed statement with HTTP 400 and the fields of
        // the PostgreSQL error, which the driver re-throws as `NeonDbError`.
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            message: err.message,
            severity: err.severity ?? 'ERROR',
            code: err.code ?? 'XX000',
            detail: err.detail,
            hint: err.hint,
          }),
        );
        return;
      }
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(batched ? { results } : results[0]));
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();

  return {
    endpoint: `http://127.0.0.1:${address.port}/sql`,
    /** Every statement the proxy forwarded — asserted by the driver test. */
    statements,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}

// --- CLI ------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith('neon-http-proxy.mjs')) {
  await import('dotenv/config'); // so --target may be left out in favour of server/.env
  const arg = (name) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const proxy = await startNeonHttpProxy({
    target: arg('target') ?? process.env.DATABASE_URL,
    port: Number(arg('port') ?? 0),
  });
  console.log(`Neon HTTP gateway mock listening on ${proxy.endpoint}`);
  console.log(`Forwarding to ${arg('target') ?? process.env.DATABASE_URL}`);
}
