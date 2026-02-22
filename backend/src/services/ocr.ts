// Servicio OCR — Extraccion de datos de facturas via Claude Vision API
import Anthropic from '@anthropic-ai/sdk';

export interface OcrResult {
  amount: number | null;
  date: string | null;         // ISO date string YYYY-MM-DD
  vendor: string | null;
  invoiceNumber: string | null;
  tokensInput: number;
  tokensOutput: number;
  rawResponse: string;
}

// Inicializar cliente Anthropic (lee ANTHROPIC_API_KEY del env)
let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY no configurada');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// Modelo configurable via env var
function getModel(): string {
  return process.env.OCR_MODEL || 'claude-sonnet-4-20250514';
}

// Prompt fijo server-side (no manipulable por usuario)
const OCR_PROMPT = `Analiza esta factura y extrae los siguientes datos. Responde UNICAMENTE con JSON valido, sin texto adicional:

{
  "amount": <numero total de la factura en euros, sin IVA si es posible distinguirlo, o el total con IVA. Usar punto como separador decimal. null si no se puede determinar>,
  "date": "<fecha de emision en formato YYYY-MM-DD. null si no se puede determinar>",
  "vendor": "<nombre del proveedor/empresa que emite la factura. Maximo 500 caracteres. null si no se puede determinar>",
  "invoiceNumber": "<numero de factura. Maximo 200 caracteres. null si no se puede determinar>"
}

Reglas:
- Si un campo no se puede determinar con certeza, usa null
- El importe debe ser un numero positivo (sin signo negativo)
- La fecha debe estar en formato ISO YYYY-MM-DD
- No incluyas explicaciones, solo el JSON`;

/**
 * Extrae datos de una factura usando Claude Vision API.
 * Soporta PDF (tipo document) e imagenes (tipo image).
 */
export async function extractInvoiceData(
  fileBuffer: Buffer,
  mimeType: string,
  _fileName: string
): Promise<OcrResult> {
  const client = getClient();
  const base64Data = fileBuffer.toString('base64');

  // Construir content block segun tipo de archivo
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  if (mimeType === 'application/pdf') {
    contentBlocks.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: base64Data,
      },
    } as any); // Claude SDK puede no tener el tipo document tipado aun
  } else {
    // Imagenes: JPEG, PNG, WebP
    const imageMediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageMediaType,
        data: base64Data,
      },
    });
  }

  contentBlocks.push({
    type: 'text',
    text: OCR_PROMPT,
  });

  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: contentBlocks,
      },
    ],
  });

  // Extraer texto de la respuesta
  const textBlock = response.content.find(b => b.type === 'text');
  const rawText = textBlock && 'text' in textBlock ? textBlock.text : '';

  // Parsear JSON de la respuesta con validacion estricta
  let parsed: { amount?: number | null; date?: string | null; vendor?: string | null; invoiceNumber?: string | null };
  try {
    // Extraer JSON del texto (puede tener backticks o texto extra)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Si no se puede parsear, devolver todo null con el raw para debug
    return {
      amount: null,
      date: null,
      vendor: null,
      invoiceNumber: null,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      rawResponse: rawText,
    };
  }

  // Validar y sanitizar cada campo
  const amount = typeof parsed.amount === 'number' && parsed.amount > 0
    ? Math.round(parsed.amount * 100) / 100
    : null;

  const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
    ? parsed.date
    : null;

  const vendor = typeof parsed.vendor === 'string' && parsed.vendor.length > 0
    ? parsed.vendor.slice(0, 500).trim()
    : null;

  const invoiceNumber = typeof parsed.invoiceNumber === 'string' && parsed.invoiceNumber.length > 0
    ? parsed.invoiceNumber.slice(0, 200).trim()
    : null;

  return {
    amount,
    date,
    vendor,
    invoiceNumber,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    rawResponse: rawText,
  };
}

/**
 * Estima el coste en centavos de una llamada OCR.
 * Precios Claude Sonnet: $3/1M input, $15/1M output.
 * Devuelve entero (Math.ceil) para evitar precision de floats.
 */
export function estimateCostCents(tokensInput: number, tokensOutput: number): number {
  const inputCostCents = (tokensInput / 1_000_000) * 300;
  const outputCostCents = (tokensOutput / 1_000_000) * 1500;
  return Math.ceil(inputCostCents + outputCostCents);
}
