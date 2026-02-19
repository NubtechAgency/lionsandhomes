// Controlador de autenticación
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Genera un token JWT para un usuario
 */
const generateToken = (userId: number, email: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no está configurado');
  }

  return jwt.sign(
    { userId, email },
    secret,
    { expiresIn: '7d' } // Token válido por 7 días
  );
};

/**
 * POST /api/auth/login
 * Autentica un usuario y devuelve un token JWT
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validar campos requeridos
    if (!email || !password) {
      res.status(400).json({
        error: 'Datos incompletos',
        message: 'Email y password son requeridos'
      });
      return;
    }

    // Buscar el usuario por email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email o contraseña incorrectos'
      });
      return;
    }

    // Verificar el password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      res.status(401).json({
        error: 'Credenciales inválidas',
        message: 'Email o contraseña incorrectos'
      });
      return;
    }

    // Generar token JWT
    const token = generateToken(user.id, user.email);

    // Responder con los datos del usuario y el token
    res.json({
      message: 'Login exitoso',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al iniciar sesión'
    });
  }
};

/**
 * GET /api/auth/me
 * Obtiene los datos del usuario autenticado actual
 * Requiere token JWT en el header Authorization
 */
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    // El userId viene del middleware authMiddleware
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        error: 'No autorizado',
        message: 'No se pudo identificar al usuario'
      });
      return;
    }

    // Buscar el usuario en la BD
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    });

    if (!user) {
      res.status(404).json({
        error: 'Usuario no encontrado',
        message: 'El usuario no existe'
      });
      return;
    }

    res.json({
      user
    });
  } catch (error) {
    console.error('Error en getCurrentUser:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al obtener datos del usuario'
    });
  }
};
