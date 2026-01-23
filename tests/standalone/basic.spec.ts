/**
 * MD Viewer Standalone 模式 - 基础功能测试
 * 
 * 测试范围：
 * - 页面加载
 * - 浏览器兼容性检测
 * - 欢迎页面显示
 * - 基本 UI 元素
 */

import { test, expect } from '@playwright/test';
import { StandalonePage } from '../helpers/page-objects';

test.describe('Standalone 模式 - 基础功能', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
  });

  test('TC-S001: 页面应该正确加载', async ({ page }) => {
    // 验证页面标题
    await expect(page).toHaveTitle(/MD Viewer|Markdown/i);
    
    // 验证关键元素存在
    await expect(standalonePage.sidebar).toBeVisible();
    await expect(standalonePage.toolbar).toBeVisible();
  });

  test('TC-S002: 欢迎页面应该显示', async () => {
    // 初次加载应显示欢迎页面
    await expect(standalonePage.welcomePage).toBeVisible();
  });

  test('TC-S003: 打开文件夹按钮应该可见', async () => {
    await expect(standalonePage.openFolderBtn).toBeVisible();
    await expect(standalonePage.openFolderBtn).toBeEnabled();
  });

  test('TC-S004: 检测 File System Access API 支持', async ({ browserName }) => {
    const isSupported = await standalonePage.checkFileSystemAPISupport();
    
    if (browserName === 'chromium') {
      // Chromium 应该支持
      expect(isSupported).toBe(true);
    } else if (browserName === 'firefox' || browserName === 'webkit') {
      // Firefox 和 Safari 不支持
      expect(isSupported).toBe(false);
      
      // 应该显示不支持警告
      const hasWarning = await standalonePage.hasUnsupportedBrowserWarning();
      expect(hasWarning).toBe(true);
    }
  });

  test('TC-S005: 工具栏按钮应该都存在', async () => {
    await expect(standalonePage.viewModeBtn).toBeVisible();
    await expect(standalonePage.splitModeBtn).toBeVisible();
    await expect(standalonePage.themeBtn).toBeVisible();
    await expect(standalonePage.tocBtn).toBeVisible();
    await expect(standalonePage.searchBtn).toBeVisible();
  });

  test('TC-S006: 编码选择器应该存在', async () => {
    await expect(standalonePage.encodingSelect).toBeVisible();
  });

  test('TC-S007: 侧边栏应该可以收起/展开', async ({ page }) => {
    // 查找侧边栏收起按钮 - 使用正确的 ID
    const toggleBtn = page.locator('#toggleSidebar');
    
    if (await toggleBtn.isVisible()) {
      // 点击收起
      await toggleBtn.click();
      
      // 等待动画完成
      await page.waitForTimeout(500);
      
      // 验证侧边栏收起 - 检查 display:none 或 hidden 属性
      const sidebar = page.locator('#sidebar');
      const isHidden = await sidebar.evaluate(el => {
        const style = getComputedStyle(el);
        return style.display === 'none' || 
               el.classList.contains('collapsed') || 
               el.classList.contains('hidden') ||
               style.width === '0px';
      });
      expect(isHidden).toBe(true);
      
      // 点击展开 - showSidebar 按钮应该在侧边栏收起后可见
      const showBtn = page.locator('#showSidebar');
      await expect(showBtn).toBeVisible();
      await showBtn.click();
      await page.waitForTimeout(500);
      
      // 验证侧边栏展开
      const isVisible = await sidebar.evaluate(el => {
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.width !== '0px';
      });
      expect(isVisible).toBe(true);
    }
  });
});

test.describe('Standalone 模式 - 视图模式切换', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
  });

  test('TC-S010: 默认应该是分屏模式', async ({ page }) => {
    // 检查分屏模式按钮是否激活
    const splitBtn = standalonePage.splitModeBtn;
    await expect(splitBtn).toHaveClass(/active|selected/);
  });

  test('TC-S011: 切换到查看模式', async ({ page }) => {
    await standalonePage.switchToViewMode();
    
    // 等待视图模式切换完成
    await page.waitForTimeout(300);
    
    // 检查编辑器容器应该隐藏
    const editorContainer = page.locator('#editorContainer');
    const editorDisplay = await editorContainer.evaluate(el => getComputedStyle(el).display);
    expect(editorDisplay).toBe('none');
    
    // 检查查看按钮应该激活
    await expect(standalonePage.viewModeBtn).toHaveClass(/active/);
  });

  test('TC-S012: 切换回分屏模式', async ({ page }) => {
    // 先切到查看模式
    await standalonePage.switchToViewMode();
    await page.waitForTimeout(300);
    
    // 再切回分屏
    await standalonePage.switchToSplitMode();
    await page.waitForTimeout(300);
    
    // 检查分屏按钮应该激活
    await expect(standalonePage.splitModeBtn).toHaveClass(/active/);
  });

  test('TC-S013: 视图模式切换应该持久化', async ({ page, context }) => {
    // 切换到查看模式
    await standalonePage.switchToViewMode();
    
    // 等待 localStorage 保存
    await page.waitForTimeout(500);
    
    // 刷新页面
    await page.reload();
    
    // 检查是否保持查看模式
    await expect(standalonePage.editor).not.toBeVisible();
  });
});

test.describe('Standalone 模式 - 主题切换', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
    // 确保页面完全加载
    await page.waitForLoadState('networkidle');
  });

  test('TC-S020: 切换到暗色主题', async ({ page }) => {
    // 获取初始主题（可能是 light 或 null）
    const initialTheme = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    );
    
    // 点击主题切换按钮
    await standalonePage.toggleTheme();
    
    // 等待主题变化
    await page.waitForTimeout(300);
    
    // 获取新主题
    const newTheme = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    );
    
    // 验证主题已经改变
    expect(newTheme).not.toBe(initialTheme);
  });

  test('TC-S021: 主题切换应该持久化', async ({ page }) => {
    // 切换主题
    await standalonePage.toggleTheme();
    await page.waitForTimeout(300);
    
    const switchedTheme = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    );
    
    // 刷新页面
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    // 验证主题保持
    const afterReloadTheme = await page.evaluate(() => 
      document.documentElement.getAttribute('data-theme')
    );
    expect(afterReloadTheme).toBe(switchedTheme);
  });

  test('TC-S022: 主题按钮图标应该正确变化', async ({ page }) => {
    const themeBtn = standalonePage.themeBtn;
    
    // 获取初始图标类
    const initialIconClass = await page.evaluate(() => {
      const icon = document.querySelector('#themeToggle i');
      return icon ? icon.className : '';
    });
    
    // 切换主题
    await standalonePage.toggleTheme();
    
    // 等待图标更新
    await page.waitForTimeout(300);
    
    // 获取新的图标类
    const newIconClass = await page.evaluate(() => {
      const icon = document.querySelector('#themeToggle i');
      return icon ? icon.className : '';
    });
    
    // 图标类应该变化 (fa-moon <-> fa-sun)
    expect(newIconClass).not.toBe(initialIconClass);
  });
});
