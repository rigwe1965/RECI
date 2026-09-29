import { test, expect } from '@playwright/test'

test.describe('Booking flow', () => {
  test('vehicle card links to detail page', async ({ page }) => {
    await page.goto('/')
    // Wait for vehicles to load
    const firstCard = page.locator('[href^="/vehicles/"]').first()
    await expect(firstCard).toBeVisible({ timeout: 10_000 })
    await firstCard.click()
    // expect(page.url()) reads the URL once and doesn't wait for the
    // client-side navigation the click triggers — toHaveURL polls instead.
    await expect(page).toHaveURL(/\/vehicles\//, { timeout: 10_000 })
  })

  test('vehicle detail page has Book Now button', async ({ page }) => {
    await page.goto('/')
    const firstCard = page.locator('[href^="/vehicles/"]').first()
    await expect(firstCard).toBeVisible({ timeout: 10_000 })
    await firstCard.click()
    // Each grid card also has its own "Book Now" quick-book button, so
    // checking for the role before navigation completes matches 24 of them
    // (strict-mode violation) instead of the one on the detail page.
    await expect(page).toHaveURL(/\/vehicles\//, { timeout: 10_000 })
    await expect(page.getByRole('link', { name: /book now/i })).toBeVisible({ timeout: 10_000 })
  })

  test('unauthenticated user redirected to login from /account', async ({ page }) => {
    await page.goto('/account/bookings')
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
