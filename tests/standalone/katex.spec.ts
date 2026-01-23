/**
 * MD Viewer Standalone 模式 - KaTeX 数学公式测试
 * 
 * 测试范围：
 * - 行内公式
 * - 块级公式
 * - 复杂数学表达式
 */

import { test, expect } from '@playwright/test';
import { StandalonePage } from '../helpers/page-objects';

test.describe('Standalone 模式 - KaTeX 数学公式', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
    await standalonePage.switchToSplitMode();
  });

  test('TC-K001: 行内公式应该正确渲染', async ({ page }) => {
    const content = '这是行内公式 $E = mc^2$ 在文本中。';
    
    await standalonePage.editor.fill(content);
    await page.waitForTimeout(500);
    
    // 检查是否有 KaTeX 渲染的元素
    const katexSpan = standalonePage.preview.locator('.katex, .katex-html');
    await expect(katexSpan.first()).toBeVisible();
  });

  test('TC-K002: 块级公式应该正确渲染', async ({ page }) => {
    const content = `
这是块级公式：

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

公式结束。
`;
    
    await standalonePage.editor.fill(content);
    await page.waitForTimeout(500);
    
    // 检查块级公式
    const katexDisplay = standalonePage.preview.locator('.katex-display, .katex');
    await expect(katexDisplay.first()).toBeVisible();
  });

  test('TC-K003: 分数公式应该正确渲染', async ({ page }) => {
    const content = '分数: $\\frac{a}{b}$';
    
    await standalonePage.editor.fill(content);
    await page.waitForTimeout(500);
    
    const katex = standalonePage.preview.locator('.katex');
    await expect(katex.first()).toBeVisible();
  });

  test('TC-K004: 求和公式应该正确渲染', async ({ page }) => {
    const content = '求和: $\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$';
    
    await standalonePage.editor.fill(content);
    await page.waitForTimeout(500);
    
    const katex = standalonePage.preview.locator('.katex');
    await expect(katex.first()).toBeVisible();
  });

  test('TC-K005: 矩阵应该正确渲染', async ({ page }) => {
    const content = `
$$
\\begin{pmatrix}
a & b \\\\
c & d
\\end{pmatrix}
$$
`;
    
    await standalonePage.editor.fill(content);
    await page.waitForTimeout(500);
    
    const katex = standalonePage.preview.locator('.katex');
    await expect(katex.first()).toBeVisible();
  });

  test('TC-K006: 希腊字母应该正确渲染', async ({ page }) => {
    const content = '希腊字母: $\\alpha, \\beta, \\gamma, \\delta, \\pi, \\theta$';
    
    await standalonePage.editor.fill(content);
    await page.waitForTimeout(500);
    
    const katex = standalonePage.preview.locator('.katex');
    await expect(katex.first()).toBeVisible();
  });

  test('TC-K007: 错误的 LaTeX 语法应该优雅处理', async ({ page }) => {
    const content = '错误公式: $\\invalidcommand{x}$';
    
    await standalonePage.editor.fill(content);
    await page.waitForTimeout(500);
    
    // 页面不应该崩溃
    await expect(standalonePage.preview).toBeVisible();
    
    // 可能显示错误样式
    const errorElement = standalonePage.preview.locator('.katex-error, .error');
    // 取决于 KaTeX 配置
  });

  test('TC-K008: 多个公式应该都能渲染', async ({ page }) => {
    const content = `
第一个公式 $a^2 + b^2 = c^2$

第二个公式 $F = ma$

第三个公式:
$$
e^{i\\pi} + 1 = 0
$$
`;
    
    await standalonePage.editor.fill(content);
    await page.waitForTimeout(500);
    
    const katexElements = standalonePage.preview.locator('.katex');
    const count = await katexElements.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
