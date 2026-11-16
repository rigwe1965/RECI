/**
 * The name, place and contact details of the business running this deployment.
 *
 * Every field defaults to RECI Transport's own value, so a deployment that sets nothing behaves exactly as before.
 * A buyer of a white-label copy sets the `NEXT_PUBLIC_BRAND_*` variables instead. They are NEXT_PUBLIC_ so the same
 * words appear in server pages, emails, AI prompts and in the browser; they are read at build time.
 */
export interface Brand {
  /** Full trading name: "RECI Transport". */
  name: string
  /** Short name used in tight spaces such as the nav bar: "RECI". */
  shortName: string
  /** Registered company name used on legal pages and footers: "RECI Transport GmbH". */
  legalName: string
  /** Name printed in the e-mail footer. Kept separate because it has always differed from legalName. */
  emailLegalName: string
  /** City the business operates in: "Berlin". */
  city: string
  /** Country: "Germany". */
  country: string
  /** IANA time zone used for showing times: "Europe/Berlin". */
  timeZone: string
  /** Where vehicles are collected: "RECI HQ, Berlin". */
  hqName: string
  supportEmail: string
  /** Address shown in the site footer. It has always differed from supportEmail (a different domain). */
  contactEmail: string
  bookingsEmail: string
  legalEmail: string
  privacyEmail: string
  corporateEmail: string
  /** Address quoted in the FAQ. It has always differed from bookingsEmail (a different domain). */
  faqBookingsEmail: string
}

export type BrandEnv = Record<string, string | undefined>

const DEFAULTS: Brand = {
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
}

const KEYS: Record<keyof Brand, string> = {
  name: 'NEXT_PUBLIC_BRAND_NAME',
  shortName: 'NEXT_PUBLIC_BRAND_SHORT_NAME',
  legalName: 'NEXT_PUBLIC_BRAND_LEGAL_NAME',
  emailLegalName: 'NEXT_PUBLIC_BRAND_EMAIL_LEGAL_NAME',
  city: 'NEXT_PUBLIC_BRAND_CITY',
  country: 'NEXT_PUBLIC_BRAND_COUNTRY',
  timeZone: 'NEXT_PUBLIC_BRAND_TIME_ZONE',
  hqName: 'NEXT_PUBLIC_BRAND_HQ_NAME',
  supportEmail: 'NEXT_PUBLIC_BRAND_SUPPORT_EMAIL',
  contactEmail: 'NEXT_PUBLIC_BRAND_CONTACT_EMAIL',
  bookingsEmail: 'NEXT_PUBLIC_BRAND_BOOKINGS_EMAIL',
  legalEmail: 'NEXT_PUBLIC_BRAND_LEGAL_EMAIL',
  privacyEmail: 'NEXT_PUBLIC_BRAND_PRIVACY_EMAIL',
  corporateEmail: 'NEXT_PUBLIC_BRAND_CORPORATE_EMAIL',
  faqBookingsEmail: 'NEXT_PUBLIC_BRAND_BOOKINGS_EMAIL',
}

/** A valid IANA zone, or false. A wrong zone would make every date in the app throw, so it is checked, not trusted. */
function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * Builds the brand from an environment. A missing or blank value falls back to the default.
 *
 * Only the name and city have follow-on defaults: when a buyer sets a new name but not the short name, legal name,
 * e-mail footer name or collection point, those are built from the new name and city instead of keeping RECI's,
 * so a half-filled setup never shows another company's name.
 */
export function brandFrom(env: BrandEnv): Brand {
  const get = (k: keyof Brand): string | undefined => {
    const v = env[KEYS[k]]?.trim()
    return v ? v : undefined
  }
  const name = get('name')
  const city = get('city')
  const renamed = name !== undefined
  const n = name ?? DEFAULTS.name
  const c = city ?? DEFAULTS.city
  const zone = get('timeZone')
  return {
    name: n,
    shortName: get('shortName') ?? (renamed ? n : DEFAULTS.shortName),
    legalName: get('legalName') ?? (renamed ? n : DEFAULTS.legalName),
    emailLegalName: get('emailLegalName') ?? get('legalName') ?? (renamed ? n : DEFAULTS.emailLegalName),
    city: c,
    country: get('country') ?? DEFAULTS.country,
    timeZone: zone && validTimeZone(zone) ? zone : DEFAULTS.timeZone,
    hqName: get('hqName') ?? (renamed || city !== undefined ? `${n} HQ, ${c}` : DEFAULTS.hqName),
    supportEmail: get('supportEmail') ?? DEFAULTS.supportEmail,
    contactEmail: get('contactEmail') ?? DEFAULTS.contactEmail,
    bookingsEmail: get('bookingsEmail') ?? DEFAULTS.bookingsEmail,
    legalEmail: get('legalEmail') ?? DEFAULTS.legalEmail,
    privacyEmail: get('privacyEmail') ?? DEFAULTS.privacyEmail,
    corporateEmail: get('corporateEmail') ?? DEFAULTS.corporateEmail,
    faqBookingsEmail: get('faqBookingsEmail') ?? DEFAULTS.faqBookingsEmail,
  }
}

/**
 * The fields still holding RECI's own values although the business has been renamed. A renamed deployment that has not
 * set its own contact addresses would otherwise show RECI's, so the sale checklist runs this.
 */
export function brandLeftovers(env: BrandEnv): (keyof Brand)[] {
  const b = brandFrom(env)
  if (b.name === DEFAULTS.name) return []
  return (Object.keys(DEFAULTS) as (keyof Brand)[]).filter((k) => b[k] === DEFAULTS[k] && k !== 'country' && k !== 'timeZone')
}
/**
 * The brand of this deployment. Each variable is named in full so Next.js can put the value into browser code.
 */
export const brand: Brand = brandFrom({
  NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME,
  NEXT_PUBLIC_BRAND_SHORT_NAME: process.env.NEXT_PUBLIC_BRAND_SHORT_NAME,
  NEXT_PUBLIC_BRAND_LEGAL_NAME: process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME,
  NEXT_PUBLIC_BRAND_EMAIL_LEGAL_NAME: process.env.NEXT_PUBLIC_BRAND_EMAIL_LEGAL_NAME,
  NEXT_PUBLIC_BRAND_CITY: process.env.NEXT_PUBLIC_BRAND_CITY,
  NEXT_PUBLIC_BRAND_COUNTRY: process.env.NEXT_PUBLIC_BRAND_COUNTRY,
  NEXT_PUBLIC_BRAND_TIME_ZONE: process.env.NEXT_PUBLIC_BRAND_TIME_ZONE,
  NEXT_PUBLIC_BRAND_HQ_NAME: process.env.NEXT_PUBLIC_BRAND_HQ_NAME,
  NEXT_PUBLIC_BRAND_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL,
  NEXT_PUBLIC_BRAND_CONTACT_EMAIL: process.env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL,
  NEXT_PUBLIC_BRAND_BOOKINGS_EMAIL: process.env.NEXT_PUBLIC_BRAND_BOOKINGS_EMAIL,
  NEXT_PUBLIC_BRAND_LEGAL_EMAIL: process.env.NEXT_PUBLIC_BRAND_LEGAL_EMAIL,
  NEXT_PUBLIC_BRAND_PRIVACY_EMAIL: process.env.NEXT_PUBLIC_BRAND_PRIVACY_EMAIL,
  NEXT_PUBLIC_BRAND_CORPORATE_EMAIL: process.env.NEXT_PUBLIC_BRAND_CORPORATE_EMAIL,
})
