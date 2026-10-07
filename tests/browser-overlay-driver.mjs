import { chromium } from 'playwright-core';
const [executablePath, url] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 10000 });
  await page.waitForSelector('#result', { timeout: 5000 });
  const result = await page.locator('#result').textContent();
  console.log(result);
  if (!result.startsWith('PASS ')) process.exitCode = 1;
} finally {
  await browser.close();
}
