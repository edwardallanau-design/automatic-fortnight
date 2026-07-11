import type { VenueSettings } from '@prisma/client'
import { prisma } from './prisma'

const SINGLETON_ID = 'singleton'

export async function getVenueSettings(): Promise<VenueSettings> {
  return prisma.venueSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
}

export async function setAcceptingOrders(acceptingOrders: boolean): Promise<VenueSettings> {
  return prisma.venueSettings.upsert({
    where: { id: SINGLETON_ID },
    update: { acceptingOrders },
    create: { id: SINGLETON_ID, acceptingOrders },
  })
}
