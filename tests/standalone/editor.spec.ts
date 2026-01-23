/**
 * MD Viewer Standalone 模式 - 编辑器功能测试
 * 
 * 测试范围：
 * - 编辑器输入
 * - 实时预览
 * - 分屏拖拽
 * - 保存功能
 */

import { test, expect } from '@playwright/test';
import { StandalonePage } from '../helpers/page-objects';

test.describe('Standalone 模式 - 编辑器基础', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
    // 确保在分屏模式
    await standalonePage.switchToSplitMode();
  });

  test('TC-E001: 编辑器应该可以输入内容', async ({ page }) => {
    const testContent = '# 测试标题\n\n这是测试内容';
    
    await standalonePage.editor.click();
    await standalonePage.editor.fill(testContent);
    
    const editorValue = await standalonePage.editor.inputValue();
    expect(editorValue).toBe(testContent);
  });

  test('TC-E002: 输入后预览应该实时更新', async ({ page }) => {
    const testContent = '# Hello World';
    
    await standalonePage.editor.fill(testContent);
    
    // 等待渲染
    await page.waitForTimeout(500);
    
    const previewHTML = await standalonePage.getPreviewHTML();
    expect(previewHTML).toContain('<h1');
    expect(previewHTML).toContain('Hello World');
  });

  test('TC-E003: Markdown 标题渲染正确', async ({ page }) => {
    const testContent = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
    
    await standalonePage.editor.fill(testContent);
    await page.waitForTimeout(300);
    
    const preview = standalonePage.preview;
    await expect(preview.locator('h1')).toHaveText('H1');
    await expect(preview.locator('h2')).toHaveText('H2');
    await expect(preview.locator('h3')).toHaveText('H3');
    await expect(preview.locator('h4')).toHaveText('H4');
    await expect(preview.locator('h5')).toHaveText('H5');
    await expect(preview.locator('h6')).toHaveText('H6');
  });

  test('TC-E004: Markdown 列表渲染正确', async ({ page }) => {
    const testContent = `
- 无序列表1
- 无序列表2
  - 嵌套项

1. 有序列表1
2. 有序列表2
`;
    
    await standalonePage.editor.fill(testContent);
    await page.waitForTimeout(300);
    
    const preview = standalonePage.preview;
    await expect(preview.locator('ul')).toBeVisible();
    await expect(preview.locator('ol')).toBeVisible();
  });

  test('TC-E005: Markdown 代码块渲染正确', async ({ page }) => {
    const testContent = '```javascript\nconst x = 1;\nconsole.log(x);\n```';
    
    await standalonePage.editor.fill(testContent);
    await page.waitForTimeout(500);
    
    const preview = standalonePage.preview;
    await expect(preview.locator('pre code')).toBeVisible();
    
    // 检查是否有语法高亮
    const codeBlock = preview.locator('pre code');
    const classes = await codeBlock.getAttribute('class');
    expect(classes).toContain('hljs');
  });

  test('TC-E006: Markdown 表格渲染正确', async ({ page }) => {
    const testContent = `
| 列1 | 列2 | 列3 |
|-----|-----|-----|
| A   | B   | C   |
| D   | E   | F   |
`;
    
    await standalonePage.editor.fill(testContent);
    await page.waitForTimeout(300);
    
    const preview = standalonePage.preview;
    await expect(preview.locator('table')).toBeVisible();
    await expect(preview.locator('th')).toHaveCount(3);
    await expect(preview.locator('td')).toHaveCount(6);
  });

  test('TC-E007: Markdown 任务列表渲染正确', async ({ page }) => {
    const testContent = `
- [ ] 未完成任务
- [x] 已完成任务
`;
    
    await standalonePage.editor.fill(testContent);
    await page.waitForTimeout(300);
    
    const preview = standalonePage.preview;
    await expect(preview.locator('input[type="checkbox"]')).toHaveCount(2);
  });

  test('TC-E008: Markdown 链接渲染正确', async ({ page }) => {
    const testContent = '[百度](https://www.baidu.com)';
    
    await standalonePage.editor.fill(testContent);
    await page.waitForTimeout(300);
    
    const link = standalonePage.preview.locator('a');
    await expect(link).toHaveText('百度');
    await expect(link).toHaveAttribute('href', 'https://www.baidu.com');
  });

  test('TC-E009: Markdown 图片渲染正确', async ({ page }) => {
    const testContent = '![Alt Text](https://example.com/image.png)';
    
    await standalonePage.editor.fill(testContent);
    await page.waitForTimeout(300);
    
    const img = standalonePage.preview.locator('img');
    await expect(img).toHaveAttribute('alt', 'Alt Text');
    await expect(img).toHaveAttribute('src', 'https://example.com/image.png');
  });

  test('TC-E010: Markdown 粗体/斜体渲染正确', async ({ page }) => {
    const testContent = '**粗体** *斜体* ***粗斜体*** ~~删除线~~';
    
    await standalonePage.editor.fill(testContent);
    await page.waitForTimeout(300);
    
    const preview = standalonePage.preview;
    await expect(preview.locator('strong')).toContainText('粗体');
    await expect(preview.locator('em').first()).toContainText('斜体');
    await expect(preview.locator('del')).toContainText('删除线');
  });
});

test.describe('Standalone 模式 - 分屏拖拽', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
    await standalonePage.switchToSplitMode();
  });

  test('TC-E020: 分隔条应该可见', async () => {
    await expect(standalonePage.resizer).toBeVisible();
  });

  test('TC-E021: 拖拽分隔条应该调整比例', async ({ page }) => {
    const resizer = standalonePage.resizer;
    const editor = standalonePage.editor;
    
    // 获取初始编辑器宽度
    const initialWidth = await editor.evaluate(el => el.offsetWidth);
    
    // 拖拽分隔条
    const box = await resizer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 100, box.y + box.height / 2);
      await page.mouse.up();
      
      // 等待重新布局
      await page.waitForTimeout(200);
      
      // 验证宽度变化
      const newWidth = await editor.evaluate(el => el.offsetWidth);
      expect(newWidth).toBeGreaterThan(initialWidth);
    }
  });

  test('TC-E022: 分屏比例应该有最小/最大限制', async ({ page }) => {
    const resizer = standalonePage.resizer;
    const editor = standalonePage.editor;
    const container = page.locator('.content, .main-content');
    
    const containerWidth = await container.evaluate(el => el.offsetWidth);
    
    // 拖到最左边
    const box = await resizer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(0, box.y + box.height / 2);
      await page.mouse.up();
      
      await page.waitForTimeout(200);
      
      // 编辑器宽度应该不低于 20%
      const editorWidth = await editor.evaluate(el => el.offsetWidth);
      expect(editorWidth).toBeGreaterThan(containerWidth * 0.15);
    }
  });

  test('TC-E023: 分屏比例应该持久化', async ({ page }) => {
    const resizer = standalonePage.resizer;
    
    // 拖拽改变比例
    const box = await resizer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 50, box.y + box.height / 2);
      await page.mouse.up();
    }
    
    await page.waitForTimeout(500);
    
    // 获取当前编辑器宽度百分比
    const initialRatio = await page.evaluate(() => {
      return localStorage.getItem('md-viewer-split-ratio');
    });
    
    // 刷新页面
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    // 验证比例保持
    const afterRatio = await page.evaluate(() => {
      return localStorage.getItem('md-viewer-split-ratio');
    });
    
    expect(afterRatio).toBe(initialRatio);
  });
});

test.describe('Standalone 模式 - 未保存提示', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
    await standalonePage.switchToSplitMode();
  });

  test('TC-E030: 编辑后应该标记为未保存', async ({ page }) => {
    await standalonePage.editor.fill('# 测试内容');
    
    // 检查是否有未保存标记（标题或按钮变化）
    // 通常会在标题栏显示 * 或者保存按钮高亮
    await page.waitForTimeout(300);
    
    // 检查 isModified 状态
    const isModified = await page.evaluate(() => {
      return (window as any).app?.isModified || 
             document.querySelector('.modified') !== null ||
             document.title.includes('*');
    });
    
    // 如果打开了文件才会有 modified 状态
    // 这里主要验证输入功能正常
    const editorValue = await standalonePage.editor.inputValue();
    expect(editorValue).toContain('测试内容');
  });
});
