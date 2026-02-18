import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, '..', 'prisma', 'dev.db'));

console.log('=== COMPROBACIÓN DE DUPLICADOS ===\n');

const total = db.prepare('SELECT COUNT(*) as cnt FROM "Transaction"').get();
console.log(`Total transacciones: ${total.cnt}\n`);

// 1. Duplicados por externalId
const extDups = db.prepare(`
  SELECT externalId, COUNT(*) as cnt
  FROM "Transaction"
  WHERE externalId IS NOT NULL
  GROUP BY externalId
  HAVING COUNT(*) > 1
`).all();

console.log('--- Duplicados por externalId ---');
if (extDups.length === 0) {
  console.log('✓ Ninguno (protegido por constraint unique)\n');
} else {
  extDups.forEach(r => console.log(`  ${r.externalId}: ${r.cnt} veces`));
  console.log();
}

// 2. Posibles duplicados: misma fecha + importe
const dateDups = db.prepare(`
  SELECT date(date) as d, amount, COUNT(*) as cnt, GROUP_CONCAT(id, ', ') as ids
  FROM "Transaction"
  WHERE isArchived = 0
  GROUP BY date(date), amount
  HAVING COUNT(*) > 1
  ORDER BY cnt DESC
`).all();

console.log('--- Misma fecha + importe ---');
if (dateDups.length === 0) {
  console.log('✓ Ninguno\n');
} else {
  console.log(`${dateDups.length} grupos:\n`);
  dateDups.forEach(r => {
    console.log(`  Fecha: ${r.d} | ${r.amount}€ | ${r.cnt} tx | IDs: ${r.ids}`);
  });
  console.log();
}

// 3. Duplicados exactos: fecha + importe + concepto
const exactDups = db.prepare(`
  SELECT date(date) as d, amount, concept, COUNT(*) as cnt, GROUP_CONCAT(id, ', ') as ids
  FROM "Transaction"
  WHERE isArchived = 0
  GROUP BY date(date), amount, LOWER(TRIM(concept))
  HAVING COUNT(*) > 1
  ORDER BY cnt DESC
`).all();

console.log('--- Duplicados exactos (fecha + importe + concepto) ---');
if (exactDups.length === 0) {
  console.log('✓ Ninguno\n');
} else {
  console.log(`${exactDups.length} grupos:\n`);
  exactDups.forEach(r => {
    console.log(`  Fecha: ${r.d} | ${r.amount}€ | "${r.concept.slice(0, 60)}" | IDs: ${r.ids}`);
  });
}

db.close();
