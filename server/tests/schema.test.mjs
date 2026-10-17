/**
 * Schema drift check — the Day 2 deliverable.
 *
 * Reads the Drizzle schema (`src/db/schema.js`) and asserts that the connected
 * PostgreSQL database really has the tables, columns, types, nullability,
 * defaults, enums, unique constraints, foreign keys and indexes it describes.
 * A migration that was never applied (or a column that drifted) fails here
 * instead of surfacing as a runtime error later. The last check replays the
 * logic of `drizzle-kit`: every migration in `drizzle/meta/_journal.json` must
 * be recorded in `drizzle.__drizzle_migrations` with a matching file hash.
 *
 * Usage:
 *   cd server && npm test        # runs together with the API suite
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getTableConfig, isPgEnum, PgTable } from 'drizzle-orm/pg-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(SERVER_ROOT, 'drizzle');

dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

// The Drizzle schema is plain JavaScript, so the expectation is derived from
// the very object the application queries with — nothing to re-parse.
const schemaModule = await import('../src/db/schema.js');
const { pool } = await import('../src/db/index.js');

const tables = Object.values(schemaModule).filter((value) => value instanceof PgTable);
const enums = Object.values(schemaModule)
  .filter((value) => isPgEnum(value))
  .map((value) => ({ name: value.enumName, values: value.enumValues }));

assert.ok(tables.length > 0, 'no Drizzle tables were exported from src/db/schema.js');

// --- expectations ----------------------------------------------------------

const SCALAR_UDT = {
  serial: 'int4',
  bigserial: 'int8',
  smallserial: 'int2',
  integer: 'int4',
  smallint: 'int2',
  bigint: 'int8',
  text: 'text',
  boolean: 'bool',
  timestamp: 'timestamp',
  timestamptz: 'timestamptz',
  numeric: 'numeric',
  real: 'float4',
  double: 'float8',
  json: 'json',
  jsonb: 'jsonb',
  uuid: 'uuid',
  date: 'date',
};

/** `numeric(12, 2)` → `{ base: 'numeric', precision: 12, scale: 2 }` */
function parseSqlType(sqlType) {
  const base = sqlType.replace(/\s*\(.*\)$/, '').trim();
  const args = sqlType.match(/\(([^)]*)\)/)?.[1];
  return { base, args: args ? args.split(',').map((n) => Number(n.trim())) : [] };
}

const sql = {
  columns: `
    SELECT table_name::text, column_name::text, udt_name::text, data_type::text,
           is_nullable::text, character_maximum_length::int,
           numeric_precision::int, numeric_scale::int, datetime_precision::int,
           column_default::text
      FROM information_schema.columns
     WHERE table_schema = 'public'`,
  indexes: `
    SELECT tablename::text, indexname::text, indexdef::text
      FROM pg_indexes WHERE schemaname = 'public'`,
  constraints: `
    SELECT tc.table_name::text, tc.constraint_name::text, tc.constraint_type::text,
           kcu.column_name::text, ccu.table_name::text AS ref_table,
           ccu.column_name::text AS ref_column,
           rc.delete_rule::text, rc.update_rule::text
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      LEFT JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
     WHERE tc.table_schema = 'public'`,
  enums: `
    SELECT t.typname::text AS name, e.enumlabel::text AS value, e.enumsortorder::int AS position
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
     ORDER BY t.typname, e.enumsortorder`,
  migrations: `
    SELECT hash::text, created_at::text
      FROM drizzle.__drizzle_migrations`,
};

const query = async (key) => (await pool.query(sql[key])).rows;

let poolReady = false;

before(async () => {
  await pool.query('SELECT 1');
  poolReady = true;
});

after(async () => {
  if (poolReady) await pool.end();
});

const guard = (fn) => async () => {
  assert.ok(poolReady, 'the database must be reachable for the schema checks');
  return fn();
};

const stripCast = (value) => String(value).replace(/::[^:]*$/, '').replace(/^'|'$/g, '');

// --- the checks ------------------------------------------------------------

test('every table of the Drizzle schema exists in the database', guard(async () => {
  const rows = await query('columns');
  const found = new Set(rows.map((r) => r.table_name));
  for (const table of tables) {
    const { name } = getTableConfig(table);
    assert.ok(found.has(name), `table "${name}" is missing`);
  }
  const extra = [...rows.map((r) => r.table_name)]
    .filter((t) => !tables.some((table) => getTableConfig(table).name === t))
    .filter((t) => !t.startsWith('_drizzle') && !t.startsWith('drizzle'));
  assert.deepEqual(extra, [], 'the database has tables the schema does not describe');
}));

test('every column matches the schema (type, nullability, default)', guard(async () => {
  const rows = await query('columns');
  for (const table of tables) {
    const { name, columns } = getTableConfig(table);
    const actual = rows.filter((r) => r.table_name === name);
    const expected = columns.map((c) => c.name).sort();

    assert.deepEqual(
      [...actual.map((r) => r.column_name)].sort(),
      expected,
      `${name}: the table columns do not match the schema`,
    );

    for (const column of columns) {
      const col = actual.find((r) => r.column_name === column.name);
      const where = `${name}.${column.name}`;
      const { base, args } = parseSqlType(column.getSQLType());
      const expectedType = SCALAR_UDT[base] ?? base;

      assert.equal(
        col.udt_name,
        expectedType,
        `${where}: expected ${expectedType} (schema says "${column.getSQLType()}"), found ${col.udt_name}`,
      );
      assert.equal(
        col.is_nullable,
        column.notNull ? 'NO' : 'YES',
        `${where}: nullability does not match the schema`,
      );

      if (base === 'timestamp') {
        const zone = col.data_type === 'timestamp with time zone' ? 'with' : 'without';
        assert.equal(zone, 'without', `${where}: the schema does not use a time zone`);
        if (args.length) {
          assert.equal(col.datetime_precision, args[0], `${where}: timestamp precision drift`);
        }
      }
      if (base === 'numeric' && args.length === 2) {
        assert.equal(col.numeric_precision, args[0], `${where}: numeric precision drift`);
        assert.equal(col.numeric_scale, args[1], `${where}: numeric scale drift`);
      }

      if (column.hasDefault) {
        assert.ok(col.column_default !== null, `${where}: expected a default value`);
        const isSqlExpr = column.default && typeof column.default === 'object';
        if (isSqlExpr) {
          // defaultNow() — PostgreSQL accepts both spellings
          assert.match(
            col.column_default,
            /now\(\)|CURRENT_TIMESTAMP/i,
            `${where}: expected a now()/CURRENT_TIMESTAMP default`,
          );
        } else if (base === 'serial') {
          assert.match(col.column_default, /^nextval/i, `${where}: expected a sequence default`);
        } else {
          assert.equal(
            stripCast(col.column_default),
            String(column.default),
            `${where}: default value does not match the schema`,
          );
        }
      } else if (base !== 'serial') {
        assert.equal(col.column_default, null, `${where}: unexpected default value`);
      }
    }
  }
}));

test('the primary key of every table is its id column', guard(async () => {
  const rows = await query('constraints');
  for (const table of tables) {
    const { name, primaryKeys, columns } = getTableConfig(table);
    const fromSchema = primaryKeys.flatMap((pk) => pk.config?.value?.columns?.map((c) => c.name) ?? []);
    const expected = fromSchema.length
      ? fromSchema
      : columns.filter((c) => c.primary).map((c) => c.name);
    assert.deepEqual(
      expected,
      ['id'],
      `${name}: the schema does not declare an "id" primary key`,
    );
    const pk = rows.find((r) => r.table_name === name && r.constraint_type === 'PRIMARY KEY');
    assert.ok(pk, `${name}: missing primary key`);
    assert.equal(pk.column_name, 'id', `${name}: primary key must be "id"`);
  }
}));

test('every enum of the schema exists with the same values', guard(async () => {
  const rows = await query('enums');
  assert.ok(enums.length > 0, 'no Drizzle enums were exported from src/db/schema.js');
  for (const { name, values } of enums) {
    const actual = rows.filter((r) => r.name === name).map((r) => r.value);
    assert.deepEqual(actual, values, `enum "${name}" does not match the schema`);
  }
}));

test('every index and unique index of the schema exists with the same columns', guard(async () => {
  const rows = await query('indexes');
  const indexOf = (r) =>
    (r.indexdef.match(/\(([^)]*)\)/)?.[1] || '').split(',').map((c) => c.trim().replace(/"/g, ''));

  for (const table of tables) {
    const { name, indexes } = getTableConfig(table);
    for (const index of indexes) {
      const { name: indexName, columns, unique } = index.config;
      const expectedCols = columns.map((c) => c.name ?? c.column?.name);
      const found = rows.find((r) => r.tablename === name && r.indexname === indexName);
      assert.ok(found, `${name}: missing index "${indexName}"`);
      assert.deepEqual(
        indexOf(found),
        expectedCols,
        `${name}.${indexName}: the indexed columns do not match the schema`,
      );
      assert.equal(
        /CREATE UNIQUE INDEX/i.test(found.indexdef),
        Boolean(unique),
        `${name}.${indexName}: uniqueness does not match the schema`,
      );
    }
  }
}));

test('every foreign key points at the right table, column and delete rule', guard(async () => {
  const rows = await query('constraints');
  const getTableName = (table) => getTableConfig(table).name;

  for (const table of tables) {
    const { name, foreignKeys } = getTableConfig(table);
    for (const key of Object.values(foreignKeys)) {
      const ref = key.reference();
      const column = ref.columns[0].name;
      const refTable = getTableName(ref.foreignTable);
      const refColumn = ref.foreignColumns[0].name;
      const actual = rows.find(
        (r) =>
          r.table_name === name &&
          r.constraint_type === 'FOREIGN KEY' &&
          r.column_name === column,
      );
      assert.ok(
        actual,
        `${name}.${column} → ${refTable}.${refColumn}: missing foreign key`,
      );
      assert.equal(actual.ref_table, refTable, `${name}.${column}: wrong referenced table`);
      assert.equal(actual.ref_column, refColumn, `${name}.${column}: wrong referenced column`);
      assert.equal(
        actual.delete_rule.replace(/\s+/g, ' ').trim().toUpperCase(),
        (key.onDelete ?? 'NO ACTION').toUpperCase().replace(/-/g, ' '),
        `${name}.${column}: ON DELETE does not match the schema`,
      );
      assert.equal(
        actual.update_rule.replace(/\s+/g, ' ').trim().toUpperCase(),
        (key.onUpdate ?? 'NO ACTION').toUpperCase().replace(/-/g, ' '),
        `${name}.${column}: ON UPDATE does not match the schema`,
      );
    }
  }
}));

test('the applied migrations match the journal in drizzle/', guard(async () => {
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'));
  assert.ok(journal.entries.length > 0, 'drizzle/meta/_journal.json has no migrations');

  const applied = await query('migrations');
  const hashes = applied.map((r) => r.hash);

  for (const entry of journal.entries) {
    const file = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
    assert.ok(fs.existsSync(file), `migration file ${entry.tag}.sql is missing`);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8')).digest('hex');
    assert.ok(
      hashes.includes(hash),
      `migration "${entry.tag}" has not been applied to this database (npm run db:migrate)`,
    );
  }
  assert.equal(hashes.length, journal.entries.length, 'the migration history does not match the journal');
}));
