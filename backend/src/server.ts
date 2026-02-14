// Servidor principal - Express + TypeScript
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

// Importar rutas
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import syncRoutes from './routes/sync';
import transactionRoutes from './routes/transactions';
import dashboardRoutes from './routes/dashboard';
import invoiceRoutes from './routes/invoices';
import { configureBucketCors } from './services/cloudflare-r2';

// Cargar variables de entorno
dotenv.config();

const prisma = new PrismaClient();

const app: Application = express();
const PORT = process.env.PORT || 8000;

// ========================================
// MIDDLEWARES GLOBALES
// ========================================

// CORS - permitir peticiones desde el frontend
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3003'],
  credentials: true
}));

// Parser de JSON
app.use(express.json());

// Parser de URL-encoded
app.use(express.urlencoded({ extended: true }));

// ========================================
// RUTAS
// ========================================

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'Lions API is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Lions Expense Control API',
    version: '1.0.0',
    description: 'Sistema de control de gastos para proyectos de remodelación'
  });
});

// Usar rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/invoices', invoiceRoutes);

// ========================================
// MANEJO DE ERRORES
// ========================================

// Ruta no encontrada (404)
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `La ruta ${req.method} ${req.url} no existe`
  });
});

// Middleware de manejo global de errores
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Ha ocurrido un error en el servidor'
  });
});

// ========================================
// INICIAR SERVIDOR
// ========================================

// Seed: crear usuario por defecto si no existe
async function seedDefaultUser() {
  try {
    const existing = await prisma.user.findFirst();
    if (!existing) {
      const hashedPassword = await bcrypt.hash('***REMOVED***', 10);
      await prisma.user.create({
        data: {
          email: 'lions',
          password: hashedPassword,
          name: 'Lions Admin'
        }
      });
      console.log('✅ Usuario por defecto creado: lions');
    }
  } catch (error) {
    console.error('Error al crear usuario por defecto:', error);
  }
}

app.listen(PORT, async () => {
  console.log(`🚀 Servidor Lions corriendo en http://localhost:${PORT}`);
  console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  await seedDefaultUser();

  // Configurar CORS del bucket R2 para uploads directos
  try {
    await configureBucketCors();
    console.log('✅ CORS de R2 configurado correctamente');
  } catch (error) {
    console.warn('⚠️ No se pudo configurar CORS de R2:', (error as Error).message);
  }
});

export default app;
