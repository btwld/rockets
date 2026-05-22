import { expect, test } from '@playwright/test';

const email = process.env.PLAYWRIGHT_TEST_EMAIL?.trim();
const password = process.env.PLAYWRIGHT_TEST_PASSWORD;

test.describe('Firebase login → API /me → dashboard', () => {
  test.skip(
    !email || !password,
    'Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD to run browser e2e',
  );

  test('signs in and loads account without auth error', async ({ page }) => {
    const meResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/me') &&
        res.request().method() === 'GET' &&
        res.request().headers()['authorization']?.startsWith('Bearer '),
    );

    await page.goto('/login');
    await expect(page.getByTestId('login-title')).toHaveText('Code Review');

    await page.getByTestId('login-email').fill(email!);
    await page.getByTestId('login-password').fill(password!);
    await page.getByTestId('login-submit').click();

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('dashboard-title')).toBeVisible();

    const me = await meResponse;
    expect(me.status()).toBe(200);

    const meJson = (await me.json()) as { email?: string; id?: string };
    expect(meJson.email ?? meJson.id).toBeTruthy();

    await expect(page.getByTestId('dashboard-firebase-email')).toContainText(
      meJson.email ?? email!,
    );
    await expect(page.getByTestId('dashboard-error')).toHaveCount(0);
  });
});
