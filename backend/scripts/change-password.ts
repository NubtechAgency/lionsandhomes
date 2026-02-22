/**
 * Script de un solo uso para cambiar la password del usuario existente.
 * Uso: npx ts-node scripts/change-password.ts
 *
 * Lee la nueva password de la variable de entorno SEED_USER_PASSWORD
 * (la misma que ahora usa el seed en server.ts)
 */
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const newPassword = process.env.SEED_USER_PASSWORD;
  if (!newPassword) {
    console.error('❌ Define SEED_USER_PASSWORD en tu .env');
    process.exit(1);
  }

  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('❌ No hay usuarios en la base de datos');
    process.exit(1);
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed },
  });

  console.log(`✅ Password actualizada para usuario "${user.email}"`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
