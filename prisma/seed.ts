import { existsSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'

if (existsSync('.env.local')) {
  loadEnv({ path: '.env.local' })
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is not set (see .env.example)`)
  }
  return value
}

const SEED_CREDENTIALS = [
  { role: 'staff' as const, password: requireEnv('SEED_STAFF_PASSWORD') },
  { role: 'admin' as const, password: requireEnv('SEED_ADMIN_PASSWORD') },
]

const SEED_TABLES = [1, 2, 3]

const SEED_MENU_ITEMS = [
  // Espresso drinks
  { name: 'Espresso', price: 3.0, available: true },
  { name: 'Americano', price: 3.5, available: true },
  { name: 'Cappuccino', price: 4.75, available: true },
  { name: 'Latte', price: 5.0, available: true },
  { name: 'Flat White', price: 5.0, available: true },
  { name: 'Mocha', price: 5.5, available: true },
  { name: 'Caramel Macchiato', price: 5.5, available: true },

  // Brewed & tea
  { name: 'Drip Coffee', price: 3.0, available: true },
  { name: 'Cold Brew', price: 4.5, available: true },
  { name: 'Chai Latte', price: 4.75, available: true },
  { name: 'Matcha Latte', price: 5.25, available: false },
  { name: 'Hot Tea', price: 3.25, available: true },
  { name: 'Iced Tea', price: 3.25, available: true },

  // Pastries
  { name: 'Croissant', price: 3.75, available: true },
  { name: 'Almond Croissant', price: 4.25, available: true },
  { name: 'Pain au Chocolat', price: 4.25, available: true },
  { name: 'Blueberry Muffin', price: 3.95, available: true },
  { name: 'Cinnamon Roll', price: 4.5, available: true },
  { name: 'Chocolate Chip Cookie', price: 2.75, available: true },
  { name: 'Banana Bread', price: 3.95, available: false },
  { name: 'Scone', price: 3.5, available: true },

  // Light bites
  { name: 'Avocado Toast', price: 8.5, available: true },
  { name: 'Breakfast Sandwich', price: 7.25, available: true },
  { name: 'Yogurt Parfait', price: 5.75, available: true },
  { name: 'Bagel with Cream Cheese', price: 4.5, available: true },
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
