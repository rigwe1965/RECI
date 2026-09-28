import { createClient } from '@supabase/supabase-js'

// Run with: node --env-file=.env.local patch_old_images.mjs
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env.local patch_old_images.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=80`

const patches = [
  { id: 'e0000000-0000-0000-0000-000000000011', image_urls: [U('1568605117036-5fe5e7bab0b7')] }, // Opel Corsa - economy red car
  { id: 'e0000000-0000-0000-0000-000000000012', image_urls: [U('1494976388531-d1058494cdd8')] }, // Skoda Octavia - compact
  { id: 'e0000000-0000-0000-0000-000000000013', image_urls: [U('1580273916550-e323be2ae537')] }, // Hyundai Tucson - SUV
  { id: 'e0000000-0000-0000-0000-000000000014', image_urls: [U('1558618666-fcd25c85cd64')] },   // VW Crafter - van
]

for (const { id, image_urls } of patches) {
  const { error } = await supabase.from('vehicles').update({ image_urls }).eq('id', id)
  if (error) console.error(`✗ ${id}: ${error.message}`)
  else console.log(`✓ ${id}`)
}
console.log('Done.')
