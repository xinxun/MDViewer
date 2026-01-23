# MD Viewer 自动化测试指南

## 概述

本项目使用 **Playwright** 进行端到端自动化测试，覆盖 Standalone 模式和 Server 模式的核心功能。

## 测试结构

```
tests/
├── helpers/
│   └── page-objects.ts      # 页面对象封装
├── standalone/              # Standalone 模式测试
│   ├── basic.spec.ts        # 基础功能
│   ├── editor.spec.ts       # 编辑器功能
│   ├── mermaid.spec.ts      # Mermaid 图表
│   ├── katex.spec.ts        # KaTeX 数学公式
│   ├── toc-search.spec.ts   # TOC 和搜索
│   └── encoding.spec.ts     # 编码处理
├── server/                  # Server 模式测试
│   ├── basic.spec.ts        # 基础功能
│   └── api.spec.ts          # API 接口测试
└── test-results/            # 测试报告输出
```

## 环境准备

### 1. 安装依赖

```bash
npm install -D @playwright/test
npx playwright install
```

### 2. 配置文件

测试配置在 `playwright.config.ts`，包含：
- 测试超时设置
- 浏览器配置（Chrome、Firefox、Safari）
- 截图和视频录制
- 测试报告格式

## 运行测试

### 运行所有测试

```bash
npx playwright test
```

### 只运行 Standalone 模式测试

```bash
npx playwright test tests/standalone/
```

### 只运行 Server 模式测试

```bash
npx playwright test tests/server/
```

### 运行特定测试文件

```bash
npx playwright test tests/standalone/mermaid.spec.ts
```

### 只在 Chrome 中测试

```bash
npx playwright test --project=chromium
```

### 带 UI 界面运行

```bash
npx playwright test --ui
```

### 调试模式

```bash
npx playwright test --debug
```

### 查看测试报告

```bash
npx playwright show-report
```

## 测试用例编号规范

| 前缀 | 模块 |
|------|------|
| TC-S | Standalone 基础功能 |
| TC-E | 编辑器功能 |
| TC-M | Mermaid 图表 |
| TC-K | KaTeX 数学公式 |
| TC-T | TOC 目录 |
| TC-EN | 编码处理 |
| TC-SV | Server 模式 |
| TC-API | API 接口 |

## 测试覆盖矩阵

### Standalone 模式

| 功能模块 | 测试数量 | 优先级 |
|---------|---------|--------|
| 页面加载 | 7 | P0 |
| 视图切换 | 4 | P1 |
| 主题切换 | 3 | P1 |
| 编辑器基础 | 10 | P0 |
| 分屏拖拽 | 4 | P1 |
| Mermaid 渲染 | 8 | P1 |
| 图表缩放 | 10 | P1 |
| Mermaid 主题 | 1 | P2 |
| TOC 功能 | 7 | P2 |
| 全局搜索 | 6 | P2 |
| 文件搜索 | 3 | P2 |
| KaTeX 公式 | 8 | P2 |
| 编码处理 | 5 | P2 |

### Server 模式

| 功能模块 | 测试数量 | 优先级 |
|---------|---------|--------|
| 页面加载 | 6 | P0 |
| 视图切换 | 3 | P1 |
| 主题切换 | 1 | P2 |
| API 文件列表 | 2 | P0 |
| API 读取文件 | 3 | P0 |
| API 保存文件 | 3 | P0 |
| API 创建文件 | 2 | P1 |
| API 删除文件 | 2 | P1 |
| API 安全性 | 3 | P0 |

## 已知限制

### File System Access API

由于 File System Access API 需要用户交互授权，以下功能无法完全自动化测试：

- 打开文件夹
- 文件夹记忆恢复
- 最近文件夹列表
- 文件保存到本地

**解决方案**：这些功能需要手动测试或使用 Mock。

### 浏览器兼容性

- **Firefox/Safari**: 不支持 File System Access API
- 测试会自动跳过不支持的功能
- 会验证不支持警告是否正确显示

## 测试报告

测试完成后，报告生成在：

- HTML 报告: `test-results/html-report/`
- JSON 报告: `test-results/results.json`

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: test-results/
```

## 手动测试补充

以下功能建议手动测试：

1. **文件夹打开和权限授权流程**
2. **文件夹记忆跨会话恢复**
3. **最近文件夹快速切换**
4. **文件保存和未保存提示**
5. **非 UTF-8 编码文件处理**
6. **大文件性能表现**
7. **复杂 Mermaid 图表渲染**
8. **键盘快捷键完整性**

## 问题报告模板

发现问题时，请使用以下格式记录：

```markdown
## 问题标题

**测试用例**: TC-XXXX
**严重程度**: P0/P1/P2/P3
**浏览器**: Chrome/Firefox/Safari
**版本**: 

### 复现步骤
1. 
2. 
3. 

### 预期结果


### 实际结果


### 截图/录屏

### 控制台错误

```

## 贡献指南

添加新测试时：

1. 遵循现有的命名规范
2. 使用页面对象模式
3. 添加有意义的测试描述
4. 确保测试独立可运行
5. 更新本文档的测试覆盖矩阵
