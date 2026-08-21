'use strict';

/**
 * 验证打包后的应用（dist/win-unpacked/PortKiller.exe）
 * 运行：node scripts/verify-packaged.js
 */

const { _electron: electron } = require('playwright-core');
const path = require('path');

const exe = path.join(__dirname, '..', 'dist', 'win-unpacked', 'PortKiller.exe');

(async () => {
  const app = await electron.launch({ executablePath: exe });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(900);

  const title = await win.title();
  console.log('window title:', title);

  const emptyVisible = await win.isVisible('#emptyState');
  console.log('empty state visible:', emptyVisible);

  // 查询真实端口 135（仅查询，不关闭）
  await win.fill('#portInput', '135');
  await win.click('#queryBtn');
  await win.waitForTimeout(2000);
  const rows = await win.locator('#processBody tr').count();
  const countText = await win.textContent('#resultCount');
  console.log('rows:', rows, '| resultCount:', countText);

  if (rows > 0) {
    const firstRow = await win.locator('#processBody tr').first().innerText();
    console.log('first row:', firstRow.replace(/\n/g, ' | '));
  }

  await win.screenshot({ path: path.join(__dirname, '..', 'dist', 'packaged-check.png') });
  console.log('screenshot saved to dist/packaged-check.png');

  await app.close();
  console.log(rows > 0 ? 'PACKAGED APP OK' : 'PACKAGED APP FAILED (no rows)');
  process.exit(rows > 0 ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
