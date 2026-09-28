import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin-server'
import { getUserFromRequest } from '@/lib/supabase/server'

// Verify decoded bytes actually match the declared MIME type — the data URL
// prefix is client-supplied and otherwise trusted as a label, not content.
function matchesDeclaredImageType(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (mimeType === 'image/png') {
    const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return buffer.length >= 8 && PNG_MAGIC.every((byte, i) => buffer[i] === byte)
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
  }
  return false
}

export async function POST(request: NextRequest) {
  const { user } = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { booking_id?: string; inspection_type?: string; angle?: string; data_url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { booking_id, inspection_type, angle, data_url } = body
  if (!booking_id || !inspection_type || !angle || !data_url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const allowedAngles = ['front', 'back', 'left', 'right']
  const allowedTypes = ['pickup', 'return']
  if (!allowedAngles.includes(angle) || !allowedTypes.includes(inspection_type)) {
    return NextResponse.json({ error: 'Invalid angle or inspection_type' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Verify booking belongs to user
  const { data: booking } = await supabase
    .from('bookings')
    .select('id')
    .eq('id', booking_id)
    .eq('user_id', user.id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Decode base64 data URL
  const matches = data_url.match(/^data:(image\/[\w+]+);base64,(.+)$/)
  if (!matches) return NextResponse.json({ error: 'Invalid data URL format' }, { status: 400 })

  const [, mimeType, base64Data] = matches
  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
  if (!ALLOWED_MIME.includes(mimeType)) {
    return NextResponse.json({ error: 'Invalid image type. Use JPEG, PNG, or WebP.' }, { status: 400 })
  }

  if (base64Data.length > 10_000_000) {
    return NextResponse.json({ error: 'Image too large. Maximum ~7.5MB.' }, { status: 413 })
  }

  const buffer = Buffer.from(base64Data, 'base64')

  if (!matchesDeclaredImageType(buffer, mimeType)) {
    return NextResponse.json({ error: 'File content does not match declared image type.' }, { status: 400 })
  }

  const EXT_MAP: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  const ext = EXT_MAP[mimeType] ?? 'jpg'
  const path = `${booking_id}/${inspection_type}/${angle}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('vehicle-inspections')
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    })

  if (uploadError) {
    console.error('[inspections/upload] Storage error:', uploadError)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  // Get a signed URL valid for 7 days (for AI vision calls)
  const { data: signed } = await supabase.storage
    .from('vehicle-inspections')
    .createSignedUrl(path, 60 * 60 * 24 * 7)

  if (!signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate signed URL' }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}
