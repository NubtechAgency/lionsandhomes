// Servicio de control de presupuesto OCR — tracking y enforcement robusto
import prisma from '../lib/prisma';

// Budget por defecto: $10/mes = 1000 centavos
const DEFAULT_BUDGET_CENTS = 1000;

function getBudgetCents(): number {
  const envValue = process.env.OCR_MONTHLY_BUDGET_CENTS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_BUDGET_CENTS;
}

// ============================================================
// MUTEX ROBUSTO — Serializa todas las llamadas OCR
// Garantiza que es IMPOSIBLE exceder el budget con requests
// concurrentes. Solo una llamada OCR se ejecuta a la vez.
// ============================================================
let ocrMutex: Promise<void> = Promise.resolve();

/**
 * Ejecuta una funcion bajo el mutex OCR.
 * Solo 1 operacion OCR puede ejecutarse simultaneamente en todo el servidor.
 * Esto previene race conditions en el check de budget.
 */
export async function withOcrMutex<T>(fn: () => Promise<T>): Promise<T> {
  let resolve: () => void;
  const nextMutex = new Promise<void>((r) => { resolve = r; });

  // Esperar a que termine la operacion anterior
  const previousMutex = ocrMutex;
  ocrMutex = nextMutex;

  try {
    await previousMutex;
    return await fn();
  } finally {
    resolve!();
  }
}

export interface BudgetStatus {
  allowed: boolean;
  spentCents: number;
  budgetCents: number;
  remainingCents: number;
}

/**
 * Obtiene el total gastado en OCR este mes calendario.
 */
export async function getMonthlySpentCents(): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await prisma.ocrUsage.aggregate({
    where: { createdAt: { gte: startOfMonth } },
    _sum: { costCents: true },
  });

  return result._sum.costCents || 0;
}

/**
 * Comprueba si el budget permite una llamada OCR.
 * DEBE llamarse dentro del mutex para ser atomico.
 */
export async function checkBudget(): Promise<BudgetStatus> {
  const budgetCents = getBudgetCents();
  const spentCents = await getMonthlySpentCents();
  const remainingCents = Math.max(budgetCents - spentCents, 0);

  return {
    allowed: spentCents < budgetCents,
    spentCents,
    budgetCents,
    remainingCents,
  };
}

/**
 * Registra el uso de una llamada OCR.
 * DEBE llamarse dentro del mutex, despues de la llamada OCR exitosa.
 */
export async function recordUsage(params: {
  invoiceId: number;
  userId: number;
  tokensInput: number;
  tokensOutput: number;
  costCents: number;
  model: string;
}): Promise<void> {
  await prisma.ocrUsage.create({
    data: {
      invoiceId: params.invoiceId,
      userId: params.userId,
      tokensInput: params.tokensInput,
      tokensOutput: params.tokensOutput,
      costCents: params.costCents,
      model: params.model,
    },
  });
}

export interface UsageSummary {
  spentCents: number;
  budgetCents: number;
  remainingCents: number;
  callCount: number;
  avgCostCents: number;
  month: string; // "2026-02"
}

/**
 * Resumen de uso OCR del mes actual para el endpoint admin.
 */
export async function getUsageSummary(): Promise<UsageSummary> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const budgetCents = getBudgetCents();

  const [aggregate, count] = await Promise.all([
    prisma.ocrUsage.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { costCents: true },
    }),
    prisma.ocrUsage.count({
      where: { createdAt: { gte: startOfMonth } },
    }),
  ]);

  const spentCents = aggregate._sum.costCents || 0;
  const remainingCents = Math.max(budgetCents - spentCents, 0);
  const avgCostCents = count > 0 ? Math.round(spentCents / count) : 0;

  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return {
    spentCents,
    budgetCents,
    remainingCents,
    callCount: count,
    avgCostCents,
    month,
  };
}
