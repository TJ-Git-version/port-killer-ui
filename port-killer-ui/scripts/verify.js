'use strict';

/**
 * DOM 级界面验证（配合截图一起确认 UI 正确渲染）
 * 运行：node scripts/verify.js
 */

const { _electron: electron } = require('playwright-core');
const path = require('path');

const appRoot = path.join(__dirname, '..');

(async () => {
  const app = await electron.launch({ args: [appRoot] });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(700);

  // 重置本地状态，让主题回退到系统默认（避免上次运行残留影响验证）
  await win.evaluate(() => localStorage.clear());
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(700);

  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok, detail });

  // 1. 初始空状态可见
  const emptyVisible = await win.isVisible('#emptyState');
  check('初始空状态可见', emptyVisible, `emptyVisible=${emptyVisible}`);

  // 2. 顶栏标题
  const title = await win.textContent('.brand-text h1');
  check('标题正确', title.includes('端口占用关闭工具'), `title=${title}`);

  // 3. 查询按钮与输入框
  check('查询按钮可见', await win.isVisible('#queryBtn'), '');
  check('输入框可见', await win.isVisible('#portInput'), '');

  // 4. 背景与当前主题匹配（body 计算样式）
  const themeNow = await win.evaluate(() => document.documentElement.dataset.theme);
  const bodyBg = await win.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bgDark = bodyBg.includes('11, 13, 20');
  const bgLight = bodyBg.includes('238, 241, 248');
  check('背景与主题匹配', (themeNow === 'dark' && bgDark) || (themeNow === 'light' && bgLight), `theme=${themeNow} bodyBg=${bodyBg}`);

  // 5. 卡片圆角
  const radius = await win.evaluate(() => getComputedStyle(document.querySelector('.card')).borderRadius);
  check('卡片圆角', radius !== '0px', `radius=${radius}`);

  // 6. 查询真实端口 135
  await win.fill('#portInput', '135');
  await win.click('#queryBtn');
  await win.waitForTimeout(1800);
  const rows = await win.locator('#processBody tr').count();
  check('查询后出现结果行', rows > 0, `rows=${rows}`);
  if (rows > 0) {
    const firstRow = await win.locator('#processBody tr').first().innerText();
    check('结果行包含 PID 与进程名', /\d/.test(firstRow) && firstRow.length > 3, `firstRow=${firstRow.replace(/\n/g, ' | ')}`);
  }
  const emptyHidden = await win.evaluate(() => document.getElementById('emptyState').classList.contains('hidden'));
  check('查询后空状态隐藏', emptyHidden, `emptyHidden=${emptyHidden}`);

  // 7. 行点击切换勾选
  await win.click('#processBody tr');
  const selectedText = await win.textContent('#selectedCount');
  check('点击行后已选计数更新', selectedText.includes('1'), `selectedCount=${selectedText}`);
  const killDisabled = await win.isDisabled('#killBtn');
  check('勾选后关闭按钮可用', !killDisabled, `killDisabled=${killDisabled}`);

  // 8. 全选
  await win.click('#selectAllBtn');
  const selectedText2 = await win.textContent('#selectedCount');
  check('全选计数正确', selectedText2.includes(String(rows)), `selectedCount=${selectedText2}`);

  // 9. 确认弹窗打开/取消（不真正关闭）
  await win.click('#killBtn');
  await win.waitForTimeout(350);
  const modalVisible = await win.isVisible('#confirmModal');
  check('确认弹窗可见', modalVisible, `modalVisible=${modalVisible}`);
  await win.click('#modalCancelBtn');
  await win.waitForTimeout(250);
  const modalGone = await win.evaluate(() => document.getElementById('confirmModal').classList.contains('hidden'));
  check('取消后弹窗关闭', modalGone, `modalGone=${modalGone}`);

  // 10. Toast 出现（查询成功提示）
  const toastCount = await win.locator('.toast').count();
  check('Toast 出现', toastCount > 0, `toasts=${toastCount}`);

  // 11. 非法端口提示
  await win.fill('#portInput', '99999');
  await win.click('#queryBtn');
  await win.waitForTimeout(300);
  const toastCount2 = await win.locator('.toast.error').count();
  check('非法端口出现错误 Toast', toastCount2 > 0, `errorToasts=${toastCount2}`);

  // 12. 版本号展示
  const versionText = await win.textContent('#versionText');
  check('版本号展示', /^v\d+\.\d+\.\d+$/.test(versionText), `version=${versionText}`);

  // 13. 主题切换（双向切换）
  const themeBefore = await win.evaluate(() => document.documentElement.dataset.theme);
  await win.click('#themeToggle');
  await win.waitForTimeout(250);
  const themeAfter = await win.evaluate(() => document.documentElement.dataset.theme);
  check('主题切换生效', themeAfter !== themeBefore && (themeAfter === 'light' || themeAfter === 'dark'), `before=${themeBefore} after=${themeAfter}`);
  await win.click('#themeToggle');
  await win.waitForTimeout(200);
  const themeBack = await win.evaluate(() => document.documentElement.dataset.theme);
  check('主题可切回', themeBack === themeBefore, `back=${themeBack}`);

  // 14. 非法端口范围提示
  await win.fill('#portInput', '99999-100000');
  await win.click('#queryBtn');
  await win.waitForTimeout(350);
  const errorToastCount = await win.locator('.toast.error').count();
  check('非法范围出现错误 Toast', errorToastCount > 0, `errorToasts=${errorToastCount}`);

  // 15. 真实范围查询 135-136（仅查询，不关闭）
  await win.fill('#portInput', '135-136');
  await win.click('#queryBtn');
  await win.waitForTimeout(2000);
  const rangeRows = await win.locator('#processBody tr').count();
  const rangeCountText = await win.textContent('#resultCount');
  check('范围查询出现结果行', rangeRows > 0, `rows=${rangeRows} resultCount=${rangeCountText}`);
  if (rangeRows > 0) {
    const portCell = await win.locator('#processBody tr').first().locator('.port-cell').innerText();
    check('结果行包含端口列', /^\d+$/.test(portCell.trim()), `port=${portCell}`);
  }

  await app.close();

  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed += 1;
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  (' + c.detail + ')' : ''}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

