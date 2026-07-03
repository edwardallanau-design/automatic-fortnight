import { config as loadEnv } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'

loadEnv({ path: '.env.local' })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const SEED_CREDENTIALS = [
  { role: 'staff' as const, password: 'staff-temp-pw' },
  { role: 'admin' as const, password: 'admin-temp-pw' },
]

async function main() {
  for (const { role, password } of SEED_CREDENTIALS) {
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.credential.upsert({
      where: { role },
      update: { passwordHash },
      create: { role, passwordHash },
    })
  }
  console.log('Seeded credentials for roles:', SEED_CREDENTIALS.map((c) => c.role).join(', '))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
