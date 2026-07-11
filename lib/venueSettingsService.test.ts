import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getVenueSettings, setAcceptingOrders } from './venueSettingsService'
import { prisma } from './prisma'

vi.mock('./prisma', () => ({
  prisma: {
    venueSettings: {
      upsert: vi.fn(),
    },
  },
}))

describe('venueSettingsService.getVenueSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts the singleton row and returns it', async () => {
    const settings = { id: 'singleton', acceptingOrders: true, updatedAt: new Date() }
    vi.mocked(prisma.venueSettings.upsert).mockResolvedValue(settings as never)

    const result = await getVenueSettings()

    expect(result).toEqual(settings)
    expect(prisma.venueSettings.upsert).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    })
  })
})

describe('venueSettingsService.setAcceptingOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts the singleton row with the given acceptingOrders value', async () => {
    const settings = { id: 'singleton', acceptingOrders: false, updatedAt: new Date() }
    vi.mocked(prisma.venueSettings.upsert).mockResolvedValue(settings as never)

    const result = await setAcceptingOrders(false)

    expect(result).toEqual(settings)
    expect(prisma.venueSettings.upsert).toHaveBeenCalledWith({
      where: { id: 'singleton' },
      update: { acceptingOrders: false },
      create: { id: 'singleton', acceptingOrders: false },
    })
  })
})
