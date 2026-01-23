/**
 * MD Viewer Server 模式 - 基础功能测试
 * 
 * 测试范围：
 * - 页面加载
 * - 文件列表
 * - 文件读取
 * - 基本 UI
 */

import { test, expect } from '@playwright/test';
import { ServerPage, APIHelper } from '../helpers/page-objects';

test.describe('Server 模式 - 基础功能', () => {
  let serverPage: ServerPage;

  test.beforeEach(async ({ page }) => {
    serverPage = new ServerPage(page);
    await serverPage.goto();
  });

  test('TC-SV001: 页面应该正确加载', async ({ page }) => {
    await expect(page).toHaveTitle(/MD Viewer|Markdown/i);
    await expect(serverPage.sidebar).toBeVisible();
    await expect(serverPage.toolbar).toBeVisible();
  });

  test('TC-SV002: 文件树应该显示', async () => {
    await serverPage.waitForFileList();
    await expect(serverPage.fileTree).toBeVisible();
  });

  test('TC-SV003: 文件树应该包含 .md 文件', async ({ page }) => {
    await serverPage.waitForFileList();
    
    // 检查是否有文件项
    const fileItems = serverPage.fileTree.locator('.file-item, li, [data-file]');
    const count = await fileItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('TC-SV004: 点击文件应该加载内容', async ({ page }) => {
    await serverPage.waitForFileList();
    
    // 点击第一个文件
    const firstFile = serverPage.fileTree.locator('.file-item, li').first();
    await firstFile.click();
    
    // 等待内容加载
    await page.waitForTimeout(500);
    
    // 预览区域应该有内容
    const previewContent = await serverPage.getPreviewHTML();
    expect(previewContent.length).toBeGreaterThan(0);
  });

  test('TC-SV005: 工具栏按钮应该存在', async () => {
    await expect(serverPage.themeBtn).toBeVisible();
  });

  test('TC-SV006: 刷新按钮应该可用', async () => {
    await expect(serverPage.refreshBtn).toBeVisible();
    await expect(serverPage.refreshBtn).toBeEnabled();
  });
});

test.describe('Server 模式 - 视图切换', () => {
  let serverPage: ServerPage;

  test.beforeEach(async ({ page }) => {
    serverPage = new ServerPage(page);
    await serverPage.goto();
  });

  test('TC-SV010: 切换到编辑模式', async ({ page }) => {
    if (await serverPage.editModeBtn.isVisible()) {
      await serverPage.editModeBtn.click();
      
      await expect(serverPage.editor).toBeVisible();
    }
  });

  test('TC-SV011: 切换到分屏模式', async ({ page }) => {
    if (await serverPage.splitModeBtn.isVisible()) {
      await serverPage.splitModeBtn.click();
      
      await expect(serverPage.editor).toBeVisible();
      await expect(serverPage.preview).toBeVisible();
    }
  });

  test('TC-SV012: 切换到查看模式', async ({ page }) => {
    await serverPage.viewModeBtn.click();
    
    await expect(serverPage.preview).toBeVisible();
  });
});

test.describe('Server 模式 - 主题', () => {
  let serverPage: ServerPage;

  test.beforeEach(async ({ page }) => {
    serverPage = new ServerPage(page);
    await serverPage.goto();
  });

  test('TC-SV020: 切换主题', async ({ page }) => {
    const getTheme = async () => {
      return await page.evaluate(() => {
        return document.documentElement.getAttribute('data-theme') || 'light';
      });
    };
    
    const initialTheme = await getTheme();
    
    await serverPage.toggleTheme();
    
    const newTheme = await getTheme();
    expect(newTheme).not.toBe(initialTheme);
  });
});
