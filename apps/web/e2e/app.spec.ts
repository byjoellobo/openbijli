import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Fails the test on any console error, uncaught exception or CSP violation. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

const billTotal = (page: Page) => page.getByRole('article', { name: 'Itemised bill' }).locator('tfoot .amount');

test.describe('Check a bill', () => {
  test('prices the default MESCOM bill and updates as units change', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto('./#/bill');

    await expect(page).toHaveTitle('Check a bill | OpenBijli');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What should your electricity bill be?');
    // 200 kWh at 3 kW: energy 1,160 + fixed 450 + P&G 70 + tax 9% of 1,610 (144.90) = 1,824.90
    await expect(billTotal(page)).toHaveText('₹1,824.90');

    await page.getByLabel('Units used').fill('100');
    // 100 kWh: energy 580 + fixed 450 + P&G 35 + tax 9% of 1,030 (92.70) = 1,157.70
    await expect(billTotal(page)).toHaveText('₹1,157.70');
    expect(errors).toEqual([]);
  });

  test('links every charge to an https source', async ({ page }) => {
    await page.goto('./#/bill');
    const sources = page.getByRole('region', { name: 'Sources' }).locator('ol a');
    await expect(sources.first()).toBeVisible();
    for (const href of await sources.evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href))) {
      expect(href).toMatch(/^https?:\/\//);
    }
  });

  test('switching utility re-prices the bill', async ({ page }) => {
    await page.goto('./#/bill');
    const before = await billTotal(page).textContent();
    await page.getByLabel('Your electricity company').selectOption({ label: 'KSEB, Kerala' });
    await expect(page.getByRole('article', { name: 'Itemised bill' })).toContainText('KSEB');
    await expect(billTotal(page)).not.toHaveText(before ?? '');
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('./#/bill');
    await expect(billTotal(page)).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe('Size rooftop solar', () => {
  test('recommends a system size with cost, saving and payback', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto('./#/solar');
    await expect(page.locator('.verdict')).toContainText(/Install \d+(\.\d+)? kW/);
    const facts = page.locator('dl.facts');
    await expect(facts).toContainText('Cost after subsidy');
    await expect(facts).toContainText('Pays for itself in');
    await expect(page.getByRole('list', { name: /Money left over/ }).getByRole('listitem').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('./#/solar');
    await expect(page.locator('.verdict')).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe('Dispute a bill', () => {
  test('builds the example report in one click', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto('./#/sakshi');
    await expect(page.getByRole('heading', { name: 'Your report will appear here' })).toBeVisible();
    await page.getByRole('button', { name: 'See an example report' }).click();

    await expect(page.getByRole('heading', { name: /findings? to raise with your utility|Nothing that needs action/ })).toBeVisible();
    await expect(page.locator('.finding-list li').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download report' })).toBeEnabled();
    await expect(page.getByTitle('Full evidence report')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('keeps Build report disabled until a log is loaded', async ({ page }) => {
    await page.goto('./#/sakshi');
    await expect(page.getByRole('button', { name: 'Build report' })).toBeDisabled();
    await page.getByRole('button', { name: 'No device yet? Try demo data' }).click();
    await expect(page.getByText('Loaded: sample-log.csv (demo data)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Build report' })).toBeEnabled();
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('./#/sakshi');
    await expectAccessible(page);
  });
});

test.describe('Tariff data', () => {
  test('lists every tariff book and opens the one in the URL', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto('./#/data/ka-kerc');
    await expect(page.getByRole('navigation', { name: 'States' }).getByRole('link')).toHaveCount(9);
    const karnataka = page.locator('#book-ka-kerc');
    await expect(karnataka).toHaveAttribute('open', '');
    await expect(karnataka.getByRole('heading', { name: 'What is missing' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto('./#/data');
    await expectAccessible(page);
  });
});

test.describe('Navigation and shell', () => {
  test('moves between sections and marks the current one', async ({ page }) => {
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Sections' });
    for (const [label, title] of [
      ['Size rooftop solar', 'Size rooftop solar | OpenBijli'],
      ['Dispute a bill', 'Dispute a bill | OpenBijli'],
      ['Tariff data', 'Tariff data | OpenBijli'],
      ['Check a bill', 'Check a bill | OpenBijli'],
    ] as const) {
      await nav.getByRole('link', { name: label }).click();
      await expect(page).toHaveTitle(title);
      await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
    }
  });

  test('ships a Content-Security-Policy and links to the source code', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /script-src 'self'/);
    await expect(page.getByRole('link', { name: 'Source code', exact: true })).toHaveAttribute('href', 'https://github.com/byjoellobo/openbijli');
    await expect(page.getByRole('contentinfo')).toContainText('Tariff data: CC BY 4.0');
  });

  test('offers a skip link to the main content', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard navigation is a desktop concern');
    await page.goto('./');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
  });
});
