import { describe, expect, it } from 'vitest'
import { brandFrom, brandLeftovers } from './brand'

describe('brandFrom', () => {
  it('with nothing set, is exactly the wording RECI Transport has always shown', () => {
    expect(brandFrom({})).toEqual({
      name: 'RECI Transport',
      shortName: 'RECI',
      legalName: 'RECI Transport GmbH',
      emailLegalName: 'RECI Transport Ltd',
      city: 'Berlin',
      country: 'Germany',
      timeZone: 'Europe/Berlin',
      hqName: 'RECI HQ, Berlin',
      supportEmail: 'support@reci-transport.com',
      contactEmail: 'support@recitransport.de',
      bookingsEmail: 'bookings@recitransport.de',
      legalEmail: 'legal@recitransport.de',
      privacyEmail: 'privacy@recitransport.de',
      corporateEmail: 'corporate@reci-transport.de',
      faqBookingsEmail: 'bookings@reci-transport.de',
    })
  })

  it('treats blank and whitespace values as not set', () => {
    expect(brandFrom({ NEXT_PUBLIC_BRAND_NAME: '   ', NEXT_PUBLIC_BRAND_CITY: '' })).toEqual(brandFrom({}))
  })

  it('a new name flows into every name field that was not set, so no part keeps showing RECI', () => {
    const b = brandFrom({ NEXT_PUBLIC_BRAND_NAME: 'Acme Rentals', NEXT_PUBLIC_BRAND_CITY: 'Hamburg' })
    expect(b.name).toBe('Acme Rentals')
    expect(b.shortName).toBe('Acme Rentals')
    expect(b.legalName).toBe('Acme Rentals')
    expect(b.emailLegalName).toBe('Acme Rentals')
    expect(b.hqName).toBe('Acme Rentals HQ, Hamburg')
    expect(JSON.stringify(b)).not.toMatch(/RECI/)
  })

  it('explicit values win over the follow-on ones', () => {
    const b = brandFrom({
      NEXT_PUBLIC_BRAND_NAME: 'Acme Rentals',
      NEXT_PUBLIC_BRAND_SHORT_NAME: 'Acme',
      NEXT_PUBLIC_BRAND_LEGAL_NAME: 'Acme Rentals Ltd',
      NEXT_PUBLIC_BRAND_HQ_NAME: 'Acme Depot, Hamburg Harbour',
    })
    expect(b.shortName).toBe('Acme')
    expect(b.legalName).toBe('Acme Rentals Ltd')
    expect(b.emailLegalName).toBe('Acme Rentals Ltd')
    expect(b.hqName).toBe('Acme Depot, Hamburg Harbour')
  })

  it('changing only the city keeps RECI as the company but moves the collection point', () => {
    const b = brandFrom({ NEXT_PUBLIC_BRAND_CITY: 'Munich' })
    expect(b.name).toBe('RECI Transport')
    expect(b.hqName).toBe('RECI Transport HQ, Munich')
  })

  it('refuses an unknown time zone, which would otherwise break every date shown', () => {
    expect(brandFrom({ NEXT_PUBLIC_BRAND_TIME_ZONE: 'Not/AZone' }).timeZone).toBe('Europe/Berlin')
    expect(brandFrom({ NEXT_PUBLIC_BRAND_TIME_ZONE: 'Europe/London' }).timeZone).toBe('Europe/London')
  })

  it('takes contact addresses as given', () => {
    const b = brandFrom({ NEXT_PUBLIC_BRAND_SUPPORT_EMAIL: 'help@acme.example', NEXT_PUBLIC_BRAND_BOOKINGS_EMAIL: 'book@acme.example', NEXT_PUBLIC_BRAND_LEGAL_EMAIL: 'legal@acme.example' })
    expect([b.supportEmail, b.bookingsEmail, b.legalEmail]).toEqual(['help@acme.example', 'book@acme.example', 'legal@acme.example'])
  })

  it('one bookings address set moves both places that quote it', () => {
    const b = brandFrom({ NEXT_PUBLIC_BRAND_BOOKINGS_EMAIL: 'book@acme.example' })
    expect(b.faqBookingsEmail).toBe('book@acme.example')
  })
})

describe('brandLeftovers', () => {
  it('is empty for RECI itself, which is allowed to show RECI', () => {
    expect(brandLeftovers({})).toEqual([])
  })

  it('lists the contact addresses a renamed business forgot to set', () => {
    const left = brandLeftovers({ NEXT_PUBLIC_BRAND_NAME: 'Acme Rentals', NEXT_PUBLIC_BRAND_SUPPORT_EMAIL: 'help@acme.example' })
    expect(left).toEqual(expect.arrayContaining(['bookingsEmail', 'contactEmail', 'legalEmail', 'privacyEmail', 'corporateEmail', 'faqBookingsEmail']))
    expect(left).not.toContain('supportEmail')
    expect(left).not.toContain('name')
  })
})
