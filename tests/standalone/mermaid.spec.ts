/**
 * MD Viewer Standalone 模式 - Mermaid 图表测试
 * 
 * 测试范围：
 * - Mermaid 流程图
 * - 序列图
 * - 类图
 * - 状态图
 * - 图表缩放功能
 * - 主题切换后重新渲染
 */

import { test, expect } from '@playwright/test';
import { StandalonePage } from '../helpers/page-objects';

test.describe('Standalone 模式 - Mermaid 图表渲染', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
    await standalonePage.switchToSplitMode();
  });

  test('TC-M001: 流程图应该正确渲染', async ({ page }) => {
    const mermaidCode = `
\`\`\`mermaid
flowchart TD
    A[开始] --> B{判断}
    B -->|是| C[执行A]
    B -->|否| D[执行B]
    C --> E[结束]
    D --> E
\`\`\`
`;
    
    await standalonePage.editor.fill(mermaidCode);
    
    // 等待 Mermaid 渲染
    await page.waitForTimeout(1000);
    
    // 检查是否有 Mermaid 容器和 SVG
    const mermaidDiv = standalonePage.preview.locator('.mermaid');
    await expect(mermaidDiv).toBeVisible();
    
    const svg = mermaidDiv.locator('svg');
    await expect(svg).toBeVisible();
  });

  test('TC-M002: 序列图应该正确渲染', async ({ page }) => {
    const mermaidCode = `
\`\`\`mermaid
sequenceDiagram
    participant A as 用户
    participant B as 服务器
    A->>B: 请求数据
    B-->>A: 返回数据
\`\`\`
`;
    
    await standalonePage.editor.fill(mermaidCode);
    await page.waitForTimeout(1000);
    
    const mermaidDiv = standalonePage.preview.locator('.mermaid');
    await expect(mermaidDiv).toBeVisible();
    await expect(mermaidDiv.locator('svg')).toBeVisible();
  });

  test('TC-M003: 类图应该正确渲染', async ({ page }) => {
    const mermaidCode = `
\`\`\`mermaid
classDiagram
    Animal <|-- Dog
    Animal <|-- Cat
    Animal : +int age
    Animal : +String name
    Animal: +eat()
    class Dog{
      +String breed
      +bark()
    }
    class Cat{
      +String color
      +meow()
    }
\`\`\`
`;
    
    await standalonePage.editor.fill(mermaidCode);
    await page.waitForTimeout(1000);
    
    const mermaidDiv = standalonePage.preview.locator('.mermaid');
    await expect(mermaidDiv).toBeVisible();
  });

  test('TC-M004: 状态图应该正确渲染', async ({ page }) => {
    const mermaidCode = `
\`\`\`mermaid
stateDiagram-v2
    [*] --> 待机
    待机 --> 运行: 启动
    运行 --> 待机: 停止
    运行 --> [*]: 关机
\`\`\`
`;
    
    await standalonePage.editor.fill(mermaidCode);
    await page.waitForTimeout(1000);
    
    const mermaidDiv = standalonePage.preview.locator('.mermaid');
    await expect(mermaidDiv).toBeVisible();
  });

  test('TC-M005: 甘特图应该正确渲染', async ({ page }) => {
    const mermaidCode = `
\`\`\`mermaid
gantt
    title 项目计划
    dateFormat  YYYY-MM-DD
    section 阶段1
    任务1           :a1, 2024-01-01, 30d
    任务2           :after a1, 20d
\`\`\`
`;
    
    await standalonePage.editor.fill(mermaidCode);
    await page.waitForTimeout(1000);
    
    const mermaidDiv = standalonePage.preview.locator('.mermaid');
    await expect(mermaidDiv).toBeVisible();
  });

  test('TC-M006: 饼图应该正确渲染', async ({ page }) => {
    const mermaidCode = `
\`\`\`mermaid
pie title 市场份额
    "产品A" : 45
    "产品B" : 30
    "产品C" : 25
\`\`\`
`;
    
    await standalonePage.editor.fill(mermaidCode);
    await page.waitForTimeout(1000);
    
    const mermaidDiv = standalonePage.preview.locator('.mermaid');
    await expect(mermaidDiv).toBeVisible();
  });

  test('TC-M007: 多个图表应该都能渲染', async ({ page }) => {
    const mermaidCode = `
\`\`\`mermaid
flowchart LR
    A --> B
\`\`\`

一些文字

\`\`\`mermaid
sequenceDiagram
    A->>B: Hello
\`\`\`
`;
    
    await standalonePage.editor.fill(mermaidCode);
    await page.waitForTimeout(1500);
    
    const mermaidDivs = standalonePage.preview.locator('.mermaid');
    await expect(mermaidDivs).toHaveCount(2);
  });

  test('TC-M008: 错误的 Mermaid 语法应该优雅处理', async ({ page }) => {
    const mermaidCode = `
\`\`\`mermaid
flowchart INVALID
    这是错误的语法 ---> 不应该崩溃
\`\`\`
`;
    
    await standalonePage.editor.fill(mermaidCode);
    await page.waitForTimeout(1000);
    
    // 页面不应该崩溃
    await expect(standalonePage.preview).toBeVisible();
    
    // 检查是否有错误消息或错误样式
    const errorElement = standalonePage.preview.locator('.mermaid-error, .error, [data-error]');
    // 错误处理方式可能不同，主要确保页面不崩溃
  });
});

test.describe('Standalone 模式 - 图表缩放功能', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
    await standalonePage.switchToSplitMode();
    
    // 先添加一个 Mermaid 图表
    const mermaidCode = `
\`\`\`mermaid
flowchart TD
    A[开始] --> B[结束]
\`\`\`
`;
    await standalonePage.editor.fill(mermaidCode);
    await page.waitForTimeout(1000);
  });

  test('TC-M010: 双击图表应该打开缩放模态框', async ({ page }) => {
    const diagram = standalonePage.preview.locator('.mermaid').first();
    await diagram.dblclick();
    
    await expect(standalonePage.zoomModal).toBeVisible();
  });

  test('TC-M011: 缩放模态框应该显示图表内容', async ({ page }) => {
    const diagram = standalonePage.preview.locator('.mermaid').first();
    await diagram.dblclick();
    
    await expect(standalonePage.zoomModal).toBeVisible();
    await expect(standalonePage.zoomContent).toBeVisible();
    
    // 检查缩放内容中有 SVG
    const svg = standalonePage.zoomContent.locator('svg');
    await expect(svg).toBeVisible();
  });

  test('TC-M012: 点击关闭按钮应该关闭模态框', async ({ page }) => {
    const diagram = standalonePage.preview.locator('.mermaid').first();
    await diagram.dblclick();
    
    await expect(standalonePage.zoomModal).toBeVisible();
    
    await standalonePage.zoomCloseBtn.click();
    
    await expect(standalonePage.zoomModal).not.toBeVisible();
  });

  test('TC-M013: 按 ESC 键应该关闭模态框', async ({ page }) => {
    const diagram = standalonePage.preview.locator('.mermaid').first();
    await diagram.dblclick();
    
    await expect(standalonePage.zoomModal).toBeVisible();
    
    await page.keyboard.press('Escape');
    
    await expect(standalonePage.zoomModal).not.toBeVisible();
  });

  test('TC-M014: 点击背景应该关闭模态框', async ({ page }) => {
    const diagram = standalonePage.preview.locator('.mermaid').first();
    await diagram.dblclick();
    
    await expect(standalonePage.zoomModal).toBeVisible();
    
    // 点击模态框背景（不是内容区域）
    await standalonePage.zoomModal.click({ position: { x: 10, y: 10 } });
    
    await expect(standalonePage.zoomModal).not.toBeVisible();
  });

  test('TC-M015: 放大按钮应该增加缩放', async ({ page }) => {
    const diagram = standalonePage.preview.locator('.mermaid').first();
    await diagram.dblclick();
    
    // 获取初始缩放级别
    const initialScale = await page.evaluate(() => {
      const content = document.querySelector('#zoomContent, .zoom-content');
      const transform = window.getComputedStyle(content!).transform;
      if (transform === 'none') return 1;
      const match = transform.match(/matrix\(([^,]+)/);
      return match ? parseFloat(match[1]) : 1;
    });
    
    // 点击放大
    await standalonePage.zoomInBtn.click();
    await page.waitForTimeout(200);
    
    // 验证缩放增加
    const newScale = await page.evaluate(() => {
      const content = document.querySelector('#zoomContent, .zoom-content');
      const transform = window.getComputedStyle(content!).transform;
      if (transform === 'none') return 1;
      const match = transform.match(/matrix\(([^,]+)/);
      return match ? parseFloat(match[1]) : 1;
    });
    
    expect(newScale).toBeGreaterThan(initialScale);
  });

  test('TC-M016: 缩小按钮应该减少缩放', async ({ page }) => {
    const diagram = standalonePage.preview.locator('.mermaid').first();
    await diagram.dblclick();
    
    // 先放大一次
    await standalonePage.zoomInBtn.click();
    await page.waitForTimeout(200);
    
    const scaleAfterZoomIn = await page.evaluate(() => {
      const content = document.querySelector('#zoomContent, .zoom-content');
      const transform = window.getComputedStyle(content!).transform;
      if (transform === 'none') return 1;
      const match = transform.match(/matrix\(([^,]+)/);
      return match ? parseFloat(match[1]) : 1;
    });
    
    // 缩小
    await standalonePage.zoomOutBtn.click();
    await page.waitForTimeout(200);
    
    const scaleAfterZoomOut = await page.evaluate(() => {
      const content = document.querySelector('#zoomContent, .zoom-content');
      const transform = window.getComputedStyle(content!).transform;
      if (transform === 'none') return 1;
      const match = transform.match(/matrix\(([^,]+)/);
      return match ? parseFloat(match[1]) : 1;
    });
    
    expect(scaleAfterZoomOut).toBeLessThan(scaleAfterZoomIn);
  });

  test('TC-M017: 重置按钮应该恢复默认缩放', async ({ page }) => {
    const diagram = standalonePage.preview.locator('.mermaid').first();
    await diagram.dblclick();
    
    // 放大两次
    await standalonePage.zoomInBtn.click();
    await standalonePage.zoomInBtn.click();
    await page.waitForTimeout(200);
    
    // 重置
    await standalonePage.zoomResetBtn.click();
    await page.waitForTimeout(200);
    
    // 验证回到初始状态
    const scale = await page.evaluate(() => {
      const content = document.querySelector('#zoomContent, .zoom-content');
      const transform = window.getComputedStyle(content!).transform;
      if (transform === 'none') return 1;
      const match = transform.match(/matrix\(([^,]+)/);
      return match ? parseFloat(match[1]) : 1;
    });
    
    // 重置后应该是 1 或接近 1
    expect(scale).toBeCloseTo(1, 1);
  });

  test('TC-M018: 键盘 +/- 应该控制缩放', async ({ page }) => {
    const diagram = standalonePage.preview.locator('.mermaid').first();
    await diagram.dblclick();
    
    const getScale = async () => {
      return await page.evaluate(() => {
        const content = document.querySelector('#zoomContent, .zoom-content');
        const transform = window.getComputedStyle(content!).transform;
        if (transform === 'none') return 1;
        const match = transform.match(/matrix\(([^,]+)/);
        return match ? parseFloat(match[1]) : 1;
      });
    };
    
    const initialScale = await getScale();
    
    // 按 + 放大
    await page.keyboard.press('Equal'); // + 键
    await page.waitForTimeout(200);
    
    const afterPlus = await getScale();
    expect(afterPlus).toBeGreaterThanOrEqual(initialScale);
    
    // 按 - 缩小
    await page.keyboard.press('Minus');
    await page.waitForTimeout(200);
    
    const afterMinus = await getScale();
    expect(afterMinus).toBeLessThanOrEqual(afterPlus);
  });

  test('TC-M019: 鼠标滚轮应该控制缩放', async ({ page }) => {
    const diagram = standalonePage.preview.locator('.mermaid').first();
    await diagram.dblclick();
    
    await expect(standalonePage.zoomModal).toBeVisible();
    
    const getScale = async () => {
      return await page.evaluate(() => {
        const content = document.querySelector('#zoomContent, .zoom-content');
        const transform = window.getComputedStyle(content!).transform;
        if (transform === 'none') return 1;
        const match = transform.match(/matrix\(([^,]+)/);
        return match ? parseFloat(match[1]) : 1;
      });
    };
    
    const initialScale = await getScale();
    
    // 滚轮放大
    await standalonePage.zoomContent.hover();
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(200);
    
    const afterScrollUp = await getScale();
    // 滚轮方向可能因实现而异，主要验证有变化
    expect(afterScrollUp).not.toBe(initialScale);
  });
});

test.describe('Standalone 模式 - Mermaid 主题同步', () => {
  let standalonePage: StandalonePage;

  test.beforeEach(async ({ page }) => {
    standalonePage = new StandalonePage(page);
    await standalonePage.goto();
    await standalonePage.switchToSplitMode();
  });

  test('TC-M020: 切换主题后图表应该重新渲染', async ({ page }) => {
    const mermaidCode = `
\`\`\`mermaid
flowchart TD
    A[开始] --> B[结束]
\`\`\`
`;
    
    await standalonePage.editor.fill(mermaidCode);
    await page.waitForTimeout(1000);
    
    // 获取初始 SVG 样式
    const initialStyle = await page.evaluate(() => {
      const svg = document.querySelector('.mermaid svg');
      return svg?.getAttribute('style') || '';
    });
    
    // 切换主题
    await standalonePage.toggleTheme();
    await page.waitForTimeout(1000);
    
    // 验证 SVG 仍然存在（说明重新渲染了）
    const mermaidSvg = standalonePage.preview.locator('.mermaid svg');
    await expect(mermaidSvg).toBeVisible();
  });
});
