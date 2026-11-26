/**
 * Demo seed: 20 vehicles (5 categories) with images.
 * Run: node seed_demo.mjs
 */
import { getAdminClient } from './scripts/_supabase-admin.mjs'

// Run with: node --env-file=apps/web/.env.local seed_demo.mjs
const supabase = getAdminClient('seed_demo.mjs')

const LOC = 'a1b2c3d4-0000-0000-0000-000000000001'
const CAT = {
  economy:  'c0000000-0000-0000-0000-000000000001',
  compact:  'c0000000-0000-0000-0000-000000000002',
  suv:      'c0000000-0000-0000-0000-000000000003',
  van:      'c0000000-0000-0000-0000-000000000004',
  premium:  'c0000000-0000-0000-0000-000000000005',
}

// ── 1. Ensure base data exists ──────────────────────────────────────────────
const { error: locErr } = await supabase.from('locations').upsert([{
  id: LOC,
  name: 'RECI Transport Berlin HQ',
  address: 'Unter den Linden 1',
  city: 'Berlin', country: 'DE',
  latitude: 52.5170365, longitude: 13.3888599,
}])
if (locErr) { console.error('locations:', locErr.message); process.exit(1) }
console.log('✓ location')

const { error: catErr } = await supabase.from('vehicle_categories').upsert([
  { id: CAT.economy, name: 'Economy',  slug: 'economy',  tier: '1', description: 'Compact and fuel-efficient. Perfect for city driving.',     passenger_capacity: 4, luggage_capacity: 1 },
  { id: CAT.compact, name: 'Compact',  slug: 'compact',  tier: '2', description: 'A little more space without sacrificing economy.',          passenger_capacity: 5, luggage_capacity: 2 },
  { id: CAT.suv,     name: 'SUV',      slug: 'suv',      tier: '3', description: 'Space, comfort, and all-road capability.',                  passenger_capacity: 5, luggage_capacity: 4 },
  { id: CAT.van,     name: 'Van',      slug: 'van',      tier: '4', description: 'Ideal for moves, deliveries, and group transport.',         passenger_capacity: 3, luggage_capacity: 10 },
  { id: CAT.premium, name: 'Premium',  slug: 'premium',  tier: '5', description: 'Executive luxury for business travel and special events.',  passenger_capacity: 5, luggage_capacity: 3 },
])
if (catErr) { console.error('categories:', catErr.message); process.exit(1) }
console.log('✓ categories')

const { error: priceErr } = await supabase.from('pricing_rules').upsert([
  { category_id: CAT.economy, base_rate_per_day: 45.00,  weekly_discount_pct: 10, monthly_discount_pct: 20 },
  { category_id: CAT.compact, base_rate_per_day: 65.00,  weekly_discount_pct: 10, monthly_discount_pct: 20 },
  { category_id: CAT.suv,     base_rate_per_day: 95.00,  weekly_discount_pct:  8, monthly_discount_pct: 18 },
  { category_id: CAT.van,     base_rate_per_day: 120.00, weekly_discount_pct:  8, monthly_discount_pct: 15 },
  { category_id: CAT.premium, base_rate_per_day: 180.00, weekly_discount_pct:  5, monthly_discount_pct: 12 },
], { onConflict: 'category_id,location_id,effective_from', ignoreDuplicates: true })
if (priceErr) { console.error('pricing_rules:', priceErr.message); process.exit(1) }
console.log('✓ pricing')

// Photos live in the demo project's public storage bucket 'demo-vehicles' (CC BY / CC BY-SA, credits in CREDITS.md in the bucket).
// Hotlinked Wikimedia URLs were 404 or throttled, and next/image only allows *.supabase.co.
const photo = (slug) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/demo-vehicles/${slug}.jpg`

// ── 2. 20 demo vehicles ─────────────────────────────────────────────────────
const vehicles = [
  // ECONOMY ─────────────────────────────────────────────────────────────────
  {
    id: 'e0000000-0000-0000-0000-000000000001',
    category_id: CAT.economy, location_id: LOC,
    make: 'Volkswagen', model: 'Polo', year: 2023,
    registration_plate: 'B-RT 1001',
    fuel_type: 'petrol', transmission: 'manual', color: 'Silver', mileage: 12450,
    features: ['Bluetooth', 'USB-C', 'Rear camera'],
    image_urls: [photo('volkswagen-polo')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000002',
    category_id: CAT.economy, location_id: LOC,
    make: 'Toyota', model: 'Yaris', year: 2024,
    registration_plate: 'B-RT 1002',
    fuel_type: 'hybrid', transmission: 'automatic', color: 'White', mileage: 4800,
    features: ['Bluetooth', 'Lane assist', 'Apple CarPlay', 'Android Auto'],
    image_urls: [photo('toyota-yaris')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000021',
    category_id: CAT.economy, location_id: LOC,
    make: 'Renault', model: 'Clio', year: 2024,
    registration_plate: 'B-RT 1003',
    fuel_type: 'petrol', transmission: 'manual', color: 'Red', mileage: 6200,
    features: ['Bluetooth', 'USB-C', 'Climate control', 'Rear camera'],
    image_urls: [photo('renault-clio')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000022',
    category_id: CAT.economy, location_id: LOC,
    make: 'Opel', model: 'Corsa-e', year: 2024,
    registration_plate: 'B-RT 1004',
    fuel_type: 'electric', transmission: 'automatic', color: 'Blue', mileage: 2100,
    features: ['Bluetooth', 'Apple CarPlay', 'Android Auto', 'Heated seats', 'One-pedal driving'],
    image_urls: [photo('opel-corsa-e')],
  },

  // COMPACT ─────────────────────────────────────────────────────────────────
  {
    id: 'e0000000-0000-0000-0000-000000000003',
    category_id: CAT.compact, location_id: LOC,
    make: 'Volkswagen', model: 'Golf', year: 2023,
    registration_plate: 'B-RT 2001',
    fuel_type: 'petrol', transmission: 'automatic', color: 'Black', mileage: 18200,
    features: ['Bluetooth', 'Cruise control', 'Parking sensors', 'Apple CarPlay'],
    image_urls: [photo('volkswagen-golf')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000004',
    category_id: CAT.compact, location_id: LOC,
    make: 'SEAT', model: 'Leon', year: 2024,
    registration_plate: 'B-RT 2002',
    fuel_type: 'diesel', transmission: 'manual', color: 'Grey', mileage: 9100,
    features: ['Bluetooth', 'USB-C', 'Rear camera', 'Climate control'],
    image_urls: [photo('seat-leon')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000023',
    category_id: CAT.compact, location_id: LOC,
    make: 'BMW', model: '118i', year: 2024,
    registration_plate: 'B-RT 2003',
    fuel_type: 'petrol', transmission: 'automatic', color: 'Alpine White', mileage: 5400,
    features: ['Bluetooth', 'Apple CarPlay', 'Android Auto', 'Adaptive cruise', 'Parking assist'],
    image_urls: [photo('bmw-118i')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000024',
    category_id: CAT.compact, location_id: LOC,
    make: 'Audi', model: 'A3 Sportback', year: 2023,
    registration_plate: 'B-RT 2004',
    fuel_type: 'diesel', transmission: 'automatic', color: 'Navarra Blue', mileage: 11600,
    features: ['Bluetooth', 'Virtual Cockpit', 'Apple CarPlay', 'Lane assist', 'Heated seats'],
    image_urls: [photo('audi-a3-sportback')],
  },

  // SUV ─────────────────────────────────────────────────────────────────────
  {
    id: 'e0000000-0000-0000-0000-000000000005',
    category_id: CAT.suv, location_id: LOC,
    make: 'Volkswagen', model: 'Tiguan', year: 2023,
    registration_plate: 'B-RT 3001',
    fuel_type: 'diesel', transmission: 'automatic', color: 'Deep Black', mileage: 22300,
    features: ['Bluetooth', 'Navigation', 'Panoramic roof', 'Heated seats', '4WD'],
    image_urls: [photo('volkswagen-tiguan')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000006',
    category_id: CAT.suv, location_id: LOC,
    make: 'Toyota', model: 'RAV4', year: 2024,
    registration_plate: 'B-RT 3002',
    fuel_type: 'hybrid', transmission: 'automatic', color: 'Pearl White', mileage: 8700,
    features: ['Bluetooth', 'Apple CarPlay', 'Android Auto', 'Adaptive cruise', 'Heated seats'],
    image_urls: [photo('toyota-rav4')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000025',
    category_id: CAT.suv, location_id: LOC,
    make: 'BMW', model: 'X3', year: 2024,
    registration_plate: 'B-RT 3003',
    fuel_type: 'petrol', transmission: 'automatic', color: 'Black Sapphire', mileage: 7800,
    features: ['Bluetooth', 'Navigation', 'Panoramic sunroof', 'Harman Kardon audio', 'Heated seats', 'AWD'],
    image_urls: [photo('bmw-x3')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000026',
    category_id: CAT.suv, location_id: LOC,
    make: 'Mercedes-Benz', model: 'GLC 220d', year: 2024,
    registration_plate: 'B-RT 3004',
    fuel_type: 'diesel', transmission: 'automatic', color: 'Polar White', mileage: 9500,
    features: ['Bluetooth', 'MBUX infotainment', 'Apple CarPlay', 'Burmester audio', 'Heated seats', '4MATIC'],
    image_urls: [photo('mercedes-benz-glc-220d')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000027',
    category_id: CAT.suv, location_id: LOC,
    make: 'Audi', model: 'Q5', year: 2023,
    registration_plate: 'B-RT 3005',
    fuel_type: 'diesel', transmission: 'automatic', color: 'Glacier White', mileage: 14200,
    features: ['Bluetooth', 'Virtual Cockpit', 'Matrix LED lights', 'Bang & Olufsen audio', 'Quattro AWD'],
    image_urls: [photo('audi-q5')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000028',
    category_id: CAT.suv, location_id: LOC,
    make: 'Volvo', model: 'XC60', year: 2024,
    registration_plate: 'B-RT 3006',
    fuel_type: 'hybrid', transmission: 'automatic', color: 'Crystal White', mileage: 6300,
    features: ['Bluetooth', 'Google built-in', 'Pilot Assist', 'Bowers & Wilkins audio', 'Air suspension'],
    image_urls: [photo('volvo-xc60')],
  },

  // VAN ─────────────────────────────────────────────────────────────────────
  {
    id: 'e0000000-0000-0000-0000-000000000007',
    category_id: CAT.van, location_id: LOC,
    make: 'Mercedes-Benz', model: 'Sprinter', year: 2022,
    registration_plate: 'B-RT 4001',
    fuel_type: 'diesel', transmission: 'manual', color: 'White', mileage: 45600,
    features: ['Bluetooth', 'Rear camera', 'Loading ramp', 'Bulkhead'],
    image_urls: [photo('mercedes-benz-sprinter')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000008',
    category_id: CAT.van, location_id: LOC,
    make: 'Ford', model: 'Transit', year: 2023,
    registration_plate: 'B-RT 4002',
    fuel_type: 'diesel', transmission: 'automatic', color: 'Silver', mileage: 31200,
    features: ['Bluetooth', 'Rear camera', 'Cruise control', 'Tow bar'],
    image_urls: [photo('ford-transit')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000029',
    category_id: CAT.van, location_id: LOC,
    make: 'Volkswagen', model: 'Transporter T6.1', year: 2024,
    registration_plate: 'B-RT 4003',
    fuel_type: 'diesel', transmission: 'manual', color: 'Reflex Silver', mileage: 13800,
    features: ['Bluetooth', 'App-Connect', 'Rear camera', 'Sliding door both sides', 'Long wheelbase'],
    image_urls: [photo('volkswagen-transporter-t6-1')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000030',
    category_id: CAT.van, location_id: LOC,
    make: 'Renault', model: 'Trafic', year: 2023,
    registration_plate: 'B-RT 4004',
    fuel_type: 'diesel', transmission: 'automatic', color: 'Arctic White', mileage: 19700,
    features: ['Bluetooth', 'Rear camera', 'Lane departure warning', 'Emergency brake assist'],
    image_urls: [photo('renault-trafic')],
  },

  // PREMIUM ─────────────────────────────────────────────────────────────────
  {
    id: 'e0000000-0000-0000-0000-000000000031',
    category_id: CAT.premium, location_id: LOC,
    make: 'Mercedes-Benz', model: 'E 300', year: 2024,
    registration_plate: 'B-RT 5001',
    fuel_type: 'petrol', transmission: 'automatic', color: 'Obsidian Black', mileage: 4200,
    features: ['Bluetooth', 'MBUX', 'Burmester 3D audio', 'Massaging seats', 'Ambient lighting', 'Head-up display', 'Night vision'],
    image_urls: [photo('mercedes-benz-e-300')],
  },
  {
    id: 'e0000000-0000-0000-0000-000000000032',
    category_id: CAT.premium, location_id: LOC,
    make: 'BMW', model: '520d', year: 2024,
    registration_plate: 'B-RT 5002',
    fuel_type: 'diesel', transmission: 'automatic', color: 'Mineral White', mileage: 5900,
    features: ['Bluetooth', 'iDrive 8.5', 'Bowers & Wilkins audio', 'Heated & ventilated seats', 'Gesture control', 'Active suspension'],
    image_urls: [photo('bmw-520d')],
  },
]

const { error: vErr } = await supabase.from('vehicles').upsert(vehicles)
if (vErr) { console.error('vehicles:', vErr.message); process.exit(1) }
console.log(`✓ ${vehicles.length} vehicles`)

// ── 3. Extras ───────────────────────────────────────────────────────────────
// extras are matched by name (unique since migration 016; the id is random): update the ones that exist, insert the missing ones.
const extraRows = [
  { name: 'Basic Insurance',     description: 'Third-party liability. Required minimum.',           price_per_day:   0.00, is_one_time_fee: false, exclusive_group: 'insurance', sort_order: 1 },
  { name: 'Full Insurance',      description: 'Zero-excess comprehensive cover.',                   price_per_day:  18.00, is_one_time_fee: false, exclusive_group: 'insurance', sort_order: 2 },
  { name: 'GPS Navigation',      description: 'Portable Garmin satnav, updated maps.',             price_per_day:   8.00, is_one_time_fee: false, exclusive_group: null,        sort_order: 3 },
  { name: 'Baby Seat',           description: 'Rear-facing infant seat.',                          price_per_day:  10.00, is_one_time_fee: false, exclusive_group: null,        sort_order: 4 },
  { name: 'Child Seat',          description: 'Forward-facing child seat.',                        price_per_day:  10.00, is_one_time_fee: false, exclusive_group: null,        sort_order: 5 },
  { name: 'Additional Driver',   description: 'Register a second driver on the booking.',          price_per_day:  15.00, is_one_time_fee: false, exclusive_group: null,        sort_order: 6 },
  { name: 'Fuel Option',         description: 'Return empty — we refuel at market rate.',          price_per_day:  45.00, is_one_time_fee: true,  exclusive_group: null,        sort_order: 7 },
  { name: 'Chauffeur',           description: 'Professional driver for the full duration.',        price_per_day: 120.00, is_one_time_fee: false, exclusive_group: null,        sort_order: 8 },
  { name: 'Wi-Fi Hotspot',       description: 'In-car 4G/LTE hotspot. Unlimited data.',           price_per_day:   5.00, is_one_time_fee: false, exclusive_group: null,        sort_order: 9 },
  { name: 'Ski Rack',            description: 'Roof-mounted ski and snowboard carrier.',           price_per_day:  12.00, is_one_time_fee: false, exclusive_group: null,        sort_order: 10 },
]
const { data: haveExtras, error: haveErr } = await supabase.from('extras').select('name')
let exErr = haveErr
if (!exErr) {
  const have = new Set((haveExtras ?? []).map((e) => e.name))
  const missing = extraRows.filter((e) => !have.has(e.name))
  // 23505 = another seed run inserted the same name a moment ago (the unique rule of migration 016): that is fine, the update below sets it.
  if (missing.length) { exErr = (await supabase.from('extras').insert(missing)).error; if (exErr?.code === '23505') exErr = null }
  for (const e of extraRows.filter((x) => have.has(x.name))) {
    if (exErr) break
    exErr = (await supabase.from('extras').update(e).eq('name', e.name)).error
  }
}
if (exErr) { console.error('extras:', exErr.message); process.exit(1) }
console.log('✓ extras')

console.log('\n✅ Demo seed complete — 20 vehicles across 5 categories ready.')
