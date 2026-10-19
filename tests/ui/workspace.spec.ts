import { test, expect } from '@playwright/test';

test('unconfigured app provides honest empty states and usable forms', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('heading', { name: 'Your workspace.' })).toBeVisible();
  await expect(page.getByText('Setup needed: connect Supabase')).toBeVisible();
  await page.getByRole('button', { name: 'Master Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Add your first record', exact: true }).click();
  await page.getByLabel('Title / degree / skill').fill('Synthetic test record');
  await page.getByText('I reviewed this record and approve these facts').click();
  await expect(page.getByText('1 approved records')).toBeVisible();
  await page
    .getByLabel('Responsibilities & your personal contributions')
    .fill('Changed synthetic fact');
  await expect(page.getByText('0 approved records')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save profile', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'New Job', exact: true }).click();
  await expect(page.getByLabel('Full job description')).toBeVisible();
  await expect(page.getByText('the posting is not imported')).toBeVisible();
  await page.getByRole('button', { name: 'Resume Workspace', exact: true }).click();
  await expect(page.getByText('Your first resume starts with a job')).toBeVisible();
  await page.getByRole('button', { name: 'Agent & Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve device' })).toBeDisabled();
  const response = await request.get('/api/workspace');
  expect(response.status()).toBe(401);
  expect((await response.json()).code).toBe('SIGN_IN_REQUIRED');
  const device = await request.post('/api/device/claim', { data: {} });
  expect(device.status()).toBe(401);
});
test('mobile navigation and sign-in setup are accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Applications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your applications.' })).toBeVisible();
  await page.getByRole('button', { name: 'View setup' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close sign in' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
