// Controlador de autenticación con httpOnly cookies + refresh tokens
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logAudit, getClientIp } from '../services/auditLog';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from '../lib/cookies';

const prisma = new PrismaClient();

/**
 * Genera un access token JWT (corta duración: 15 min)
 */
const generateAccessToken = (userId: number, email: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no está configurado');
  return jwt.sign({ userId, email }, secret, { expiresIn: '15m' });
};

/**
 * Genera un refresh token opaco (crypto random)
 */
const generateRefreshToken = (): string => {
  return crypto.randomBytes(40).toString('hex');
};

/**
 * POST /api/auth/login
 * Autentica un usuario, setea cookies httpOnly
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      await logAudit({ action: 'LOGIN_FAILED', entityType: 'User', details: { email }, ipAddress: getClientIp(req) });
      res.status(401).json({ error: 'Credenciales inválidas', message: 'Email o contraseña incorrectos' });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      await logAudit({ action: 'LOGIN_FAILED', entityType: 'User', userId: user.id, details: { email }, ipAddress: getClientIp(req) });
      res.status(401).json({ error: 'Credenciales inválidas', message: 'Email o contraseña incorrectos' });
      return;
    }

    // Generar tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken();

    // Guardar refresh token en DB
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt },
    });

    // Limpiar tokens viejos (mantener últimos 5)
    const oldTokens = await prisma.refreshToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      skip: 5,
    });
    if (oldTokens.length > 0) {
      await prisma.refreshToken.deleteMany({
        where: { id: { in: oldTokens.map(t => t.id) } },
      });
    }

    // Setear cookies httpOnly
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, accessTokenCookieOptions);
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshTokenCookieOptions);

    await logAudit({ action: 'LOGIN', entityType: 'User', entityId: user.id, userId: user.id, ipAddress: getClientIp(req) });

    // Responder con user (SIN token en body)
    res.json({
      message: 'Login exitoso',
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al iniciar sesión' });
  }
};

/**
 * POST /api/auth/refresh
 * Rota el refresh token y emite nuevo access token
 */
export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];

    if (!refreshToken) {
      res.status(401).json({ error: 'No autorizado', message: 'No refresh token' });
      return;
    }

    // Buscar en DB
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      // Token inválido o expirado — limpiar
      if (storedToken) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      }
      res.clearCookie(ACCESS_TOKEN_COOKIE, accessTokenCookieOptions);
      res.clearCookie(REFRESH_TOKEN_COOKIE, refreshTokenCookieOptions);
      res.status(401).json({ error: 'No autorizado', message: 'Refresh token inválido o expirado' });
      return;
    }

    // Rotar: eliminar viejo, crear nuevo
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    const newRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { token: newRefreshToken, userId: storedToken.userId, expiresAt },
    });

    // Nuevo access token
    const accessToken = generateAccessToken(storedToken.userId, storedToken.user.email);

    // Setear nuevas cookies
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, accessTokenCookieOptions);
    res.cookie(REFRESH_TOKEN_COOKIE, newRefreshToken, refreshTokenCookieOptions);

    res.json({
      message: 'Token refreshed',
      user: { id: storedToken.user.id, email: storedToken.user.email, name: storedToken.user.name },
    });
  } catch (error) {
    console.error('Error en refresh:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al refrescar token' });
  }
};

/**
 * POST /api/auth/logout
 * Invalida el refresh token y limpia cookies
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }

    res.clearCookie(ACCESS_TOKEN_COOKIE, accessTokenCookieOptions);
    res.clearCookie(REFRESH_TOKEN_COOKIE, refreshTokenCookieOptions);

    await logAudit({ action: 'LOGOUT', entityType: 'User', userId: req.userId, ipAddress: getClientIp(req) });

    res.json({ message: 'Logout exitoso' });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al cerrar sesión' });
  }
};

/**
 * GET /api/auth/me
 * Obtiene los datos del usuario autenticado actual
 */
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ error: 'No autorizado', message: 'No se pudo identificar al usuario' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado', message: 'El usuario no existe' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Error en getCurrentUser:', error);
    res.status(500).json({ error: 'Error del servidor', message: 'Error al obtener datos del usuario' });
  }
};
