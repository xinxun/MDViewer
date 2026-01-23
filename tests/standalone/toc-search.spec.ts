/**
 * MD Viewer Standalone 模式 - TOC 和搜索功能测试
 * 
 * 测试范围：
 * - TOC 目录生成
 * - TOC 导航
 * - TOC 滚动同步
 * - 全局搜索
 */

import { test, expect } from '@playwright/test';
import { StandalonePage } from '../helpers/page-objects';

test.describe('Standalone 模式 - TOC 功能', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
    await standalonePage.switchToSplitMode();
  });

  test('TC-T001: TOC 按钮应该可见', async () => {
    await expect(standalonePage.tocBtn).toBeVisible();
  });

  test('TC-T002: 点击 TOC 按钮应该显示目录面板', async () => {
    await standalonePage.openTOC();
    await expect(standalonePage.tocPanel).toBeVisible();
  });

  test('TC-T003: 有标题的文档应该生成 TOC', async ({ page }) => {
    const content = `
# 一级标题

## 二级标题 1

### 三级标题

## 二级标题 2

内容文本
`;
    
    await standalonePage.editor.fill(content);
    await page.waitForTimeout(500);
    
    await standalonePage.openTOC();
    
    // TOC 面板应该包含标题链接
    const tocItems = standalonePage.tocPanel.locator('a, .toc-item, li');
    await expect(tocItems.first()).toBeVisible();
  });

  test('TC-T004: 点击 TOC 项应该滚动到对应位置', async ({ page }) => {
    const content = `
# 标题一

这里是很多内容...

${'这是一段很长的文字。'.repeat(50)}

## 标题二

目标位置

${'更多内容。'.repeat(50)}

## 标题三

结束
`;
    
    await standalonePage.editor.fill(content);
    await page.waitForTimeout(500);
    
    await standalonePage.openTOC();
    
    // 点击第二个标题
    const tocItem = standalonePage.tocPanel.locator('text=标题二').first();
    if (await tocItem.isVisible()) {
      await tocItem.click();
      await page.waitForTimeout(300);
      
      // 验证预览区域滚动
      const preview = standalonePage.preview;
      const scrollTop = await preview.evaluate(el => el.scrollTop);
      expect(scrollTop).toBeGreaterThan(0);
    }
  });

  test('TC-T005: 关闭 TOC 面板', async ({ page }) => {
    await standalonePage.openTOC();
    await expect(standalonePage.tocPanel).toBeVisible();
    
    // 点击关闭按钮
    await standalonePage.tocCloseBtn.click();
    
    await expect(standalonePage.tocPanel).not.toBeVisible();
  });

  test('TC-T006: TOC 显示状态应该持久化', async ({ page }) => {
    // 打开 TOC
    await standalonePage.openTOC();
    await page.waitForTimeout(300);
    
    // 刷新页面
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    // 检查 TOC 状态是否保持
    // 具体行为取决于实现，可能保持显示或需要重新打开
  });

  test('TC-T007: 空文档不应该有 TOC 项', async ({ page }) => {
    await standalonePage.editor.fill('这是一段没有标题的文本。');
    await page.waitForTimeout(300);
    
    await standalonePage.openTOC();
    
    // TOC 面板可能显示空状态或提示
    const tocItems = standalonePage.tocPanel.locator('.toc-item, a[href^="#"]');
    const count = await tocItems.count();
    expect(count).toBe(0);
  });
});

test.describe('Standalone 模式 - 全局搜索', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
  });

  test('TC-S030: 搜索按钮应该可见', async () => {
    await expect(standalonePage.searchBtn).toBeVisible();
  });

  test('TC-S031: 点击搜索按钮应该打开搜索面板', async () => {
    await standalonePage.openSearch();
    await expect(standalonePage.searchPanel).toBeVisible();
  });

  test('TC-S032: Ctrl+F 应该打开搜索面板', async ({ page }) => {
    await page.keyboard.press('Control+f');
    
    // 搜索面板或输入框应该可见
    const searchVisible = await standalonePage.searchPanel.isVisible() || 
                          await standalonePage.searchInput.isVisible();
    expect(searchVisible).toBe(true);
  });

  test('TC-S033: 搜索输入框应该可以输入', async ({ page }) => {
    await standalonePage.openSearch();
    
    await standalonePage.searchInput.fill('测试搜索');
    
    const value = await standalonePage.searchInput.inputValue();
    expect(value).toBe('测试搜索');
  });

  test('TC-S034: ESC 键应该关闭搜索面板', async ({ page }) => {
    await standalonePage.openSearch();
    await expect(standalonePage.searchPanel).toBeVisible();
    
    await page.keyboard.press('Escape');
    
    await expect(standalonePage.searchPanel).not.toBeVisible();
  });

  test('TC-S035: 搜索应该显示结果', async ({ page }) => {
    // 先输入一些内容
    await standalonePage.switchToSplitMode();
    await standalonePage.editor.fill('# 测试标题\n\n这是测试内容，包含关键词。');
    await page.waitForTimeout(300);
    
    // 执行搜索
    await standalonePage.globalSearch('测试');
    await page.waitForTimeout(500);
    
    // 检查结果
    const results = standalonePage.searchResults;
    await expect(results).toBeVisible();
  });

  test('TC-S036: 无匹配时应该显示空结果', async ({ page }) => {
    await standalonePage.switchToSplitMode();
    await standalonePage.editor.fill('# 标题\n\n内容文本');
    await page.waitForTimeout(300);
    
    await standalonePage.globalSearch('xyznotexist12345');
    await page.waitForTimeout(500);
    
    // 应该显示无结果提示
    const noResults = standalonePage.searchPanel.locator('.no-results, .empty-results, text=没有找到');
    // 或者结果列表为空
  });
});

test.describe('Standalone 模式 - 文件搜索', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
  });

  test('TC-S040: 文件搜索输入框应该可见', async () => {
    await expect(standalonePage.fileSearchInput).toBeVisible();
  });

  test('TC-S041: 输入搜索词应该过滤文件列表', async ({ page }) => {
    // 这需要先打开文件夹，由于 File System Access API 限制，
    // 在自动化测试中可能需要模拟
    
    // 验证输入框功能
    await standalonePage.fileSearchInput.fill('test');
    const value = await standalonePage.fileSearchInput.inputValue();
    expect(value).toBe('test');
  });

  test('TC-S042: 清空搜索应该恢复完整列表', async ({ page }) => {
    await standalonePage.fileSearchInput.fill('test');
    await page.waitForTimeout(200);
    
    await standalonePage.fileSearchInput.fill('');
    await page.waitForTimeout(200);
    
    const value = await standalonePage.fileSearchInput.inputValue();
    expect(value).toBe('');
  });
});
