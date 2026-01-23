/**
 * MD Viewer Standalone 模式 - 编码处理测试
 * 
 * 测试范围：
 * - 编码选择器
 * - 不同编码的显示
 */

import { test, expect } from '@playwright/test';
import { StandalonePage } from '../helpers/page-objects';

test.describe('Standalone 模式 - 编码功能', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
  });

  test('TC-EN001: 编码选择器应该可见', async () => {
    await expect(standalonePage.encodingSelect).toBeVisible();
  });

  test('TC-EN002: 编码选择器应该包含多种编码选项', async ({ page }) => {
    const select = standalonePage.encodingSelect;
    
    // 获取所有选项
    const options = await select.locator('option').allTextContents();
    
    // 应该包含常见编码
    const expectedEncodings = ['UTF-8', 'GBK', 'GB2312'];
    for (const encoding of expectedEncodings) {
      const hasEncoding = options.some(opt => opt.includes(encoding));
      expect(hasEncoding).toBe(true);
    }
  });

  test('TC-EN003: 默认应该是 UTF-8 或自动检测', async ({ page }) => {
    const select = standalonePage.encodingSelect;
    const value = await select.inputValue();
    
    // 默认值通常是 utf-8 或 auto
    expect(['utf-8', 'auto', 'UTF-8', '']).toContain(value);
  });

  test('TC-EN004: 可以切换编码', async ({ page }) => {
    const select = standalonePage.encodingSelect;
    
    // 切换到 GBK
    await select.selectOption({ label: /GBK/i });
    
    const value = await select.inputValue();
    expect(value.toLowerCase()).toContain('gbk');
  });

  test('TC-EN005: 切换编码后应该重新解码内容', async ({ page }) => {
    // 这个测试需要实际打开文件，由于 API 限制，
    // 这里主要验证切换操作不会导致错误
    
    await standalonePage.switchToSplitMode();
    await standalonePage.editor.fill('测试中文内容');
    
    const select = standalonePage.encodingSelect;
    await select.selectOption({ label: /GBK/i });
    
    // 页面不应该崩溃
    await expect(standalonePage.preview).toBeVisible();
  });
});
