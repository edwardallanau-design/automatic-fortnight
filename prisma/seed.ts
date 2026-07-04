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

const SEED_TABLES = [1, 2, 3]

const SEED_MENU_ITEMS = [
  { name: 'Cheeseburger', price: 12.5, available: true },
  { name: 'Fries', price: 4.0, available: true },
  { name: 'Soda', price: 2.5, available: true },
  { name: 'Milkshake', price: 5.5, available: false },
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

  for (const number of SEED_TABLES) {
    await prisma.table.upsert({
      where: { number },
      update: {},
      create: { number },
    })
  }
  console.log('Seeded tables:', SEED_TABLES.join(', '))

  for (const { name, price, available } of SEED_MENU_ITEMS) {
    const existing = await prisma.menuItem.findFirst({ where: { name } })
    if (existing) {
      await prisma.menuItem.update({ where: { id: existing.id }, data: { price, available } })
    } else {
      await prisma.menuItem.create({ data: { name, price, available } })
    }
  }
  console.log('Seeded menu items:', SEED_MENU_ITEMS.map((i) => i.name).join(', '))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
