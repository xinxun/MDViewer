// MD Viewer 主应用
class MDViewer {
    constructor() {
        this.currentFile = null;
        this.currentContent = '';
        this.isModified = false;
        this.viewMode = 'view'; // view, edit, split
        
        this.initElements();
        this.initMarked();
        this.bindEvents();
        this.loadTheme();
        this.loadFiles();
    }
    
    // 初始化元素引用
    initElements() {
        this.sidebar = document.getElementById('sidebar');
        this.fileTree = document.getElementById('fileTree');
        this.searchInput = document.getElementById('searchInput');
        this.currentFileEl = document.getElementById('currentFile');
        this.welcomePage = document.getElementById('welcomePage');
        this.editorContainer = document.getElementById('editorContainer');
        this.previewContainer = document.getElementById('previewContainer');
        this.contentArea = document.getElementById('contentArea');
        this.editor = document.getElementById('editor');
        this.preview = document.getElementById('preview');
        this.saveBtn = document.getElementById('saveBtn');
        this.newFileModal = document.getElementById('newFileModal');
        this.newFileName = document.getElementById('newFileName');
        this.toastContainer = document.getElementById('toastContainer');
    }
    
    // 初始化 Marked 配置
    initMarked() {
        // PlantUML 服务器配置
        this.plantumlServer = 'https://www.plantuml.com/plantuml';
        
        // 配置 marked
        marked.setOptions({
            gfm: true,
            breaks: true,
            pedantic: false,
            sanitize: false,
            smartLists: true,
            smartypants: true,
            highlight: (code, lang) => {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (e) {
                        console.error(e);
                    }
                }
                return hljs.highlightAuto(code).value;
            }
        });
        
        // 自定义渲染器
        const renderer = new marked.Renderer();
        
        // Mermaid 代码预处理 - 自动修复常见语法问题
        this.preprocessMermaid = (code) => {
            let result = code;
            
            // 检测是否为时序图
            const isSequenceDiagram = /^\s*sequenceDiagram\s*$/m.test(result);
            
            // 处理时序图中的 Mermaid 保留字作为 participant 名称
            if (isSequenceDiagram) {
                const reservedWords = ['break', 'end', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'critical', 'option', 'section', 'rect', 'note', 'activate', 'deactivate'];
                
                // 处理 participant 声明中的保留字
                result = result.replace(
                    /^(\s*)(participant|actor)\s+(\w+)\s+as\s+(\w+)$/gmi,
                    (match, indent, keyword, id, alias) => {
                        if (reservedWords.includes(id.toLowerCase())) {
                            return `${indent}${keyword} ${id}_ as ${alias}`;
                        }
                        return match;
                    }
                );
                
                // 修复消息中引用这些 ID 的地方
                reservedWords.forEach(word => {
                    const regex = new RegExp(`(--?>>?|--?[x)]|--?>)(${word})(:)`, 'gi');
                    result = result.replace(regex, `$1${word}_$3`);
                    const regex2 = new RegExp(`^(\\s*)(${word})(--?>>?|--?[x)]|--?>)`, 'gmi');
                    result = result.replace(regex2, `$1${word}_$3`);
                });
            }
            
            // 处理时序图消息中的特殊字符（括号等）
            if (isSequenceDiagram) {
                // 匹配时序图消息: Actor->>Actor: Message
                // 支持的箭头: -> --> ->> -->> -x --x -) --)
                result = result.replace(
                    /^(\s*)(\w+)(--?>>?|--?[x)]|--?>)(\w+):\s*(.+)$/gm,
                    (match, indent, from, arrow, to, message) => {
                        if (message.startsWith('"') && message.endsWith('"')) {
                            return match;
                        }
                        // 用引号包裹含括号的消息
                        const hasSpecialChars = /[(){}[\]<>]/.test(message);
                        if (hasSpecialChars) {
                            const escapedMessage = message.replace(/"/g, "'");
                            return `${indent}${from}${arrow}${to}: "${escapedMessage}"`;
                        }
                        return match;
                    }
                );
                
                // 处理 Note 语句
                result = result.replace(
                    /^(\s*)(Note\s+(?:left|right|over)\s+[\w,\s]+):\s*(.+)$/gmi,
                    (match, indent, notePrefix, message) => {
                        if (message.startsWith('"') && message.endsWith('"')) {
                            return match;
                        }
                        const hasSpecialChars = /[(){}[\]<>&;#]/.test(message);
                        if (hasSpecialChars) {
                            const escapedMessage = message.replace(/"/g, '\\"');
                            return `${indent}${notePrefix}: "${escapedMessage}"`;
                        }
                        return match;
                    }
                );
            }
            
            // 处理节点标签中的特殊字符 - 仅用于流程图
            if (!isSequenceDiagram) {
                result = result.replace(/(\w+)\[((?:[^\[\]]|\n)+)\]/g, (match, id, label) => {
                    if (label.startsWith('"') && label.endsWith('"')) {
                        return match;
                    }
                    const hasSpecialChars = /[()/:&]/.test(label);
                    if (hasSpecialChars) {
                        let fixedLabel = label.trim().replace(/\n\s*/g, '<br>');
                        fixedLabel = fixedLabel.replace(/"/g, '#quot;');
                        return `${id}["${fixedLabel}"]`;
                    }
                    return match;
                });
            }
            
            return result;
        };
        
        // PlantUML 编码函数
        this.encodePlantUML = (code) => {
            // 确保代码包含 @startuml 和 @enduml
            let fullCode = code.trim();
            if (!fullCode.startsWith('@start')) {
                fullCode = '@startuml\n' + fullCode + '\n@enduml';
            }
            
            // 使用 plantuml-encoder 库进行编码
            if (typeof plantumlEncoder !== 'undefined') {
                return plantumlEncoder.encode(fullCode);
            }
            
            console.warn('[PlantUML] plantuml-encoder 库未加载');
            return null;
        };
        
        // 自定义代码块渲染器，处理 Mermaid 和 PlantUML
        renderer.code = (code, language) => {
            // 如果是 mermaid 代码块
            if (language === 'mermaid') {
                const processedCode = this.preprocessMermaid(code);
                return `<div class="mermaid">${processedCode}</div>`;
            }
            
            // 如果是 PlantUML 代码块
            if (language === 'plantuml' || language === 'puml') {
                const uniqueId = `plantuml-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                return `<div class="plantuml" id="${uniqueId}" data-plantuml-code="${encodeURIComponent(code)}">
                    <div class="plantuml-loading">
                        <i class="fas fa-spinner fa-spin"></i> 正在生成 PlantUML 图表...
                    </div>
                </div>`;
            }
            
            // 其他代码块正常处理
            let highlighted;
            if (language && hljs.getLanguage(language)) {
                try {
                    highlighted = hljs.highlight(code, { language: language }).value;
                } catch (e) {
                    console.error(e);
                    highlighted = hljs.highlightAuto(code).value;
                }
            } else {
                highlighted = hljs.highlightAuto(code).value;
            }
            
            return `<pre><code class="hljs language-${language || 'plaintext'}">${highlighted}</code></pre>`;
        };
        
        // 任务列表支持
        renderer.listitem = (text) => {
            if (text.startsWith('<input')) {
                return `<li class="task-list-item">${text}</li>`;
            }
            return `<li>${text}</li>`;
        };
        
        // 为标题添加锚点
        renderer.heading = (text, level) => {
            const slug = text.toLowerCase()
                .replace(/[\s]+/g, '-')
                .replace(/[^\w\u4e00-\u9fa5-]/g, '');
            return `<h${level} id="${slug}">${text}</h${level}>`;
        };
        
        // 图片添加点击放大
        renderer.image = (href, title, text) => {
            const titleAttr = title ? ` title="${title}"` : '';
            return `<img src="${href}" alt="${text}"${titleAttr} loading="lazy" onclick="window.open('${href}', '_blank')">`;
        };
        
        // 链接在新窗口打开
        renderer.link = (href, title, text) => {
            const titleAttr = title ? ` title="${title}"` : '';
            const external = href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
            return `<a href="${href}"${titleAttr}${external}>${text}</a>`;
        };
        
        marked.use({ renderer });
    }
    
    // 绑定事件
    bindEvents() {
        // 侧边栏切换
        document.getElementById('toggleSidebar').addEventListener('click', () => {
            this.sidebar.classList.add('collapsed');
            document.getElementById('showSidebar').style.display = 'flex';
        });
        
        document.getElementById('showSidebar').addEventListener('click', () => {
            this.sidebar.classList.remove('collapsed');
            document.getElementById('showSidebar').style.display = 'none';
        });
        
        // 查看功能演示按钮
        const showDemoBtn = document.getElementById('showDemoBtn');
        if (showDemoBtn) {
            showDemoBtn.addEventListener('click', () => {
                this.showFeaturesDemo();
            });
        }
        
        // 刷新文件列表
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadFiles();
        });
        
        // 搜索
        this.searchInput.addEventListener('input', (e) => {
            this.filterFiles(e.target.value);
        });
        
        // 视图切换
        document.getElementById('viewBtn').addEventListener('click', () => this.setViewMode('view'));
        document.getElementById('editBtn').addEventListener('click', () => this.setViewMode('edit'));
        document.getElementById('splitBtn').addEventListener('click', () => this.setViewMode('split'));
        
        // 保存
        this.saveBtn.addEventListener('click', () => this.saveFile());
        
        // 导出功能
        this.initExportFeature();
        
        // 编辑器内容变化
        this.editor.addEventListener('input', () => {
            this.isModified = true;
            this.updatePreview();
        });
        
        // 快捷键
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 's') {
                    e.preventDefault();
                    this.saveFile();
                }
            }
        });
        
        // 主题切换
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });
        
        // 新建文件
        document.getElementById('newFileBtn').addEventListener('click', () => {
            this.newFileModal.classList.add('show');
            this.newFileName.value = '';
            this.newFileName.focus();
        });
        
        document.getElementById('closeModal').addEventListener('click', () => {
            this.newFileModal.classList.remove('show');
        });
        
        document.getElementById('cancelNewFile').addEventListener('click', () => {
            this.newFileModal.classList.remove('show');
        });
        
        document.getElementById('confirmNewFile').addEventListener('click', () => {
            this.createNewFile();
        });
        
        this.newFileName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.createNewFile();
            }
        });
        
        // 点击弹窗背景关闭
        this.newFileModal.addEventListener('click', (e) => {
            if (e.target === this.newFileModal) {
                this.newFileModal.classList.remove('show');
            }
        });
    }
    
    // 加载文件列表
    async loadFiles() {
        this.fileTree.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
        
        try {
            const response = await fetch('/api/files');
            const data = await response.json();
            
            if (data.success) {
                this.renderFileTree(data.files);
            } else {
                this.showToast('加载文件列表失败: ' + data.error, 'error');
            }
        } catch (error) {
            this.showToast('网络错误: ' + error.message, 'error');
        }
    }
    
    // 渲染文件树
    renderFileTree(files, container = null) {
        if (!container) {
            this.fileTree.innerHTML = '';
            container = this.fileTree;
        }
        
        if (files.length === 0) {
            container.innerHTML = `
                <div class="empty">
                    <i class="fas fa-folder-open"></i>
                    <p>没有找到 Markdown 文件</p>
                    <p>点击"新建文档"创建第一个文件</p>
                </div>
            `;
            return;
        }
        
        files.forEach(item => {
            const div = document.createElement('div');
            div.className = 'tree-item';
            div.dataset.path = item.path;
            div.dataset.type = item.type;
            
            if (item.type === 'folder') {
                div.innerHTML = `
                    <div class="tree-item-content">
                        <i class="fas fa-chevron-right chevron"></i>
                        <i class="fas fa-folder folder-icon"></i>
                        <span>${item.name}</span>
                    </div>
                    <div class="tree-children"></div>
                `;
                
                const content = div.querySelector('.tree-item-content');
                const children = div.querySelector('.tree-children');
                const chevron = div.querySelector('.chevron');
                
                content.addEventListener('click', () => {
                    children.classList.toggle('open');
                    chevron.classList.toggle('open');
                });
                
                if (item.children && item.children.length > 0) {
                    this.renderFileTree(item.children, children);
                }
            } else {
                div.innerHTML = `
                    <div class="tree-item-content">
                        <i class="fas fa-file-alt file-icon"></i>
                        <span>${item.name}</span>
                    </div>
                `;
                
                div.querySelector('.tree-item-content').addEventListener('click', () => {
                    this.loadFile(item.path);
                });
            }
            
            container.appendChild(div);
        });
    }
    
    // 过滤文件
    filterFiles(keyword) {
        const items = this.fileTree.querySelectorAll('.tree-item');
        const lowerKeyword = keyword.toLowerCase();
        
        items.forEach(item => {
            const name = item.dataset.path.toLowerCase();
            if (name.includes(lowerKeyword)) {
                item.style.display = '';
                // 展开父文件夹
                let parent = item.parentElement;
                while (parent && parent.classList.contains('tree-children')) {
                    parent.classList.add('open');
                    const chevron = parent.previousElementSibling?.querySelector('.chevron');
                    if (chevron) chevron.classList.add('open');
                    parent = parent.parentElement?.parentElement;
                }
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    // 加载文件内容
    async loadFile(filePath) {
        // 检查是否有未保存的修改
        if (this.isModified) {
            if (!confirm('当前文件有未保存的修改，是否继续？')) {
                return;
            }
        }
        
        try {
            const response = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
            const data = await response.json();
            
            if (data.success) {
                this.currentFile = filePath;
                this.currentContent = data.content;
                this.isModified = false;
                
                // 更新 UI
                this.currentFileEl.textContent = filePath;
                this.editor.value = data.content;
                this.updatePreview();
                
                // 更新文件树选中状态
                this.fileTree.querySelectorAll('.tree-item-content').forEach(el => {
                    el.classList.remove('active');
                });
                const activeItem = this.fileTree.querySelector(`[data-path="${filePath}"] .tree-item-content`);
                if (activeItem) {
                    activeItem.classList.add('active');
                }
                
                // 显示内容区域
                this.welcomePage.style.display = 'none';
                this.setViewMode(this.viewMode);
                
                this.showToast('文件加载成功', 'success');
            } else {
                this.showToast('加载文件失败: ' + data.error, 'error');
            }
        } catch (error) {
            this.showToast('网络错误: ' + error.message, 'error');
        }
    }
    
    // 保存文件
    async saveFile() {
        if (!this.currentFile) {
            this.showToast('没有打开的文件', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/api/file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: this.currentFile,
                    content: this.editor.value
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.currentContent = this.editor.value;
                this.isModified = false;
                this.showToast('保存成功', 'success');
            } else {
                this.showToast('保存失败: ' + data.error, 'error');
            }
        } catch (error) {
            this.showToast('网络错误: ' + error.message, 'error');
        }
    }
    
    // 创建新文件
    async createNewFile() {
        const fileName = this.newFileName.value.trim();
        if (!fileName) {
            this.showToast('请输入文件名', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/api/file/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: fileName
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.newFileModal.classList.remove('show');
                this.showToast('文件创建成功', 'success');
                await this.loadFiles();
                await this.loadFile(data.path);
            } else {
                this.showToast('创建失败: ' + data.error, 'error');
            }
        } catch (error) {
            this.showToast('网络错误: ' + error.message, 'error');
        }
    }
    
    // 设置视图模式
    setViewMode(mode) {
        this.viewMode = mode;
        
        // 更新按钮状态
        document.querySelectorAll('.view-toggle .btn-toggle').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (mode === 'view') {
            document.getElementById('viewBtn').classList.add('active');
            this.editorContainer.style.display = 'none';
            this.previewContainer.style.display = 'flex';
            this.saveBtn.style.display = 'none';
            this.contentArea.classList.remove('split-mode');
        } else if (mode === 'edit') {
            document.getElementById('editBtn').classList.add('active');
            this.editorContainer.style.display = 'flex';
            this.previewContainer.style.display = 'none';
            this.saveBtn.style.display = 'flex';
            this.contentArea.classList.remove('split-mode');
        } else if (mode === 'split') {
            document.getElementById('splitBtn').classList.add('active');
            this.editorContainer.style.display = 'flex';
            this.previewContainer.style.display = 'flex';
            this.saveBtn.style.display = 'flex';
            this.contentArea.classList.add('split-mode');
        }
    }
    
    // 更新预览
    updatePreview() {
        const content = this.editor.value;
        this.preview.innerHTML = marked.parse(content);
        
        // 重新高亮代码块
        this.preview.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
        
        // 渲染 Mermaid 图表
        if (typeof mermaid !== 'undefined') {
            const mermaidElements = this.preview.querySelectorAll('.mermaid');
            if (mermaidElements.length > 0) {
                mermaidElements.forEach((element, index) => {
                    element.id = `mermaid-${Date.now()}-${index}`;
                });
                mermaid.run({ nodes: mermaidElements });
            }
        }
        
        // 渲染 PlantUML 图表
        this.renderPlantUML();
    }
    
    // 渲染 PlantUML 图表
    renderPlantUML() {
        const plantumlElements = this.preview.querySelectorAll('.plantuml');
        if (plantumlElements.length === 0) return;
        
        plantumlElements.forEach((element) => {
            const code = decodeURIComponent(element.getAttribute('data-plantuml-code'));
            if (!code) return;
            
            // 编码 PlantUML 代码
            const encoded = this.encodePlantUML(code);
            if (!encoded) {
                element.innerHTML = `
                    <div class="plantuml-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>PlantUML 编码器未加载</span>
                    </div>`;
                return;
            }
            
            const format = 'svg';
            const imgUrl = `${this.plantumlServer}/${format}/${encoded}`;
            
            // 创建图片元素
            const img = new Image();
            img.onload = () => {
                element.innerHTML = '';
                element.appendChild(img);
            };
            img.onerror = () => {
                element.innerHTML = `
                    <div class="plantuml-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>PlantUML 图表渲染失败</span>
                        <details>
                            <summary>查看原始代码</summary>
                            <pre><code>${this.escapeHtml(code)}</code></pre>
                        </details>
                    </div>`;
            };
            img.src = imgUrl;
            img.alt = 'PlantUML Diagram';
            img.className = 'plantuml-diagram';
        });
    }
    
    // HTML 转义辅助函数
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // 主题切换
    toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('md-viewer-theme', newTheme);
        
        // 更新图标
        const icon = document.querySelector('#themeToggle i');
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    
    // 加载主题
    loadTheme() {
        const savedTheme = localStorage.getItem('md-viewer-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        const icon = document.querySelector('#themeToggle i');
        icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    
    // 显示 Toast 提示
    showToast(message, type = 'info') {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${icons[type]}"></i>
            <span>${message}</span>
        `;
        
        this.toastContainer.appendChild(toast);
        
        // 3秒后自动消失
        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
    
    /**
     * 显示功能演示文档
     */
    showFeaturesDemo() {
        const demoContent = `# 🎨 MD Viewer 功能演示

欢迎使用 MD Viewer！这是一个功能强大的 Markdown 阅读器。

---

## 📊 Mermaid 图表

### 流程图

\`\`\`mermaid
graph TD
    A[开始] --> B{是否登录?}
    B -->|是| C[显示主页]
    B -->|否| D[跳转登录]
    D --> E[用户登录]
    E --> C
\`\`\`

### 时序图

\`\`\`mermaid
sequenceDiagram
    participant 用户
    participant 服务器
    participant 数据库
    
    用户->>服务器: 发送请求
    服务器->>数据库: 查询数据
    数据库-->>服务器: 返回结果
    服务器-->>用户: 响应
\`\`\`

### 饼图

\`\`\`mermaid
pie title 支持的功能
    "Markdown" : 30
    "代码高亮" : 20
    "Mermaid" : 25
    "PlantUML" : 25
\`\`\`

---

## 🏗️ PlantUML 图表

### 时序图

\`\`\`plantuml
@startuml
actor 用户
participant "前端" as F
participant "后端" as B

用户 -> F: 请求
F -> B: API调用
B --> F: 响应
F --> 用户: 显示
@enduml
\`\`\`

### 类图

\`\`\`plantuml
@startuml
class MDViewer {
    + loadFile()
    + saveFile()
    + updatePreview()
}

class Editor {
    + getValue()
    + setValue()
}

MDViewer *-- Editor
@enduml
\`\`\`

### 思维导图

\`\`\`plantuml
@startmindmap
* MD Viewer
** 文件管理
** 编辑功能
** 渲染支持
*** Mermaid
*** PlantUML
** 主题切换
@endmindmap
\`\`\`

---

## 💻 代码高亮

\`\`\`javascript
async function hello() {
    const message = 'Hello, MD Viewer!';
    console.log(message);
    return message;
}
\`\`\`

---

## 📋 表格

| 功能 | Mermaid | PlantUML |
|------|:-------:|:--------:|
| 流程图 | ✅ | ✅ |
| 时序图 | ✅ | ✅ |
| 思维导图 | ❌ | ✅ |

---

> 💡 从左侧选择 Markdown 文件开始使用！
`;

        this.welcomePage.style.display = 'none';
        this.previewContainer.style.display = 'block';
        this.editorContainer.style.display = 'none';
        this.currentFileEl.textContent = '📖 功能演示 (内置文档)';
        
        this.preview.innerHTML = marked.parse(demoContent);
        
        // 代码高亮
        this.preview.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
        
        // 渲染 Mermaid
        if (typeof mermaid !== 'undefined') {
            const mermaidElements = this.preview.querySelectorAll('.mermaid');
            if (mermaidElements.length > 0) {
                mermaidElements.forEach((element, index) => {
                    element.id = `mermaid-demo-${Date.now()}-${index}`;
                });
                mermaid.run({ nodes: mermaidElements });
            }
        }
        
        // 渲染 PlantUML
        this.renderPlantUML();
        
        this.showToast('正在加载功能演示...', 'info');
    }
    
    // ==================== 导出功能 ====================
    
    initExportFeature() {
        const exportBtn = document.getElementById('exportBtn');
        const exportMenu = document.getElementById('exportMenu');
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        const exportWordBtn = document.getElementById('exportWordBtn');
        const exportHtmlBtn = document.getElementById('exportHtmlBtn');
        
        if (!exportBtn || !exportMenu) return;
        
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu.classList.toggle('show');
        });
        
        document.addEventListener('click', () => {
            exportMenu.classList.remove('show');
        });
        
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                exportMenu.classList.remove('show');
                this.exportToPdf();
            });
        }
        
        if (exportWordBtn) {
            exportWordBtn.addEventListener('click', () => {
                exportMenu.classList.remove('show');
                this.exportToWord();
            });
        }
        
        if (exportHtmlBtn) {
            exportHtmlBtn.addEventListener('click', () => {
                exportMenu.classList.remove('show');
                this.exportToHtml();
            });
        }
    }
    
    getExportFileName() {
        const currentFile = this.currentFileEl.textContent;
        if (!currentFile || currentFile.includes('请选择') || currentFile.includes('功能演示')) {
            return 'document';
        }
        const fileName = currentFile.split('/').pop().split('\\').pop();
        return fileName.replace(/\.(md|markdown)$/i, '') || 'document';
    }
    
    showExportProgress(message) {
        const overlay = document.createElement('div');
        overlay.className = 'export-overlay';
        overlay.id = 'exportOverlay';
        overlay.innerHTML = `
            <div class="export-progress">
                <i class="fas fa-spinner"></i>
                <p>${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    
    hideExportProgress() {
        const overlay = document.getElementById('exportOverlay');
        if (overlay) overlay.remove();
    }
    
    getExportStyles() {
        return `
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", Helvetica, Arial, sans-serif;
                font-size: 16px;
                line-height: 1.6;
                color: #24292e;
                background: #fff;
                padding: 40px;
                max-width: 900px;
                margin: 0 auto;
            }
            h1, h2, h3, h4, h5, h6 {
                margin-top: 24px;
                margin-bottom: 16px;
                font-weight: 600;
                line-height: 1.25;
            }
            h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
            h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
            h3 { font-size: 1.25em; }
            p { margin: 0 0 16px 0; }
            code {
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
                font-size: 85%;
                background-color: rgba(27,31,35,0.05);
                padding: 0.2em 0.4em;
                border-radius: 3px;
            }
            pre {
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
                font-size: 85%;
                background-color: #f6f8fa;
                border-radius: 6px;
                padding: 16px;
                overflow: auto;
            }
            pre code { background: transparent; padding: 0; }
            blockquote {
                margin: 0 0 16px 0;
                padding: 0 1em;
                color: #6a737d;
                border-left: 0.25em solid #dfe2e5;
            }
            table { border-collapse: collapse; width: 100%; margin: 16px 0; }
            th, td { border: 1px solid #dfe2e5; padding: 6px 13px; }
            th { font-weight: 600; background-color: #f6f8fa; }
            ul, ol { margin: 0 0 16px 0; padding-left: 2em; }
            img, svg { max-width: 100%; height: auto; }
            .mermaid, .plantuml { text-align: center; margin: 24px 0; page-break-inside: avoid; }
        `;
    }
    
    getExportHtmlContent() {
        const content = this.preview.cloneNode(true);
        content.querySelectorAll('.zoom-hint, .copy-btn, .plantuml-loading').forEach(el => el.remove());
        return content.innerHTML;
    }
    
    async exportToPdf() {
        if (!this.preview.innerHTML || this.preview.innerHTML.trim() === '') {
            this.showToast('没有可导出的内容', 'warning');
            return;
        }
        
        const fileName = this.getExportFileName();
        
        // 使用浏览器打印功能导出PDF（效果最好）
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            this.showToast('请允许弹出窗口以导出PDF', 'warning');
            return;
        }
        
        printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${fileName}</title>
    <style>${this.getExportStyles()}</style>
</head>
<body>
    ${this.getExportHtmlContent()}
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                window.onafterprint = function() { window.close(); };
            }, 500);
        };
    <\/script>
</body>
</html>`);
        printWindow.document.close();
        this.showToast('请在打印对话框中选择"另存为PDF"', 'info');
    }
    
    async exportToWord() {
        if (!this.preview.innerHTML || this.preview.innerHTML.trim() === '') {
            this.showToast('没有可导出的内容', 'warning');
            return;
        }
        
        const fileName = this.getExportFileName();
        this.showExportProgress('正在生成 Word 文档...');
        
        try {
            const content = this.preview.cloneNode(true);
            content.querySelectorAll('.zoom-hint, .copy-btn, .plantuml-loading').forEach(el => el.remove());
            
            const htmlContent = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <title>${fileName}</title>
    <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
    <style>
        @page { size: A4; margin: 2cm; }
        body { font-family: "Microsoft YaHei", Arial, sans-serif; font-size: 12pt; line-height: 1.6; }
        h1 { font-size: 22pt; font-weight: bold; border-bottom: 1pt solid #ccc; }
        h2 { font-size: 18pt; font-weight: bold; }
        h3 { font-size: 14pt; font-weight: bold; }
        code { font-family: Consolas, monospace; background-color: #f5f5f5; padding: 2pt 4pt; }
        pre { font-family: Consolas, monospace; background-color: #f5f5f5; padding: 12pt; white-space: pre-wrap; }
        pre code { background: none; padding: 0; }
        blockquote { border-left: 4pt solid #ddd; padding-left: 12pt; color: #666; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1pt solid #000; padding: 6pt; }
        th { background-color: #f0f0f0; }
        img { max-width: 100%; }
        .mermaid, .plantuml { text-align: center; margin: 18pt 0; }
    </style>
</head>
<body>${content.innerHTML}</body>
</html>`;
            
            const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword;charset=utf-8' });
            
            if (typeof saveAs !== 'undefined') {
                saveAs(blob, `${fileName}.doc`);
            } else {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `${fileName}.doc`;
                link.click();
                URL.revokeObjectURL(link.href);
            }
            
            this.hideExportProgress();
            this.showToast(`已导出: ${fileName}.doc`, 'success');
        } catch (error) {
            this.hideExportProgress();
            this.showToast('Word导出失败: ' + error.message, 'error');
        }
    }
    
    async exportToHtml() {
        if (!this.preview.innerHTML || this.preview.innerHTML.trim() === '') {
            this.showToast('没有可导出的内容', 'warning');
            return;
        }
        
        const fileName = this.getExportFileName();
        
        try {
            const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${fileName}</title>
    <style>
        ${this.getExportStyles()}
        .mermaid { text-align: center; margin: 24px 0; }
        .plantuml { text-align: center; margin: 24px 0; }
        .hljs { display: block; overflow-x: auto; padding: 0.5em; background: #f6f8fa; }
        .hljs-comment { color: #6a737d; }
        .hljs-keyword { color: #d73a49; }
        .hljs-string { color: #032f62; }
        .hljs-number { color: #005cc5; }
        .hljs-function { color: #6f42c1; }
    </style>
</head>
<body>${this.getExportHtmlContent()}</body>
</html>`;
            
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            if (typeof saveAs !== 'undefined') {
                saveAs(blob, `${fileName}.html`);
            } else {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `${fileName}.html`;
                link.click();
                URL.revokeObjectURL(link.href);
            }
            this.showToast(`已导出: ${fileName}.html`, 'success');
        } catch (error) {
            this.showToast('HTML导出失败: ' + error.message, 'error');
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.mdViewer = new MDViewer();
});
