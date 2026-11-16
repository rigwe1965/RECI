import { brand } from '@reci/utils'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminShell from '@/components/AdminShell'
import { ThemeProvider } from '@/components/ThemeProvider'
import TopBar from '@/components/TopBar'
import './globals.css'

const SUPABASE_CONFIGURED =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'

export const metadata: Metadata = {
  title: `${brand.shortName} Admin`,
  description: `${brand.name} fleet and operations dashboard.`,
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  let userEmail = ''
  let userRole = ''
  if (SUPABASE_CONFIGURED) {
    try {
      const supabase = await createServerSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      userEmail = user?.email ?? ''
      if (user) {
        const admin = createAdminClient()
        const { data: profile } = await admin
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        userRole = profile?.role ?? ''
      }
    } catch {
      // Not authenticated — middleware will redirect
    }
  }

  const isAuthPage = SUPABASE_CONFIGURED && !userEmail

  return (
    <html lang="en" suppressHydrationWarning>
      {/* Anti-FOUC: set dark class before React hydrates */}
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* nonce is intentionally stripped from the client RSC payload by Next.js
            for security, so it will always mismatch on hydration — harmless, since
            only the server-rendered value needs to match the CSP header. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('reci-theme') ||
              (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            if (t === 'dark') document.documentElement.classList.add('dark');
          } catch(e) {}
        ` }} />
      </head>
      <body className="bg-[#F9FAFB] dark:bg-gray-950 font-sans transition-colors duration-150">
        <ThemeProvider>
          {isAuthPage ? (
            <>
              <TopBar />
              {children}
            </>
          ) : (
            <AdminShell userEmail={userEmail || 'dev@localhost'} userRole={userRole}>
              {children}
            </AdminShell>
          )}
        </ThemeProvider>
      </body>
    </html>
  )
}
