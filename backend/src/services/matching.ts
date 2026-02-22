// Servicio de matching — empareja facturas OCR con transacciones existentes
import prisma from '../lib/prisma';

export interface MatchSuggestion {
  transactionId: number;
  score: number;
  scoreBreakdown: {
    amountScore: number;
    dateScore: number;
    conceptScore: number;
  };
  transaction: {
    id: number;
    date: string;
    amount: number;
    concept: string;
    hasInvoice: boolean;
    projectId: number | null;
    project: { id: number; name: string } | null;
  };
}

/**
 * Busca transacciones que coincidan con los datos OCR de una factura.
 * Devuelve las top N sugerencias ordenadas por score descendente.
 *
 * Scoring (0-100):
 * - Importe: 40 puntos max
 * - Fecha: 30 puntos max
 * - Concepto/vendor: 30 puntos max
 */
export async function findMatches(
  ocrAmount: number | null,
  ocrDate: Date | null,
  ocrVendor: string | null,
  limit: number = 5
): Promise<MatchSuggestion[]> {
  // Si no tenemos ni importe ni fecha, no podemos emparejar
  if (ocrAmount === null && ocrDate === null) return [];

  // Construir filtro amplio para candidatos
  const where: any = {
    amount: { lt: 0 },         // Solo gastos
    isArchived: false,
  };

  // Filtro de fecha: ±30 dias del ocrDate
  if (ocrDate) {
    const dateFrom = new Date(ocrDate);
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateTo = new Date(ocrDate);
    dateTo.setDate(dateTo.getDate() + 30);
    where.date = { gte: dateFrom, lte: dateTo };
  }

  // Filtro de importe: ±50% del ocrAmount (amplio para no perder candidatos)
  if (ocrAmount !== null) {
    const absAmount = Math.abs(ocrAmount);
    where.amount = {
      ...where.amount,
      gte: -(absAmount * 1.5),
      lte: -(absAmount * 0.5),
    };
  }

  // Buscar candidatos (max 200 para limitar carga)
  const candidates = await prisma.transaction.findMany({
    where,
    take: 200,
    orderBy: { date: 'desc' },
    select: {
      id: true,
      date: true,
      amount: true,
      concept: true,
      hasInvoice: true,
      projectId: true,
      project: { select: { id: true, name: true } },
    },
  });

  if (candidates.length === 0) return [];

  // Calcular score para cada candidato
  const scored = candidates.map(tx => {
    const amountScore = scoreAmount(ocrAmount, tx.amount);
    const dateScore = scoreDate(ocrDate, tx.date);
    const conceptScore = scoreConcept(ocrVendor, tx.concept);
    const totalScore = amountScore + dateScore + conceptScore;

    return {
      transactionId: tx.id,
      score: Math.round(totalScore),
      scoreBreakdown: {
        amountScore: Math.round(amountScore),
        dateScore: Math.round(dateScore),
        conceptScore: Math.round(conceptScore),
      },
      transaction: {
        id: tx.id,
        date: tx.date.toISOString(),
        amount: tx.amount,
        concept: tx.concept,
        hasInvoice: tx.hasInvoice,
        projectId: tx.projectId,
        project: tx.project,
      },
    };
  });

  // Filtrar score > 20 (minimo para ser relevante), ordenar desc, top N
  return scored
    .filter(s => s.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ============================================================
// FUNCIONES DE SCORING
// ============================================================

/**
 * Score de importe (0-40 puntos).
 * Match exacto = 40, tolerancia lineal hasta ±20%.
 */
function scoreAmount(ocrAmount: number | null, txAmount: number): number {
  if (ocrAmount === null) return 0;

  const absTx = Math.abs(txAmount);
  const absOcr = Math.abs(ocrAmount);

  if (absOcr === 0 || absTx === 0) return 0;

  const diff = Math.abs(absTx - absOcr);
  const pct = diff / absOcr;

  if (pct <= 0.005) return 40;  // Match casi exacto (<0.5%)
  if (pct <= 0.02) return 38;   // Diferencia minima (redondeos)
  if (pct <= 0.05) return 34;   // ±5%
  if (pct <= 0.10) return 28;   // ±10%
  if (pct <= 0.20) return 20;   // ±20%
  if (pct <= 0.50) return 8;    // ±50% (muy bajo pero incluido)
  return 0;
}

/**
 * Score de fecha (0-30 puntos).
 * Mismo dia = 30, decae con la distancia.
 */
function scoreDate(ocrDate: Date | null, txDate: Date): number {
  if (ocrDate === null) return 0;

  const diffMs = Math.abs(ocrDate.getTime() - txDate.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 0.5) return 30;   // Mismo dia
  if (diffDays <= 1.5) return 27;   // ±1 dia
  if (diffDays <= 2.5) return 24;   // ±2 dias
  if (diffDays <= 3.5) return 20;   // ±3 dias
  if (diffDays <= 7) return 15;     // ±1 semana
  if (diffDays <= 14) return 8;     // ±2 semanas
  if (diffDays <= 30) return 3;     // ±1 mes
  return 0;
}

/**
 * Score de concepto/vendor (0-30 puntos).
 * Substring match = 30, overlap de palabras proporcional.
 * Comparacion case-insensitive en JS (compatible con SQLite dev).
 */
function scoreConcept(ocrVendor: string | null, txConcept: string): number {
  if (!ocrVendor || ocrVendor.length === 0) return 0;

  const vendor = normalize(ocrVendor);
  const concept = normalize(txConcept);

  if (vendor.length === 0 || concept.length === 0) return 0;

  // Substring match directo (alta confianza)
  if (concept.includes(vendor) || vendor.includes(concept)) return 30;

  // Overlap de palabras (Jaccard similarity)
  const vendorWords = new Set(vendor.split(/\s+/).filter(w => w.length > 2));
  const conceptWords = new Set(concept.split(/\s+/).filter(w => w.length > 2));

  if (vendorWords.size === 0 || conceptWords.size === 0) return 0;

  let intersection = 0;
  for (const word of vendorWords) {
    if (conceptWords.has(word)) intersection++;
  }

  if (intersection === 0) return 0;

  const union = new Set([...vendorWords, ...conceptWords]).size;
  const jaccard = intersection / union;

  return Math.round(jaccard * 30);
}

/**
 * Normaliza texto para comparacion: lowercase, sin tildes, sin chars especiales.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ')     // Replace special chars with space
    .replace(/\s+/g, ' ')             // Collapse whitespace
    .trim();
}
