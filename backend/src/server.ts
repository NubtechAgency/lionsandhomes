// Servidor principal - Express + TypeScript
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
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

// Cargar variables de entorno
dotenv.config();

const prisma = new PrismaClient();

// Validar variables de entorno requeridas al arrancar
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`ERROR: Variable de entorno ${key} no está configurada. Abortando.`);
    process.exit(1);
  }
}

const app: Application = express();
const PORT = process.env.PORT || 8000;

// ========================================
// MIDDLEWARES GLOBALES
// ========================================

// Security headers (helmet)
app.use(helmet());

// Cookie parser (para leer httpOnly cookies de auth)
app.use(cookieParser());

// CORS - permitir peticiones desde el frontend
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3003'],
  credentials: true
}));

// Rate limiting global (100 req/15min por IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Demasiadas peticiones, intenta de nuevo más tarde' },
});
app.use(globalLimiter);

// Rate limiting estricto para login (5 intentos/15min por IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Demasiados intentos de login, intenta de nuevo en 15 minutos' },
});

// Rate limiting específico para endpoints CPU/IO intensivos
const dashboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Demasiadas peticiones al dashboard' },
});

const checkDuplicatesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Demasiadas peticiones de duplicados' },
});

const invoiceUploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Demasiadas subidas de factura' },
});

const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Demasiadas sincronizaciones' },
});

// Parser de JSON con límite de tamaño
app.use(express.json({ limit: '1mb' }));

// Parser de URL-encoded con límite de tamaño
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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

// Rate limiters específicos por endpoint (antes de las rutas)
app.use('/api/auth/login', loginLimiter);
app.use('/api/dashboard/stats', dashboardLimiter);
app.use('/api/transactions/check-duplicates', checkDuplicatesLimiter);
app.use('/api/invoices/upload', invoiceUploadLimiter);
app.use('/api/sync/transactions', syncLimiter);

// Rutas de la API
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

// Seed: crear usuario por defecto si no existe, o actualizar password si SEED_USER_PASSWORD está definida
async function seedDefaultUser() {
  try {
    const seedEmail = process.env.SEED_USER_EMAIL;
    const seedPassword = process.env.SEED_USER_PASSWORD;
    const seedName = process.env.SEED_USER_NAME || 'Admin';

    if (!seedEmail || !seedPassword) {
      return;
    }

    const existing = await prisma.user.findFirst();
    if (!existing) {
      // Crear usuario nuevo
      const hashedPassword = await bcrypt.hash(seedPassword, 10);
      await prisma.user.create({
        data: { email: seedEmail, password: hashedPassword, name: seedName }
      });
      console.log('✅ Usuario por defecto creado');
    } else {
      // Actualizar password del usuario existente si ha cambiado
      const isSamePassword = await bcrypt.compare(seedPassword, existing.password);
      if (!isSamePassword) {
        const hashedPassword = await bcrypt.hash(seedPassword, 10);
        await prisma.user.update({
          where: { id: existing.id },
          data: { password: hashedPassword }
        });
        console.log('✅ Password del usuario actualizada');
      }
    }
  } catch (error) {
    console.error('Error al gestionar usuario por defecto:', error);
  }
}

// Seed: crear proyecto "General" si no existe
async function seedGeneralProject() {
  try {
    const existing = await prisma.project.findFirst({
      where: { name: 'General' },
    });
    if (!existing) {
      await prisma.project.create({
        data: {
          name: 'General',
          description: 'Gastos generales no asignados a un proyecto específico (sueldos, préstamos...)',
          status: 'ACTIVE',
          totalBudget: 0,
          categoryBudgets: JSON.stringify({}),
          startDate: new Date(),
        },
      });
      console.log('✅ Proyecto "General" creado');
    }
  } catch (error) {
    console.error('Error al crear proyecto General:', error);
  }
}

// Limpiar refresh tokens expirados cada hora
setInterval(async () => {
  try {
    const { count } = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) {
      console.log(`Limpieza: ${count} refresh tokens expirados eliminados`);
    }
  } catch (error) {
    console.error('Error limpiando refresh tokens:', error);
  }
}, 60 * 60 * 1000);

app.listen(PORT, async () => {
  console.log(`🚀 Servidor Lions corriendo en http://localhost:${PORT}`);
  console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  await seedDefaultUser();
  await seedGeneralProject();
});

export default app;
