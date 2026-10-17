import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set — copy server/.env.example to server/.env and fill it in.',
  );
}

// drizzle-kit always speaks the PostgreSQL wire protocol (never Neon's HTTP proxy),
// so it needs a host that accepts a TLS socket. Neon's pooled endpoint does, and
// `sslmode=require` is how node-postgres is told to use it — added here so a URL
// pasted without it still connects instead of hanging on a plain-TCP handshake.
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
