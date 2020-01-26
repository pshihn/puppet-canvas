import puppeteer, { Browser } from 'puppeteer';

let _browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!_browser) {
    _browser = await puppeteer.launch({ headless: false });
  }
  return _browser;
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}