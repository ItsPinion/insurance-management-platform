/**
 * Schema drift check — the Day 2 deliverable.
 *
 * Reads `server/prisma/schema.prisma` and asserts that the connected
 * PostgreSQL database really has the tables, columns, types, nullability,
 * enums, unique constraints, foreign keys and indexes the schema describes.
 * A migration that was never applied (or a column that drifted) fails here
 * instead of surfacing as a runtime error later.
 *
 * Usage:
 *   cd server && npm test        # runs together with the API suite
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createPrismaClient } from '../src/lib/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(__dirname, '..', 'prisma', 'schema.prisma');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// --- schema.prisma parser --------------------------------------------------

const SCALAR_TYPES = {
  Int: 'int4',
  String: 'text',
  Boolean: 'bool',
  DateTime: 'timestamp',
  Decimal: 'numeric',
  Float: 'float8',
  Json: 'jsonb',
  BigInt: 'int8',
};

function parseSchema(source) {
  const enums = {};
  for (const m of source.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
    enums[m[1]] = m[2]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'))
      .map((l) => l.split(/\s+/)[0]);
  }

  const models = {};
  for (const m of source.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const name = m[1];
    const fields = [];
    const indexes = [];
    const uniques = [];
    const relations = [];

    for (const raw of m[2].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;

      if (line.startsWith('@@index')) {
        indexes.push(line.match(/\[([^\]]*)\]/)[1].split(',').map((c) => c.trim()));
        continue;
      }
      if (line.startsWith('@@unique')) {
        const cols = line.match(/\[([^\]]*)\]/);
        uniques.push(cols ? cols[1].split(',').map((c) => c.trim()) : ['@single']);
        continue;
      }
      if (line.startsWith('@@')) continue;

      const fm = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/);
      if (!fm) continue;
      const [, field, type, isList, optional, rest] = fm;

      // a relation field is not a column — the column is the foreign key
      if (enums[type] || SCALAR_TYPES[type]) {
        fields.push({
          name: field,
          type,
          optional: Boolean(optional),
          unique: /@unique/.test(rest),
          hasDefault: /@default\(/.test(rest),
          autoincrement: /autoincrement\(\)/.test(rest),
        });
        continue;
      }

      const rel = rest.match(/@relation\([^)]*fields:\s*\[([^\]]*)\][^)]*references:\s*\[([^\]]*)\]/);
      if (rel) {
        relations.push({
          field,
          model: type,
          from: rel[1].split(',').map((c) => c.trim()),
          to: rel[2].split(',').map((c) => c.trim()),
        });
      }
    }

    models[name] = { name, fields, indexes, uniques, relations };
  }

  return { enums, models };
}

// --- database introspection ------------------------------------------------

let prisma;

before(async () => {
  prisma = createPrismaClient();
  await prisma.$queryRawUnsafe('SELECT 1');
});

after(async () => {
  await prisma?.$disconnect();
});

const columns = async () =>
  prisma.$queryRawUnsafe(
    `SELECT table_name::text, column_name::text, udt_name::text,
            is_nullable::text, column_default::text
       FROM information_schema.columns
      WHERE table_schema = 'public'`,
  );

const constraints = async () =>
  prisma.$queryRawUnsafe(
    `SELECT tc.table_name::text, tc.constraint_type::text, kcu.column_name::text,
            ccu.table_name::text AS ref_table, ccu.column_name::text AS ref_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
       LEFT JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public'`,
  );

const indexList = async () =>
  prisma.$queryRawUnsafe(
    `SELECT tablename::text, indexname::text, indexdef::text
       FROM pg_indexes WHERE schemaname = 'public'`,
  );

const enumValues = async () =>
  prisma.$queryRawUnsafe(
    `SELECT t.typname::text AS name, e.enumlabel::text AS value, e.enumsortorder::int AS position
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder`,
  );

// --- the checks ------------------------------------------------------------

const schema = parseSchema(fs.readFileSync(SCHEMA_PATH, 'utf8'));

test('every model of the Prisma schema exists as a table', async () => {
  const rows = await columns();
  const tables = new Set(rows.map((r) => r.table_name));
  for (const model of Object.values(schema.models)) {
    assert.ok(tables.has(model.name), `table "${model.name}" is missing`);
  }
});

test('every column matches the schema (type, nullability, default)', async () => {
  const rows = await columns();
  for (const model of Object.values(schema.models)) {
    const actual = rows.filter((r) => r.table_name === model.name);
    const actualNames = actual.map((r) => r.column_name).sort();

    const expectedNames = model.fields.map((f) => f.name).sort();
    assert.deepEqual(
      actualNames,
      expectedNames,
      `${model.name}: the table columns do not match the schema`,
    );

    for (const field of model.fields) {
      const col = actual.find((r) => r.column_name === field.name);
      const expectedType = schema.enums[field.type] ? field.type : SCALAR_TYPES[field.type];
      assert.ok(
        expectedType,
        `${model.name}.${field.name}: unknown Prisma type "${field.type}"`,
      );
      assert.equal(
        col.udt_name,
        expectedType,
        `${model.name}.${field.name}: expected ${expectedType}, found ${col.udt_name}`,
      );
      assert.equal(
        col.is_nullable,
        field.optional ? 'YES' : 'NO',
        `${model.name}.${field.name}: nullability does not match the schema`,
      );
      if (field.hasDefault || field.autoincrement) {
        assert.ok(
          col.column_default !== null,
          `${model.name}.${field.name}: expected a default value`,
        );
      } else {
        assert.equal(
          col.column_default,
          null,
          `${model.name}.${field.name}: unexpected default value`,
        );
      }
    }
  }
});

test('every enum of the Prisma schema exists with the same values', async () => {
  const rows = await enumValues();
  for (const [name, values] of Object.entries(schema.enums)) {
    const actual = rows.filter((r) => r.name === name).map((r) => r.value);
    assert.deepEqual(actual, values, `enum "${name}" does not match the schema`);
  }
});

test('every unique field has a unique constraint', async () => {
  // PostgreSQL (and therefore Prisma) implements @unique as a unique index
  const rows = await indexList();
  for (const model of Object.values(schema.models)) {
    for (const field of model.fields.filter((f) => f.unique)) {
      const found = rows.some((r) => {
        if (r.tablename !== model.name) return false;
        if (!/CREATE UNIQUE INDEX/i.test(r.indexdef)) return false;
        const cols = (r.indexdef.match(/\(([^)]*)\)/)?.[1] || '')
          .split(',')
          .map((c) => c.trim().replace(/"/g, ''));
        return cols.length === 1 && cols[0] === field.name;
      });
      assert.ok(found, `${model.name}.${field.name}: missing unique constraint`);
    }
  }
});

test('every relation has a foreign key to the referenced table', async () => {
  const rows = await constraints();
  for (const model of Object.values(schema.models)) {
    for (const rel of model.relations) {
      for (let i = 0; i < rel.from.length; i += 1) {
        const found = rows.some(
          (r) =>
            r.table_name === model.name &&
            r.constraint_type === 'FOREIGN KEY' &&
            r.column_name === rel.from[i] &&
            r.ref_table === rel.model &&
            r.ref_column === rel.to[i],
        );
        assert.ok(
          found,
          `${model.name}.${rel.from[i]} → ${rel.model}.${rel.to[i]}: missing foreign key`,
        );
      }
    }
  }
});

test('every @@index of the Prisma schema exists in the database', async () => {
  const rows = await indexList();
  for (const model of Object.values(schema.models)) {
    for (const cols of model.indexes) {
      const found = rows.some((r) => {
        if (r.tablename !== model.name) return false;
        const defined = (r.indexdef.match(/\(([^)]*)\)/)?.[1] || '')
          .split(',')
          .map((c) => c.trim().replace(/"/g, ''));
        return cols.every((c, i) => defined[i] === c);
      });
      assert.ok(found, `${model.name}: missing index on (${cols.join(', ')})`);
    }
  }
});

test('the migration history is recorded', async () => {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT migration_name::text, finished_at FROM _prisma_migrations ORDER BY started_at`,
  );
  assert.ok(rows.length > 0, 'no migration has been applied');
  for (const row of rows) {
    assert.ok(row.finished_at, `migration "${row.migration_name}" did not finish`);
  }
});
