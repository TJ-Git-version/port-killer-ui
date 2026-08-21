'use strict';

/**
 * 界面截图验证脚本（仅用于开发验证，不会真正关闭任何进程）
 * 运行：node scripts/screenshot.js
 */

const { _electron: electron } = require('playwright-core');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const shot = (name) => path.join(appRoot, 'shots', name);

(async () => {
  const app = await electron.launch({ args: [appRoot] });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(900);

  // 1. 初始空状态
  await win.screenshot({ path: shot('01-empty.png') });

  // 2. 查询真实端口 135（仅查询，不关闭）
  await win.fill('#portInput', '135');
  await win.click('#queryBtn');
  await win.waitForTimeout(1800);
  await win.screenshot({ path: shot('02-result.png') });

  const count = await win.textContent('#resultCount');
  console.log('resultCount:', count);

  // 3. 全选 + 打开确认弹窗（点取消，绝不确认）
  await win.click('#selectAllBtn');
  await win.waitForTimeout(350);
  await win.screenshot({ path: shot('03-selected.png') });

  await win.click('#killBtn');
  await win.waitForTimeout(450);
  await win.screenshot({ path: shot('04-modal.png') });
  await win.click('#modalCancelBtn');
  await win.waitForTimeout(300);

  const admin = await win.textContent('#adminBadge');
  console.log('adminBadge:', admin);

  await app.close();
  console.log('screenshots done');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
