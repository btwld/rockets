import { expect, test } from '@playwright/test';

const email = process.env.PLAYWRIGHT_TEST_EMAIL?.trim();
const password = process.env.PLAYWRIGHT_TEST_PASSWORD;

test.describe('Profile — userMetadata', () => {
  test.skip(
    !email || !password,
    'Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD',
  );

  test('updates firstName and lastName via PATCH /me', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(email!);
    await page.getByTestId('login-password').fill(password!);

    const mePatch = page.waitForResponse(
      (res) =>
        res.url().includes('/me') &&
        res.request().method() === 'PATCH' &&
        res.status() === 200,
    );

    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/');

    await page.getByTestId('nav-profile').click();
    await expect(page).toHaveURL('/profile');

    await page.getByTestId('profile-first-name').fill('Playwright');
    await page.getByTestId('profile-last-name').fill('Tester');
    await page.getByTestId('profile-save').click();

    await mePatch;

    await expect(page.getByTestId('profile-success')).toBeVisible();

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByTestId('dashboard-profile-name')).toHaveText(
      'Playwright Tester',
    );
  });
});
