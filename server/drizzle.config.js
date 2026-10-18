import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set — copy server/.env.example to server/.env and fill it in.',
  );
}

// The API talks to Neon over HTTPS, but drizzle-kit opens its own PostgreSQL
// wire-protocol socket — and `sslmode=require` is what tells it to use TLS for
// that. Neon's pooled endpoint accepts it, so the flag is appended here when a
// pasted URL left it out, instead of the tool hanging on a plain-TCP handshake.
const isNeon = /\.neon\.(tech|ai)(:\d+)?\//.test(DATABASE_URL);
const url =
  isNeon && !/[?&]sslmode=/.test(DATABASE_URL)
    ? `${DATABASE_URL}${DATABASE_URL.includes('?') ? '&' : '?'}sslmode=require`
    : DATABASE_URL;

export default defineConfig({
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
