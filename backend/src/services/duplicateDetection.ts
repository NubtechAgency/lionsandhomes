import crypto from 'crypto';
import prisma from '../lib/prisma';

/**
 * Genera un ID de grupo determinista basado en importe + concepto.
 * No incluye la fecha porque la tolerancia ±1 día hace que la fecha no sea
 * determinista para agrupar. Se usa amount+concept como clave de grupo.
 */
export function computeDuplicateGroupId(amount: number, concept: string): string {
  const key = `${amount}|${concept.trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Recibe IDs de transacciones recién creadas, busca matches en BD por
 * fecha (±1 día) + importe + concepto (case-insensitive), y marca las
 * duplicadas con needsReview = true + duplicateGroupId.
 *
 * Retorna el número de transacciones flaggeadas.
 */
export async function flagDuplicatesForIds(transactionIds: number[]): Promise<number> {
  if (transactionIds.length === 0) return 0;

  // 1. Obtener datos de las transacciones nuevas
  const newTxns = await prisma.transaction.findMany({
    where: { id: { in: transactionIds } },
    select: { id: true, date: true, amount: true, concept: true },
  });

  if (newTxns.length === 0) return 0;

  // 2. Para cada nueva transacción, buscar matches existentes
  //    (fecha ±1 día + mismo importe + concepto normalizado, distinto ID, no archivada)
  let totalFlagged = 0;

  for (const txn of newTxns) {
    // Ventana de ±1 día
    const dateCenter = new Date(txn.date);
    dateCenter.setUTCHours(0, 0, 0, 0);
    const dateStart = new Date(dateCenter);
    dateStart.setUTCDate(dateStart.getUTCDate() - 1);
    const dateEnd = new Date(dateCenter);
    dateEnd.setUTCDate(dateEnd.getUTCDate() + 2); // +2 porque es exclusivo

    const matches = await prisma.transaction.findMany({
      where: {
        id: { not: txn.id },
        isArchived: false,
        date: { gte: dateStart, lt: dateEnd },
        amount: txn.amount,
        concept: { equals: txn.concept.trim(), mode: 'insensitive' },
      },
      select: { id: true, duplicateGroupId: true },
    });

    if (matches.length > 0) {
      // Reusar groupId existente si algún match ya tiene uno, si no generar nuevo
      const existingGroupId = matches.find(m => m.duplicateGroupId)?.duplicateGroupId;
      const groupId = existingGroupId || computeDuplicateGroupId(txn.amount, txn.concept);
      const allIds = [txn.id, ...matches.map(m => m.id)];

      // Marcar todas las del grupo (la nueva Y las existentes)
      const result = await prisma.transaction.updateMany({
        where: { id: { in: allIds } },
        data: { needsReview: true, duplicateGroupId: groupId },
      });

      totalFlagged += result.count;
    }
  }

  return totalFlagged;
}

/**
 * Escanea TODAS las transacciones no archivadas existentes y detecta duplicados
 * por contenido (±1 día + mismo importe + concepto case-insensitive).
 *
 * Eficiente: agrupa por amount+concept_normalizado en memoria, luego solo
 * compara fechas dentro de cada grupo (evita N queries individuales).
 *
 * Retorna stats del escaneo.
 */
export async function scanAllDuplicates(): Promise<{ scanned: number; flagged: number; groups: number }> {
  // 1. Obtener todas las transacciones no archivadas
  const allTxns = await prisma.transaction.findMany({
    where: { isArchived: false },
    select: { id: true, date: true, amount: true, concept: true },
    orderBy: { date: 'asc' },
  });

  // 2. Agrupar por amount + concept normalizado
  const groups = new Map<string, typeof allTxns>();
  for (const txn of allTxns) {
    const key = `${txn.amount}|${txn.concept.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(txn);
  }

  // 3. Dentro de cada grupo con >1 miembro, comprobar proximidad de fechas (±1 día)
  let totalFlagged = 0;
  let duplicateGroups = 0;
  const idsToFlag: { id: number; groupId: string }[] = [];

  for (const [, txns] of groups) {
    if (txns.length < 2) continue;

    // Encontrar clusters de fechas cercanas (±1 día) dentro del grupo
    const flaggedInGroup = new Set<number>();

    for (let i = 0; i < txns.length; i++) {
      for (let j = i + 1; j < txns.length; j++) {
        const dayDiff = Math.abs(
          new Date(txns[i].date).setUTCHours(0, 0, 0, 0) -
          new Date(txns[j].date).setUTCHours(0, 0, 0, 0)
        ) / (1000 * 60 * 60 * 24);

        if (dayDiff <= 1) {
          flaggedInGroup.add(txns[i].id);
          flaggedInGroup.add(txns[j].id);
        }
      }
    }

    if (flaggedInGroup.size > 0) {
      const groupId = computeDuplicateGroupId(txns[0].amount, txns[0].concept);
      for (const id of flaggedInGroup) {
        idsToFlag.push({ id, groupId });
      }
      duplicateGroups++;
    }
  }

  // 4. Batch update en grupos de 100
  for (let i = 0; i < idsToFlag.length; i += 100) {
    const batch = idsToFlag.slice(i, i + 100);
    // Agrupar por groupId para hacer un updateMany por grupo
    const byGroup = new Map<string, number[]>();
    for (const { id, groupId } of batch) {
      if (!byGroup.has(groupId)) byGroup.set(groupId, []);
      byGroup.get(groupId)!.push(id);
    }
    for (const [groupId, ids] of byGroup) {
      await prisma.transaction.updateMany({
        where: { id: { in: ids } },
        data: { needsReview: true, duplicateGroupId: groupId },
      });
    }
  }

  totalFlagged = idsToFlag.length;

  return { scanned: allTxns.length, flagged: totalFlagged, groups: duplicateGroups };
}
