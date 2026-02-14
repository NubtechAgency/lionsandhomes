const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  // 1. Crear 3 proyectos
  const p1 = await prisma.project.create({
    data: {
      name: 'Reforma Ático Gran Vía 45',
      description: 'Reforma integral de ático de lujo en Gran Vía',
      status: 'ACTIVE',
      totalBudget: 85000,
      categoryBudgets: JSON.stringify({ MATERIAL_Y_MANO_DE_OBRA: 40000, DECORACION: 25000, COMPRA_Y_GASTOS: 15000, OTROS: 5000 }),
      startDate: new Date('2025-09-01'),
    }
  });

  const p2 = await prisma.project.create({
    data: {
      name: 'Apartamento Paseo de Gracia 12',
      description: 'Renovación completa de apartamento céntrico',
      status: 'ACTIVE',
      totalBudget: 62000,
      categoryBudgets: JSON.stringify({ MATERIAL_Y_MANO_DE_OBRA: 30000, DECORACION: 18000, COMPRA_Y_GASTOS: 10000, OTROS: 4000 }),
      startDate: new Date('2025-11-15'),
    }
  });

  const p3 = await prisma.project.create({
    data: {
      name: 'Local Comercial Diagonal',
      description: 'Adecuación de local comercial',
      status: 'ACTIVE',
      totalBudget: 45000,
      categoryBudgets: JSON.stringify({ MATERIAL_Y_MANO_DE_OBRA: 22000, DECORACION: 12000, COMPRA_Y_GASTOS: 8000, OTROS: 3000 }),
      startDate: new Date('2026-01-10'),
    }
  });

  console.log('Proyectos creados:', p1.id, p2.id, p3.id);

  // 2. Crear 20 transacciones de gasto diversas
  const transactions = [
    { date: '2025-10-05', amount: -3200, concept: 'Materiales construcción - Leroy Merlin', category: 'Compras', projectId: p1.id, expenseCategory: 'MATERIAL_Y_MANO_DE_OBRA', hasInvoice: true, invoiceFileName: 'factura_leroy_oct.pdf' },
    { date: '2025-10-18', amount: -1850, concept: 'Albañilería - Reformas García S.L.', category: 'Servicios', projectId: p1.id, expenseCategory: 'MATERIAL_Y_MANO_DE_OBRA', hasInvoice: true, invoiceFileName: 'factura_garcia.pdf' },
    { date: '2025-11-02', amount: -4500, concept: 'Instalación eléctrica completa', category: 'Servicios', projectId: p1.id, expenseCategory: 'MATERIAL_Y_MANO_DE_OBRA', hasInvoice: false },
    { date: '2025-11-20', amount: -2100, concept: 'Muebles cocina - IKEA', category: 'Compras', projectId: p1.id, expenseCategory: 'DECORACION', hasInvoice: true, invoiceFileName: 'ikea_cocina.pdf' },
    { date: '2025-12-03', amount: -890, concept: 'Pintura y materiales acabados', category: 'Compras', projectId: p1.id, expenseCategory: 'MATERIAL_Y_MANO_DE_OBRA', hasInvoice: false },
    { date: '2025-12-15', amount: -3750, concept: 'Sofá y mobiliario salón - Kenay Home', category: 'Compras', projectId: p1.id, expenseCategory: 'DECORACION', hasInvoice: true, invoiceFileName: 'kenay_sofa.pdf' },
    { date: '2025-12-28', amount: -1200, concept: 'Notaría - Gastos escritura', category: 'Servicios', projectId: p1.id, expenseCategory: 'COMPRA_Y_GASTOS', hasInvoice: true, invoiceFileName: 'notaria_dic.pdf' },
    { date: '2026-01-08', amount: -5600, concept: 'Fontanería baño completo - Roca', category: 'Servicios', projectId: p2.id, expenseCategory: 'MATERIAL_Y_MANO_DE_OBRA', hasInvoice: true, invoiceFileName: 'roca_bano.pdf' },
    { date: '2026-01-15', amount: -2800, concept: 'Suelo porcelánico - Porcelanosa', category: 'Compras', projectId: p2.id, expenseCategory: 'MATERIAL_Y_MANO_DE_OBRA', hasInvoice: false },
    { date: '2026-01-22', amount: -1450, concept: 'Lámparas y iluminación LED', category: 'Compras', projectId: p2.id, expenseCategory: 'DECORACION', hasInvoice: true, invoiceFileName: 'lamparas_led.pdf' },
    { date: '2026-01-28', amount: -950, concept: 'Transporte materiales', category: 'Servicios', projectId: p2.id, expenseCategory: 'OTROS', hasInvoice: false },
    { date: '2026-02-01', amount: -6200, concept: 'Carpintería a medida puertas', category: 'Servicios', projectId: p2.id, expenseCategory: 'DECORACION', hasInvoice: true, invoiceFileName: 'carpinteria_puertas.pdf' },
    { date: '2026-02-03', amount: -1800, concept: 'Gestoría fiscal trimestral', category: 'Servicios', projectId: null, expenseCategory: 'GENERAL', hasInvoice: true, invoiceFileName: 'gestoria_q1.pdf' },
    { date: '2026-02-05', amount: -3400, concept: 'Climatización - Daikin', category: 'Compras', projectId: p3.id, expenseCategory: 'MATERIAL_Y_MANO_DE_OBRA', hasInvoice: false },
    { date: '2026-02-06', amount: -720, concept: 'Seguros responsabilidad civil', category: 'Servicios', projectId: null, expenseCategory: 'GENERAL', hasInvoice: true, invoiceFileName: 'seguro_rc.pdf' },
    { date: '2026-02-07', amount: -2350, concept: 'Escaparate cristal templado', category: 'Compras', projectId: p3.id, expenseCategory: 'MATERIAL_Y_MANO_DE_OBRA', hasInvoice: true, invoiceFileName: 'cristal_escaparate.pdf' },
    { date: '2026-02-08', amount: -1100, concept: 'Cortinas y textiles - Zara Home', category: 'Compras', projectId: p1.id, expenseCategory: 'DECORACION', hasInvoice: false },
    { date: '2026-02-09', amount: -4200, concept: 'Mano de obra albañil semana 6', category: 'Servicios', projectId: p3.id, expenseCategory: 'MATERIAL_Y_MANO_DE_OBRA', hasInvoice: true, invoiceFileName: 'albanil_sem6.pdf' },
    { date: '2026-02-10', amount: -580, concept: 'Material oficina y papelería', category: 'Compras', projectId: null, expenseCategory: 'OTROS', hasInvoice: false },
    { date: '2026-02-11', amount: -1650, concept: 'Electrodomésticos - MediaMarkt', category: 'Compras', projectId: p2.id, expenseCategory: 'COMPRA_Y_GASTOS', hasInvoice: true, invoiceFileName: 'mediamarkt_electro.pdf' },
  ];

  for (const tx of transactions) {
    await prisma.transaction.create({
      data: {
        externalId: null,
        isManual: true,
        date: new Date(tx.date),
        amount: tx.amount,
        concept: tx.concept,
        category: tx.category,
        projectId: tx.projectId,
        expenseCategory: tx.expenseCategory,
        notes: null,
        hasInvoice: tx.hasInvoice,
        invoiceUrl: null,
        invoiceFileName: tx.invoiceFileName || null,
      }
    });
  }

  const total = await prisma.transaction.count();
  const projectCount = await prisma.project.count();
  console.log('Total proyectos:', projectCount);
  console.log('Total transacciones:', total);
  console.log('Seed completado!');
}

seed()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
