# MD Viewer - Markdown 阅读器

在线访问（GitHub Pages）：https://xinxun.github.io/MDViewer/

一个美观、功能丰富的 Markdown 阅读器和编辑器。支持两种使用方式：

## ✨ 功能特点

- 📂 **文件浏览** - 自动扫描指定目录下的所有 Markdown 文件
- 📁 **最近目录** - 保存最近打开的10个文件夹，快速切换工作目录
- 👀 **双模式** - 预览模式和分栏模式（默认分栏）
- 📏 **可调整分栏** - 拖动中间分隔线自由调整编辑器和预览区域大小
- 🎨 **代码高亮** - 支持 180+ 种编程语言的代码高亮
- 📐 **数学公式** - KaTeX 渲染，支持行内和块级公式
- 📊 **UML 图表** - Mermaid 完美支持（类图、时序图、流程图、状态图、甘特图等）
- 🔍 **图表缩放** - 双击 UML 图表放大查看，支持缩放控制（50%-300%）
- 🎨 **智能主题** - Mermaid 图表随深色/浅色模式自动切换主题
- 🌐 **多编码支持** - 自动检测 UTF-8、GBK、GB2312 等编码
- 🌙 **深色模式** - 支持浅色/深色主题切换
- ✏️ **在线编辑** - 分栏模式下可直接编辑并保存 Markdown 文件
- 📱 **响应式设计** - 适配各种屏幕尺寸
- 🔍 **文件搜索** - 快速搜索文件
- 💾 **自动保存** - 记住你的分栏比例和主题偏好
- 🔖 **记忆功能** - 自动恢复上次打开的文件夹，无需重复选择

## 🎯 使用方式

### 方式一：独立版（推荐，无需服务器）

直接用浏览器打开 `standalone.html` 文件即可使用！

1. 用 Chrome 或 Edge 浏览器打开 `standalone.html`
2. 点击"打开文件夹"按钮
3. 选择包含 Markdown 文件的文件夹
4. 开始阅读和编辑！

**特点**：
- ✅ 无需安装任何依赖
- ✅ 无需运行服务器
- ✅ 直接访问本地文件系统
- ✅ 支持实时编辑和保存

**要求**：需要使用支持 File System Access API 的浏览器（Chrome 86+, Edge 86+）

## 🌐 GitHub Pages 在线访问（可行）

可以。这个项目的“独立版”是纯前端静态页面，适合直接用 GitHub Pages 托管；但“服务器版”（`server.js`）无法在 GitHub Pages 上运行。

### 开启方式（推荐）

1. 打开仓库页面 → Settings → Pages
2. **Build and deployment**：选择 **Deploy from a branch**
3. 选择 Branch：`main`，Folder：`/ (root)`
4. 保存后等待部署完成

部署完成后访问：`https://<你的用户名>.github.io/MDViewer/`

### 注意事项

- GitHub Pages 只能托管静态资源：HTML/CSS/JS，不支持 Node 服务端。
- 在线版依然需要你在浏览器里点击“打开文件夹”授权访问本地文件（这是浏览器安全机制）。

### 方式二：服务器版

如果你的系统安装了 Node.js，可以使用服务器版本：

```bash
# 使用默认 docs 目录
node server.js

# 指定自定义目录
node server.js "C:/your/markdown/folder"
```

然后访问 http://localhost:3000

## ✨ 功能特点

- 📂 **文件浏览** - 自动扫描指定目录下的所有 Markdown 文件
- 👀 **三种模式** - 预览、编辑、分栏模式（默认分栏）
- � **可调整分栏** - 拖动中间分隔线自由调整编辑器和预览区域大小
- �🎨 **代码高亮** - 支持 180+ 种编程语言的代码高亮
- 📐 **数学公式** - KaTeX 渲染，支持行内和块级公式
- 📊 **流程图表** - Mermaid 支持（流程图、序列图、甘特图、类图等）
- � **多编码支持** - 自动检测 UTF-8、GBK、GB2312 等编码
- �🌙 **深色模式** - 支持浅色/深色主题切换
- ✏️ **在线编辑** - 直接编辑并保存 Markdown 文件
- 📱 **响应式设计** - 适配各种屏幕尺寸
- 🔍 **文件搜索** - 快速搜索文件
- 💾 **自动保存** - 记住你的分栏比例和主题偏好

## 🚀 快速开始

### 独立版（推荐）

1. 双击打开 `standalone.html`（或右键选择浏览器打开）
2. 点击"打开文件夹"按钮
3. 选择你的 Markdown 文件夹
4. 开始使用！

### 服务器版

#### 安装依赖

```bash
# 无需安装，直接运行
node server.js
```

#### 启动服务器

```bash
# 使用默认 docs 目录
npm start

# 指定自定义目录
node server.js "C:/path/to/your/markdown/folder"
```

### 访问应用

打开浏览器访问 [http://localhost:3000](http://localhost:3000)

## 📖 支持的 Markdown 语法

### ✅ 基础语法
- 标题 (h1-h6)
- 粗体、斜体、删除线
- 有序/无序列表
- 任务列表 (复选框)
- 链接和图片
- 代码块和行内代码
- 表格（支持对齐）
- 引用
- 分割线
- 脚注

### ✅ 代码高亮
支持 180+ 种编程语言，包括：
- JavaScript, TypeScript, Python, Java, C/C++
- HTML, CSS, SQL, Bash, JSON, YAML
- Go, Rust, Swift, Kotlin, PHP
- 等等...

### ✅ 数学公式（KaTeX）
- 行内公式：`$E=mc^2$`
- 块级公式：
  ```
  $$
  \frac{-b \pm \sqrt{b^2-4ac}}{2a}
  $$
  ```

### ✅ 图表（Mermaid）
- 📊 流程图（Flowchart）
- 📈 序列图（Sequence Diagram）
- 📅 甘特图（Gantt Chart）
- 🎯 类图（Class Diagram）
- 🔄 状态图（State Diagram）
- 🥧 饼图（Pie Chart）
- 🌳 Git 图（Git Graph）

示例：
\`\`\`mermaid
graph TD
    A[开始] --> B[处理]
    B --> C[结束]
\`\`\`

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + S` | 保存文件 |

## 🛠️ 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 JavaScript
- **Markdown 解析**: marked.js
- **代码高亮**: highlight.js
- **图标**: Font Awesome

```
MDViewer/
├── standalone.html     # 【独立版入口】直接双击打开即可使用
├── server.js           # Node.js 服务器（可选）
├── package.json        # 项目配置（可选）
├── docs/               # 示例 Markdown 文件目录
│   └── welcome.md      # 示例文档
└── public/             # 静态资源
    ├── index.html      # 服务器版主页面
    ├── css/
    │   ├── style.css   # 主样式
    │   └── markdown.css # Markdown 渲染样式
    └── js/
        ├── app.js              # 服务器版应用逻辑
        └── standalone-app.js   # 独立版应用逻辑
```

## 💡 使用技巧

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + S` | 保存文件 |

### 最近打开文件夹（新功能）

**功能说明**：
- 自动保存最近打开的10个文件夹
- 在侧边栏"最近打开"区域显示
- 点击文件夹名称快速切换工作目录
- 鼠标悬停显示删除按钮，可移除不需要的文件夹

**使用方法**：
1. 打开多个不同的文件夹，它们会自动保存到历史记录
2. 在侧边栏找到"最近打开"区域
3. 点击任意文件夹名称即可切换
4. 当前活动的文件夹会高亮显示

**应用场景**：
- 在多个项目文档之间快速切换
- 管理不同类别的笔记（工作、学习、个人）
- 临时查看其他文件夹，然后快速返回主工作区

详细文档请参考：[最近打开文件夹功能说明](docs/recent-folders-feature.md)

### 视图模式

- **预览模式**：只读查看，适合阅读
- **编辑模式**：纯编辑，适合专注写作
- **分栏模式**：左侧编辑，右侧实时预览

### 主题切换

点击右上角的月亮/太阳图标切换深色/浅色主题。

## ⚠️ 注意事项

### 独立版

- 需要使用 **Chrome 86+** 或 **Edge 86+** 浏览器
- Firefox 和 Safari 暂不支持 File System Access API
- 首次打开文件夹时，浏览器会请求权限，请允许访问

### 服务器版

- 需要安装 Node.js
- 启动时可以指定任意本地文件夹

## 🔧 浏览器兼容性

| 浏览器 | 独立版 | 服务器版 |
|--------|:------:|:--------:|
| Chrome 86+ | ✅ | ✅ |
| Edge 86+ | ✅ | ✅ |
| Firefox | ❌ | ✅ |
| Safari | ❌ | ✅ |

## 📁 项目结构

```
MDViewer/
├── server.js           # Express 服务器
├── package.json        # 项目配置
├── docs/               # 默认 Markdown 文件目录
│   └── welcome.md      # 示例文档
└── public/             # 静态资源
    ├── index.html      # 主页面
    ├── css/
    │   ├── style.css   # 主样式
    │   └── markdown.css # Markdown 渲染样式
    └── js/
        └── app.js      # 前端应用逻辑
```

## 📄 License

MIT License

---

Made with ❤️ by MD Viewer
