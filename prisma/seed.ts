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

const SEED_ADMIN_PASSWORD = requireEnv('SEED_ADMIN_PASSWORD')
const SEED_STAFF_PASSWORD = requireEnv('SEED_STAFF_PASSWORD')

// The Task 2 migration inserts the Main branch with this exact fixed id (and the
// Main staff credential's branchId points at it). Upserting on this id here is
// therefore atomic AND matches the already-inserted row, so overlapping seed
// runs on a shared DB can't create a duplicate Main branch.
const MAIN_BRANCH_ID = '00000000-0000-0000-0000-000000000001'

// Only the Counter (0). Every branch needs a Counter — a database created via
// `prisma migrate reset` (which replays every migration against an empty
// database, so Task 2's data-backfill UPDATE has no pre-existing rows to act on)
// still ends up with one, matching a real production database's post-migration
// state. Real tables are created per-branch through the admin UI, not seeded, so
// a fresh production DB starts clean rather than carrying sample tables.
const SEED_TABLES = [0]

// Grouped by the same categories the old regex-based customer-menu grouping
// hack used to fake (deleted in the menu-categories feature) -- now seeded as
// real Category rows so the category feature has real test data out of the box.
const SEED_CATEGORIES = [
  {
    name: 'Espresso Drinks',
    items: [
      { name: 'Espresso', price: 3.0 },
      { name: 'Americano', price: 3.5 },
      { name: 'Cappuccino', price: 4.75 },
      { name: 'Latte', price: 5.0 },
      { name: 'Flat White', price: 5.0 },
      { name: 'Mocha', price: 5.5 },
      { name: 'Caramel Macchiato', price: 5.5 },
    ],
  },
  {
    name: 'Brewed & Tea',
    items: [
      { name: 'Drip Coffee', price: 3.0 },
      { name: 'Cold Brew', price: 4.5 },
      { name: 'Chai Latte', price: 4.75 },
      { name: 'Matcha Latte', price: 5.25 },
      { name: 'Hot Tea', price: 3.25 },
      { name: 'Iced Tea', price: 3.25 },
    ],
  },
  {
    name: 'Pastries',
    items: [
      { name: 'Croissant', price: 3.75 },
      { name: 'Almond Croissant', price: 4.25 },
      { name: 'Pain au Chocolat', price: 4.25 },
      { name: 'Blueberry Muffin', price: 3.95 },
      { name: 'Cinnamon Roll', price: 4.5 },
      { name: 'Chocolate Chip Cookie', price: 2.75 },
      { name: 'Banana Bread', price: 3.95 },
      { name: 'Scone', price: 3.5 },
    ],
  },
  {
    name: 'Light Bites',
    items: [
      { name: 'Avocado Toast', price: 8.5 },
      { name: 'Breakfast Sandwich', price: 7.25 },
      { name: 'Yogurt Parfait', price: 5.75 },
      { name: 'Bagel with Cream Cheese', price: 4.5 },
    ],
  },
]

async function main() {
  // Admin credential: reseeded on every run, unchanged from before this feature.
  // This IS the accepted password-rotation mechanism (ISSUE-11) -- editing
  // SEED_ADMIN_PASSWORD and redeploying is how the admin password is rotated.
  //
  // NOTE: `Credential.role` lost its `@unique` constraint in the branch-model
  // migration (it can no longer be unique once multiple staff credentials
  // exist, one per branch), so this can't be a `upsert({ where: { role } })`
  // like it used to be. Look the row up by role (only ever one `admin` row,
  // since only the Main branch/global admin flow creates one) and
  // create-or-update by id instead.
  //
  // KNOWN RESIDUAL RACE (ISSUE-21): unlike the branch rows below, the admin
  // credential has no safe atomic upsert key -- `role` is no longer unique,
  // `branchId` is null (can't key an upsert on a null unique field), and its id
  // is random in the existing production DB (a fixed-id upsert would create a
  // duplicate, not match). So this stays a non-atomic check-then-act; concurrent
  // seed runs on an *unseeded* DB could create two admin rows. Practical risk is
  // near-nil (the shared prod DB is already seeded, so every run takes the update
  // path). Proper fix is a partial unique index on role='admin' + upsert, which
  // is a schema migration and out of Task 10's scope. Tracked as ISSUE-21.
  const adminPasswordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 10)
  const existingAdminCredential = await prisma.credential.findFirst({ where: { role: 'admin' } })
  if (existingAdminCredential) {
    await prisma.credential.update({
      where: { id: existingAdminCredential.id },
      data: { passwordHash: adminPasswordHash },
    })
  } else {
    await prisma.credential.create({ data: { role: 'admin', passwordHash: adminPasswordHash } })
  }
  console.log('Seeded credential for role: admin')

  // Main branch + its credential: created once if missing, then left alone.
  // Once Plan 2 ships an admin UI for rotating a branch's password, that
  // becomes the authoritative way to change it -- this script must never
  // overwrite it again on a later deploy, or an admin-set password would be
  // silently reverted on the next build (the exact failure mode ISSUE-11
  // already accepted for the *admin* credential, which is fine there because
  // there's no other rotation path for it; it would NOT be fine here, since
  // the branch-settings UI is meant to be authoritative).
  // Upsert on the fixed id the migration used: atomic, matches the existing row,
  // and `update: {}` means an existing Main branch is never mutated.
  const mainBranch = await prisma.branch.upsert({
    where: { id: MAIN_BRANCH_ID },
    update: {},
    create: { id: MAIN_BRANCH_ID, name: 'Main' },
  })

  // Upsert on branchId (which IS @unique): atomic, and the empty `update: {}`
  // preserves the create-once-never-overwrite property -- an admin-set branch
  // password (future Plan 2 UI) is never reverted on a later deploy. The hash is
  // computed unconditionally but only used on the create branch.
  const staffPasswordHash = await bcrypt.hash(SEED_STAFF_PASSWORD, 10)
  await prisma.credential.upsert({
    where: { branchId: mainBranch.id },
    update: {},
    create: { role: 'staff', branchId: mainBranch.id, passwordHash: staffPasswordHash },
  })
  console.log('Seeded credential for Main branch (create-once)')

  const seededLabels: string[] = []
  for (const number of SEED_TABLES) {
    const label = number === 0 ? 'Counter' : `Table ${number}`
    await prisma.orderingPoint.upsert({
      where: { branchId_label: { branchId: mainBranch.id, label } },
      update: {},
      create: { branchId: mainBranch.id, label, isCounter: number === 0 },
    })
    seededLabels.push(label)
  }
  console.log('Seeded ordering points for Main branch:', seededLabels.join(', '))

  // Categories and menu items are both create-once, matched by name: seed a
  // missing row, but never overwrite one that already exists. The menu is
  // managed through the admin UI on a live database, so re-running the seed on
  // every deploy must not revert admin edits (renamed/reordered/deleted
  // categories, renamed items, price changes, removals). Adding a new category
  // or item to SEED_CATEGORIES later still works — it's created wherever it's
  // missing without touching the rest. categoryId is only ever set at item
  // *creation* time, matching how item creation itself already has no
  // categoryId in the real admin flow (assignment happens afterward) — an
  // existing item's category is never touched by re-seeding.
  let createdCategoryCount = 0
  let createdItemCount = 0
  let totalItemCount = 0
  for (const [index, { name: categoryName, items }] of SEED_CATEGORIES.entries()) {
    let category = await prisma.category.findFirst({ where: { name: categoryName } })
    if (!category) {
      category = await prisma.category.create({ data: { name: categoryName, sortOrder: index } })
      createdCategoryCount += 1
    }

    for (const { name, price } of items) {
      totalItemCount += 1
      const existing = await prisma.menuItem.findFirst({ where: { name } })
      if (!existing) {
        await prisma.menuItem.create({ data: { name, price, categoryId: category.id } })
        createdItemCount += 1
      }
    }
  }
  console.log(`Seeded categories: ${createdCategoryCount} created, ${SEED_CATEGORIES.length - createdCategoryCount} already present (create-once)`)
  console.log(`Seeded menu items: ${createdItemCount} created, ${totalItemCount - createdItemCount} already present (create-once)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
