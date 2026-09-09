import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function raw(page: Page) {
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'Raw Markdown', exact: true });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  return page.getByRole('textbox', { name: 'Content', exact: true });
}
async function interactive(page: Page) {
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'Raw Markdown', exact: true });
  if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('Editor defaults to interactive, raw is toggleable, and Preview is separate', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: 'Editor', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Split view', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Raw Markdown', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Editable table' })).toBeVisible();
  const source = await raw(page);
  const original = await source.inputValue();
  await interactive(page);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Raw Markdown', exact: true })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Editable table' })).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Markdown preview' }).getByRole('table'),
  ).toBeVisible();
  await expect(await raw(page)).toHaveValue(original);
});

test('headings and paragraphs can be edited inline, formatted and saved', async ({ page }) => {
  const source = await raw(page);
  await source.fill('## Original heading\n\nOriginal paragraph\n\nKeep this exactly.');
  await interactive(page);
  await page.getByRole('button', { name: 'Edit heading: Original heading' }).click();
  await page.getByRole('textbox', { name: 'Edit heading', exact: true }).fill('Updated heading');
  await page.getByRole('button', { name: 'Edit text: Original paragraph' }).click();
  const text = page.getByRole('textbox', { name: 'Edit text', exact: true });
  await text.fill('New paragraph');
  await text.selectText();
  await page.getByRole('button', { name: 'Bold (Ctrl or Command+B)', exact: true }).click();
  await expect(text).toHaveValue('**New paragraph**');
  await page.getByRole('button', { name: 'Save demo draft', exact: true }).click();
  await expect(page.getByText('Demo draft saved in memory.')).toBeVisible();
  await expect(await raw(page)).toHaveValue(
    '## Updated heading\n\n**New paragraph**\n\nKeep this exactly.',
  );
  await interactive(page);
  await page.getByRole('button', { name: '+ Content', exact: true }).click();
  await page.getByRole('textbox', { name: 'Edit text', exact: true }).fill('Another paragraph');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Markdown preview' })).toContainText(
    'Another paragraph',
  );
});

test('quick picker inserts an interactive table with alignment and undo', async ({ page }) => {
  await (await raw(page)).fill('');
  await interactive(page);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: 'Insert 3 columns and 3 rows', exact: true }).click();
  const table = page.getByRole('table', { name: 'Editable table' });
  await expect(table.getByLabel('Column 1 header')).toBeFocused();
  await table.getByLabel('Column 1 header').fill('Plan');
  await table.getByLabel('Column 2 header').fill('Price');
  await table.getByLabel('Row 1, column 1', { exact: true }).fill('Basic | Monthly');
  await table.getByLabel('Row 1, column 2', { exact: true }).fill('$10');
  await page.getByLabel('Selected column alignment').focus();
  await page.getByLabel('Selected column alignment').selectOption('right');
  await table.getByLabel('Row 1, column 2', { exact: true }).fill('$20');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(table.getByLabel('Row 1, column 2', { exact: true })).toHaveValue('$10');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(table.getByLabel('Row 1, column 2', { exact: true })).toHaveValue('$20');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Basic | Monthly' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '$20' })).toHaveCSS('text-align', 'right');
  await expect(await raw(page)).toHaveValue(/Basic \\\| Monthly/);
});

test('heading dropdown changes all six levels and keeps inline drafts and other blocks', async ({
  page,
}) => {
  await (await raw(page)).fill('Original paragraph\n\nKeep **this** exactly.');
  await interactive(page);
  await page.getByRole('button', { name: 'Edit text: Original paragraph' }).click();
  await page.getByRole('textbox', { name: 'Edit text', exact: true }).fill('Updated title');
  const dropdown = page.getByRole('combobox', { name: 'Heading level' });
  for (let level = 1; level <= 6; level++) {
    if (level > 1) {
      await interactive(page);
      await page.getByRole('button', { name: 'Edit heading: Updated title' }).click();
    }
    await dropdown.focus();
    await dropdown.selectOption(String(level));
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Updated title', level })).toBeVisible();
    await expect(dropdown).toBeDisabled();
    await expect(await raw(page)).toHaveValue(
      `${'#'.repeat(level)} Updated title\n\nKeep **this** exactly.`,
    );
  }
  await interactive(page);
  await page.getByRole('button', { name: 'Test read-only', exact: true }).click();
  await expect(dropdown).toBeDisabled();
});

test('heading dropdown preserves raw selection and supports keyboard undo', async ({ page }) => {
  const source = await raw(page);
  await source.fill('Before\n\n## Selected title\n\nAfter');
  await source.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(15, 20));
  const dropdown = page.getByRole('combobox', { name: 'Heading level' });
  await dropdown.focus();
  await dropdown.selectOption('6');
  await expect(source).toHaveValue('Before\n\n###### Selected title\n\nAfter');
  await expect(source).toBeFocused();
  await source.press('ControlOrMeta+z');
  await expect(source).toHaveValue('Before\n\n## Selected title\n\nAfter');
});

test('row and column changes work in the default editor and preserve other tables', async ({
  page,
}) => {
  const first = '| First |\n| --- |\n| original |';
  await (
    await raw(page)
  ).fill('Before\n\n' + first + '\n\n| Second |\n| --- |\n| existing |\n\nAfter');
  await interactive(page);
  const tables = page.getByRole('table', { name: 'Editable table' });
  await tables.nth(1).getByLabel('Row 1, column 1', { exact: true }).fill('Two words');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: '+ Column', exact: true }).nth(1).click();
  await expect(tables.nth(1).getByRole('columnheader')).toHaveCount(2);
  await page.getByRole('button', { name: '− Column', exact: true }).nth(1).click();
  await expect(tables.nth(1).getByRole('columnheader')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(tables.nth(1).getByLabel('Row 1, column 1', { exact: true })).toHaveValue(
    'Two words',
  );
  const source = await raw(page);
  await expect(source).toHaveValue(new RegExp('Before'));
  expect(await source.inputValue()).toContain(first);
  expect(await source.inputValue()).toMatch(/After$/);
});

test('raw changes update interactive content, insertion stays raw, and preview stays safe', async ({
  page,
}) => {
  const source = await raw(page);
  await source.fill('Raw content');
  await source.press('ControlOrMeta+End');
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: 'Insert 2 columns and 2 rows', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Raw Markdown', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(source).toHaveValue(/\| --- \| --- \|/);
  await interactive(page);
  await expect(page.getByRole('button', { name: 'Edit text: Raw content' })).toBeVisible();
  await (
    await raw(page)
  ).fill(
    '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[bad](javascript:alert%281%29)\n\n| Safe |\n| --- |\n| yes |',
  );
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Markdown preview' });
  await expect(preview.locator('script, img, [href^="javascript:"]')).toHaveCount(0);
  await expect(preview.getByRole('cell', { name: 'yes', exact: true })).toBeVisible();
});

test('keyboard picker, cancellation, empty validation and read-only states', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Table', exact: true });
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('button', { name: 'Insert 4 columns and 4 rows', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await (await raw(page)).fill('');
  await interactive(page);
  await page.getByRole('textbox', { name: 'Edit text', exact: true }).fill('Discard me');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save demo draft', exact: true }).click();
  await expect(page.getByText('Add some content before saving.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Edit text', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Edit text', exact: true }).fill('Saved content');
  await page.getByRole('button', { name: 'Save demo draft', exact: true }).click();
  await page.getByRole('button', { name: 'Test read-only', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Edit text:/ })).toHaveCount(0);
  await expect(await raw(page)).toBeDisabled();
});

test('full width editor and accessible controls on mobile in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('dialog', { name: 'Choose table size' }).evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await raw(page);
  await expect(page.getByRole('dialog', { name: 'Choose table size' })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
