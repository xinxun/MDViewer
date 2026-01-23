import { defineConfig, devices } from '@playwright/test';

/**
 * MD Viewer 自动化测试配置
 * 
 * 运行说明:
 *   npx playwright test                    # 运行所有测试
 *   npx playwright test --project=chromium # 只运行 Chrome 测试
 *   npx playwright test --ui               # 打开交互式 UI
 *   npx playwright show-report             # 查看测试报告
 */

export default defineConfig({
  // 测试目录
  testDir: './tests',
  
  // 每个测试的超时时间
  timeout: 30000,
  
  // 期望超时
  expect: {
    timeout: 5000
  },
  
  // 测试并行度
  fullyParallel: true,
  
  // 失败时禁止重试（CI 环境可设为 2）
  retries: process.env.CI ? 2 : 0,
  
  // 并发 worker 数量
  workers: process.env.CI ? 1 : undefined,
  
  // 测试输出目录
  outputDir: 'test-results/artifacts',
  
  // 测试报告器
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['list']
  ],
  
  // 全局设置
  use: {
    // 基础 URL（Server 模式）
    baseURL: 'http://localhost:3000',
    
    // 失败时截图
    screenshot: 'only-on-failure',
    
    // 录制视频（失败时保留）
    video: 'retain-on-failure',
    
    // 跟踪信息（失败时保留）
    trace: 'retain-on-failure',
    
    // 浏览器上下文设置
    viewport: { width: 1280, height: 720 },
    
    // 忽略 HTTPS 错误
    ignoreHTTPSErrors: true,
  },

  // 浏览器项目配置
  projects: [
    // ===== Chromium (Chrome/Edge) - 完整支持 =====
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // 启用 File System Access API 权限
        launchOptions: {
          args: ['--enable-features=FileSystemAccessAPI']
        }
      },
    },
    
    {
      name: 'edge',
      use: { 
        ...devices['Desktop Edge'],
        channel: 'msedge',
      },
    },

    // ===== Firefox - 不支持 File System Access API =====
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
      },
    },

    // ===== Safari - 不支持 File System Access API =====
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
      },
    },

    // ===== 移动端测试 =====
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
      },
    },
    
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
      },
    },
  ],

  // 启动本地服务器（Server 模式测试前）
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
