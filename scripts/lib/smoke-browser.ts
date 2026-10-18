import { chromium, expect } from '@playwright/test';
import { join } from 'node:path';

/** Exercise the real signed-in UI using an admin-generated synthetic email link.
 * The link is never logged, and no email is sent. */
export async function smokeBrowser(actionLink: string, workspace: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);
  let pageErrors = 0;
  page.on('pageerror', () => {
    pageErrors++;
  });
  try {
    await page.goto(actionLink, { waitUntil: 'domcontentloaded' }).catch(() => {
      throw new Error('Synthetic browser email-link navigation failed');
    });
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByRole('heading', { name: 'Recent opportunities' })).toBeVisible();
    await page.getByRole('button', { name: 'Master Profile', exact: true }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('Alex Example');
    await expect(page.getByLabel('Title / degree / skill')).toHaveValue('Synthetic Queue Service');
    await page.getByRole('button', { name: 'Resume Workspace', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Software Engineer.' })).toBeVisible();
    await page.getByRole('tab', { name: 'Fit & evidence', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Evidence fit', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Resume', exact: true }).click();
    const pdfResponse = page.waitForResponse((r) => r.url().includes('/storage/v1/object/sign/'));
    await page.getByRole('button', { name: 'Open / refresh PDF preview', exact: true }).click();
    await expect(page.getByTitle('Private resume PDF preview')).toBeVisible();
    const response = await pdfResponse;
    expect(response.status()).toBe(200);
    console.log('Browser PDF preview response received.');
    await expect(page.getByText('Saving changes…', { exact: true })).not.toBeVisible();
    for (const [name, extension] of [
      ['PDF', 'pdf'],
      ['LaTeX', 'tex'],
      ['JSON', 'json'],
    ]) {
      const file = page.waitForEvent('download');
      await page.getByRole('button', { name, exact: true }).click();
      expect((await file).suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
    }
    console.log('Browser PDF, LaTeX, and JSON download controls passed.');
    await page.screenshot({ path: join(workspace, 'workspace-browser.png'), fullPage: true });
    const bullet = page.getByLabel('Resume bullet', { exact: true }).first();
    const original = await bullet.inputValue();
    const edited = original.endsWith('.') ? original.slice(0, -1) + ';' : original + '.';
    await bullet.fill(edited);
    await page.getByRole('button', { name: 'Save as new version', exact: true }).click();
    await expect(
      page.getByText('New version saved. Render it with the companion for an updated PDF.'),
    ).toBeVisible();
    await page.getByRole('tab', { name: /^Versions/ }).click();
    await expect(page.locator('.version-row')).toHaveCount(3);
    await page.getByRole('button', { name: 'Compare', exact: true }).last().click();
    await expect(
      page.getByRole('heading', { name: 'Compared version', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Restore', exact: true }).last().click();
    await expect(page.locator('.version-row')).toHaveCount(4);
    await page.getByRole('button', { name: /^Applications(?: \d+)?$/ }).click();
    await expect(page.getByRole('combobox', { name: /^Application stage/ })).toHaveValue('Applied');
    await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue(
      'Synthetic smoke only',
    );
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Applications(?: \d+)?$/ }).click();
    await expect(page.getByRole('combobox', { name: /^Application stage/ })).toHaveValue('Applied');
    await page.getByRole('button', { name: 'Agent & Settings', exact: true }).click();
    await expect(page.getByText('Synthetic smoke companion', { exact: true })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export account data', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('ResumeForge_private_data_export.json');
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByText('No companion paired yet', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => {
        const box = await page.locator('.sidebar').boundingBox();
        return box ? box.x + box.width : 0;
      })
      .toBeLessThanOrEqual(1);
    await page.screenshot({ path: join(workspace, 'settings-mobile-browser.png'), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(pageErrors).toBe(0);
    console.log(
      'Live browser sign-in, profile display, evidence, PDF preview, editing, compare/restore, application persistence, export, and disconnect passed.',
    );
  } finally {
    await browser.close();
  }
}
