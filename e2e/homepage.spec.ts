import { test, expect } from '@playwright/test'

test.describe('Homepage', () => {
  test('loads and shows vehicle search', async ({ page }) => {
    await page.goto('/')
    // "RECI Transport" also appears in the footer — match any instance, we're
    // only checking the brand renders somewhere on the page.
    await expect(page.getByText('RECI Transport').first()).toBeVisible()
    await expect(page.getByText('Available Vehicles')).toBeVisible()
  })

  test('AI search toggle visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Smart Search')).toBeVisible()
    await expect(page.getByText('Filters')).toBeVisible()
  })

  test('switching to filters mode shows filter UI', async ({ page }) => {
    await page.goto('/')
    await page.getByText('Filters').click()
    // AdvancedFilterGrid should render
    await expect(page.locator('select, input[type="text"]').first()).toBeVisible()
  })

  test('cookie banner appears on first visit', async ({ page }) => {
    // Storage is only accessible once the page has an origin — navigate
    // first, then clear, then reload to simulate a fresh first visit.
    await page.goto('/')
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await expect(page.getByRole('dialog', { name: /cookie/i })).toBeVisible()
  })

  test('cookie banner disappears after accept', async ({ page }) => {
    await page.goto('/')
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.getByRole('button', { name: 'Accept' }).click()
    await expect(page.getByRole('dialog', { name: /cookie/i })).not.toBeVisible()
  })

  test('privacy policy page loads', async ({ page }) => {
    await page.goto('/privacy')
    // "Privacy Policy" also appears as a footer link — scope to the page's
    // own heading rather than matching any instance of the text.
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()
    // "GDPR" appears both in a table header and in body copy — match any
    // instance, we're only checking the term appears somewhere.
    await expect(page.getByText('GDPR').first()).toBeVisible()
  })

  test('terms page loads', async ({ page }) => {
    await page.goto('/terms')
    // "Terms of Service" also appears as a footer link — scope to the
    // page's own heading, same as the privacy policy test above.
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible()
  })
})
