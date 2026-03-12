// ============================================================
// MOCKS — set up before importing the controller
// ============================================================
vi.mock('../lib/prisma', () => ({
  default: {
    transaction: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../services/auditLog', () => ({
  logAudit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

import prisma from '../lib/prisma';
import { archiveDuplicates } from './transactionController';

// ============================================================
// HELPERS
// ============================================================
function mockReq(userId = 1) {
  return { userId, ip: '127.0.0.1' } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const mockFindMany = () => vi.mocked(prisma.transaction.findMany);
const mockUpdateMany = () => vi.mocked(prisma.transaction.updateMany);
const mockUpdate = () => vi.mocked(prisma.transaction.update);

// ============================================================
// TESTS
// ============================================================
describe('archiveDuplicates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMany().mockResolvedValue({ count: 1 } as any);
    mockUpdate().mockResolvedValue({} as any);
  });

  // ----------------------------------------------------------
  // Caso base: par de duplicados
  // ----------------------------------------------------------
  it('archives the newer, keeps the oldest of a pair', async () => {
    mockFindMany().mockResolvedValue([
      { id: 1, duplicateGroupId: 'abc', createdAt: new Date('2024-01-01') },
      { id: 2, duplicateGroupId: 'abc', createdAt: new Date('2024-01-02') },
    ] as any);

    const res = mockRes();
    await archiveDuplicates(mockReq(), res);

    // Archiva el segundo (id=2), conserva el primero (id=1)
    expect(mockUpdateMany()).toHaveBeenCalledWith({
      where: { id: { in: [2] } },
      data: { isArchived: true, needsReview: false },
    });

    // Limpia flag del que queda (id=1)
    expect(mockUpdate()).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { needsReview: false },
    });

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      archived: 1,
      cleared: 1,
      groups: 1,
    }));
  });

  // ----------------------------------------------------------
  // Grupo de 3: archiva 2, conserva 1
  // ----------------------------------------------------------
  it('archives N-1 and keeps 1 when group has 3 duplicates', async () => {
    mockFindMany().mockResolvedValue([
      { id: 10, duplicateGroupId: 'grp1', createdAt: new Date('2024-01-01') },
      { id: 11, duplicateGroupId: 'grp1', createdAt: new Date('2024-01-02') },
      { id: 12, duplicateGroupId: 'grp1', createdAt: new Date('2024-01-03') },
    ] as any);

    const res = mockRes();
    await archiveDuplicates(mockReq(), res);

    expect(mockUpdateMany()).toHaveBeenCalledWith({
      where: { id: { in: [11, 12] } },
      data: { isArchived: true, needsReview: false },
    });
    expect(mockUpdate()).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { needsReview: false },
    });

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      archived: 2,
      cleared: 1,
    }));
  });

  // ----------------------------------------------------------
  // Múltiples grupos independientes
  // ----------------------------------------------------------
  it('processes multiple groups independently', async () => {
    mockFindMany().mockResolvedValue([
      { id: 1, duplicateGroupId: 'grpA', createdAt: new Date('2024-01-01') },
      { id: 2, duplicateGroupId: 'grpA', createdAt: new Date('2024-01-02') },
      { id: 3, duplicateGroupId: 'grpB', createdAt: new Date('2024-01-01') },
      { id: 4, duplicateGroupId: 'grpB', createdAt: new Date('2024-01-02') },
    ] as any);

    const res = mockRes();
    await archiveDuplicates(mockReq(), res);

    // 2 grupos × 1 archivado cada uno = 2 archivados
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      archived: 2,
      cleared: 2,
      groups: 2,
    }));

    // updateMany llamado 2 veces (una por grupo)
    expect(mockUpdateMany()).toHaveBeenCalledTimes(2);
    expect(mockUpdate()).toHaveBeenCalledTimes(2);
  });

  // ----------------------------------------------------------
  // Grupo huérfano (solo 1 en el grupo): limpia flag sin archivar
  // ----------------------------------------------------------
  it('clears needsReview without archiving when group has only 1 transaction', async () => {
    mockFindMany().mockResolvedValue([
      { id: 5, duplicateGroupId: 'solo', createdAt: new Date('2024-01-01') },
    ] as any);

    const res = mockRes();
    await archiveDuplicates(mockReq(), res);

    // Solo updateMany para limpiar flag, sin update individual
    expect(mockUpdateMany()).toHaveBeenCalledWith({
      where: { id: { in: [5] } },
      data: { needsReview: false },
    });
    expect(mockUpdate()).not.toHaveBeenCalled();

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      archived: 0,
      cleared: 1,
    }));
  });

  // ----------------------------------------------------------
  // Sin duplicados: respuesta vacía
  // ----------------------------------------------------------
  it('returns zero counts when there are no flagged transactions', async () => {
    mockFindMany().mockResolvedValue([] as any);

    const res = mockRes();
    await archiveDuplicates(mockReq(), res);

    expect(mockUpdateMany()).not.toHaveBeenCalled();
    expect(mockUpdate()).not.toHaveBeenCalled();

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      archived: 0,
      cleared: 0,
      groups: 0,
    }));
  });

  // ----------------------------------------------------------
  // El mensaje describe correctamente lo ocurrido
  // ----------------------------------------------------------
  it('includes a human-readable message in the response', async () => {
    mockFindMany().mockResolvedValue([
      { id: 1, duplicateGroupId: 'abc', createdAt: new Date('2024-01-01') },
      { id: 2, duplicateGroupId: 'abc', createdAt: new Date('2024-01-02') },
    ] as any);

    const res = mockRes();
    await archiveDuplicates(mockReq(), res);

    const call = res.json.mock.calls[0][0];
    expect(call.message).toContain('1 duplicados archivados');
    expect(call.message).toContain('1 transacciones conservadas');
  });

  // ----------------------------------------------------------
  // Error de base de datos → 500
  // ----------------------------------------------------------
  it('returns 500 when the database throws', async () => {
    mockFindMany().mockRejectedValue(new Error('DB connection lost'));

    const res = mockRes();
    await archiveDuplicates(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Error al archivar duplicados',
    }));
  });

  // ----------------------------------------------------------
  // Mezcla: un grupo real + uno huérfano
  // ----------------------------------------------------------
  it('handles a mix of real duplicate groups and orphan groups', async () => {
    mockFindMany().mockResolvedValue([
      { id: 1, duplicateGroupId: 'pair', createdAt: new Date('2024-01-01') },
      { id: 2, duplicateGroupId: 'pair', createdAt: new Date('2024-01-02') },
      { id: 3, duplicateGroupId: 'solo', createdAt: new Date('2024-01-01') },
    ] as any);

    const res = mockRes();
    await archiveDuplicates(mockReq(), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      archived: 1,    // solo del par
      cleared: 2,     // el que queda del par + el huérfano
      groups: 2,
    }));
  });
});
