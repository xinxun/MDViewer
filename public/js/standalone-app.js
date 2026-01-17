// MD Viewer - 纯前端版本 (使用 File System Access API)
class MDViewerStandalone {
    constructor() {
        this.directoryHandle = null;
        this.currentFileHandle = null;
        this.currentContent = '';
        this.isModified = false;
        this.viewMode = 'split'; // 默认分栏模式
        this.fileHandles = new Map();
        this.manualEncoding = 'auto';
        this.splitRatio = 50; // 分栏比例（百分比）
        this.isResizing = false;
        this.dbName = 'md-viewer-db';
        this.storeName = 'folders';
        this.recentFoldersStore = 'recentFolders';
        this.maxRecentFolders = 10; // 最多保存10个最近目录
        this.globalSearchResultsData = []; // 全局搜索结果数据
        
        this.initElements();
        this.initMarked();
        this.bindEvents();
        this.loadTheme();
        this.loadTocState();
        this.checkBrowserSupport();
        this.initDB().then(() => {
            this.restoreLastFolder();
            this.loadRecentFolders();
        });
        this.initDiagramZoom();
    }
    
    // 检查浏览器支持
    checkBrowserSupport() {
        if (!('showDirectoryPicker' in window)) {
            this.showToast('您的浏览器不支持文件系统访问 API，建议使用最新版 Chrome/Edge', 'warning');
            this.fileTree.innerHTML = `
                <div class="empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p style="color: #dc3545;">浏览器不支持</p>
                    <p style="font-size: 12px;">请使用 Chrome、Edge 或其他支持 File System Access API 的浏览器</p>
                </div>
            `;
        } else {
            this.fileTree.innerHTML = `
                <div class="empty">
                    <i class="fas fa-folder-open"></i>
                    <p>点击"打开文件夹"开始</p>
                    <p style="font-size: 12px;">选择包含 Markdown 文件的文件夹</p>
                </div>
            `;
        }
    }
    
    // 初始化 IndexedDB
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2); // 升级版本号以支持新的store
            
            request.onerror = () => {
                console.error('无法打开数据库');
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
                // 为最近文件夹创建新的object store
                if (!db.objectStoreNames.contains(this.recentFoldersStore)) {
                    db.createObjectStore(this.recentFoldersStore, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }
    
    // 保存文件夹句柄到 IndexedDB
    async saveFolderHandle(handle) {
        if (!this.db || !handle) return;
        
        try {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            await store.put(handle, 'lastFolder');
            console.log('文件夹句柄已保存');
        } catch (error) {
            console.error('保存文件夹句柄失败:', error);
        }
    }
    
    // 从 IndexedDB 恢复文件夹句柄
    async restoreLastFolder() {
        if (!this.db) return;
        
        try {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get('lastFolder');
            
            return new Promise((resolve) => {
                request.onsuccess = async () => {
                    const handle = request.result;
                    if (handle) {
                        // 检查是否仍有访问权限
                        const options = { mode: 'read' };
                        const permission = await handle.queryPermission(options);
                        
                        if (permission === 'granted') {
                            this.directoryHandle = handle;
                            this.showToast(`已自动打开上次的文件夹: ${handle.name}`, 'success');
                            await this.loadFiles();
                        } else if (permission === 'prompt') {
                            // 请求权限
                            const newPermission = await handle.requestPermission(options);
                            if (newPermission === 'granted') {
                                this.directoryHandle = handle;
                                this.showToast(`已恢复上次的文件夹: ${handle.name}`, 'success');
                                await this.loadFiles();
                            } else {
                                console.log('用户拒绝了访问权限');
                                this.fileTree.innerHTML = `
                                    <div class="empty">
                                        <i class="fas fa-folder-open"></i>
                                        <p>点击"打开文件夹"开始</p>
                                        <p style="font-size: 12px;">上次的文件夹需要重新授权</p>
                                    </div>
                                `;
                            }
                        } else {
                            console.log('没有访问权限');
                        }
                    }
                    resolve();
                };
                
                request.onerror = () => {
                    console.error('恢复文件夹句柄失败:', request.error);
                    resolve();
                };
            });
        } catch (error) {
            console.error('恢复上次文件夹失败:', error);
        }
    }
    
    // 添加文件夹到最近列表
    async addToRecentFolders(handle) {
        if (!this.db || !handle) return;
        
        try {
            // 先获取所有文件夹
            const folders = await this.getAllRecentFolders();
            
            // 使用 isSameEntry() 检查是否已存在同一文件夹
            let existingId = null;
            for (const f of folders) {
                try {
                    if (f.handle && await f.handle.isSameEntry(handle)) {
                        existingId = f.id;
                        break;
                    }
                } catch (e) {
                    // 如果 isSameEntry 失败（权限问题等），忽略
                }
            }
            
            // 确定需要删除的旧文件夹ID
            let oldestId = null;
            if (!existingId && folders.length >= this.maxRecentFolders) {
                // 如果不是更新现有项，且已达到上限，需要删除最旧的
                const sortedFolders = [...folders].sort((a, b) => a.timestamp - b.timestamp);
                oldestId = sortedFolders[0].id;
            }
            
            // 尝试获取父目录的名称作为路径提示（通过读取上一级的方式）
            // 注意：File System Access API 没有直接提供父目录名称
            // 我们使用一个唯一标识来区分同名文件夹
            const uniqueId = `${handle.name}_${Date.now()}`;
            
            // 创建新的事务进行写操作
            const transaction = this.db.transaction([this.recentFoldersStore], 'readwrite');
            const store = transaction.objectStore(this.recentFoldersStore);
            
            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log('文件夹已添加到最近列表:', handle.name);
                    // 重新加载最近文件夹列表（不使用await）
                    this.loadRecentFolders()
                        .then(() => resolve())
                        .catch(err => {
                            console.error('重新加载文件夹列表失败:', err);
                            resolve(); // 仍然resolve，因为添加操作已成功
                        });
                };
                
                transaction.onerror = () => {
                    console.error('添加到最近文件夹失败:', transaction.error);
                    reject(transaction.error);
                };
                
                // 如果已存在，删除旧的
                if (existingId) {
                    store.delete(existingId);
                }
                
                // 如果需要删除最旧的
                if (oldestId) {
                    store.delete(oldestId);
                }
                
                // 添加新的到列表
                const newEntry = {
                    handle: handle,
                    name: handle.name,
                    uniqueId: uniqueId,
                    timestamp: Date.now()
                };
                store.add(newEntry);
            });
        } catch (error) {
            console.error('添加到最近文件夹失败:', error);
        }
    }
    
    // 获取所有最近文件夹（辅助方法）
    async getAllRecentFolders() {
        if (!this.db) return [];
        
        const transaction = this.db.transaction([this.recentFoldersStore], 'readonly');
        const store = transaction.objectStore(this.recentFoldersStore);
        const request = store.getAll();
        
        return new Promise((resolve) => {
            request.onsuccess = () => {
                resolve(request.result || []);
            };
            
            request.onerror = () => {
                console.error('获取最近文件夹失败:', request.error);
                resolve([]);
            };
        });
    }
    
    // 加载最近文件夹列表
    async loadRecentFolders() {
        if (!this.db) return;
        
        try {
            const transaction = this.db.transaction([this.recentFoldersStore], 'readonly');
            const store = transaction.objectStore(this.recentFoldersStore);
            const request = store.getAll();
            
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    let folders = request.result || [];
                    // 按时间戳降序排序（最新的在前）
                    folders.sort((a, b) => b.timestamp - a.timestamp);
                    this.renderRecentFolders(folders);
                    resolve();
                };
                
                request.onerror = () => {
                    console.error('加载最近文件夹失败:', request.error);
                    resolve();
                };
            });
        } catch (error) {
            console.error('加载最近文件夹失败:', error);
        }
    }
    
    // 渲染最近文件夹列表
    renderRecentFolders(folders) {
        const container = document.getElementById('recentFoldersContainer');
        if (!container) return;
        
        if (folders.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        const listEl = document.getElementById('recentFoldersList');
        listEl.innerHTML = '';
        
        // 统计同名文件夹数量，用于显示区分标记
        const nameCount = {};
        folders.forEach(f => {
            nameCount[f.name] = (nameCount[f.name] || 0) + 1;
        });
        
        // 为同名文件夹生成显示后缀
        const nameIndex = {};
        const getDisplayInfo = (folder) => {
            const name = folder.name;
            if (nameCount[name] > 1) {
                // 有重复名称，使用时间戳生成区分标记
                if (!nameIndex[name]) nameIndex[name] = 0;
                nameIndex[name]++;
                const addedDate = new Date(folder.timestamp);
                const dateStr = addedDate.toLocaleDateString('zh-CN', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return {
                    displayName: `${name} (${nameIndex[name]})`,
                    tooltip: `${name}\n添加时间: ${dateStr}`
                };
            }
            return {
                displayName: name,
                tooltip: name
            };
        };
        
        // 异步检查当前高亮（使用 isSameEntry）
        const checkAndRenderItems = async () => {
            for (const folder of folders) {
                const { displayName, tooltip } = getDisplayInfo(folder);
                
                const item = document.createElement('div');
                item.className = 'recent-folder-item';
                item.innerHTML = `
                    <i class="fas fa-folder"></i>
                    <span class="folder-name" title="${tooltip.replace(/"/g, '&quot;')}">${displayName}</span>
                    <button class="btn-icon-small delete-folder" data-id="${folder.id}" title="从列表中移除">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                
                // 点击文件夹名称切换到该文件夹
                item.querySelector('.folder-name').addEventListener('click', async () => {
                    await this.switchToFolder(folder.handle);
                });
                
                item.querySelector('i.fa-folder').addEventListener('click', async () => {
                    await this.switchToFolder(folder.handle);
                });
                
                // 点击删除按钮从列表中移除
                item.querySelector('.delete-folder').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.removeRecentFolder(folder.id);
                });
                
                // 使用 isSameEntry 高亮当前文件夹
                if (this.directoryHandle && folder.handle) {
                    try {
                        if (await this.directoryHandle.isSameEntry(folder.handle)) {
                            item.classList.add('active');
                        }
                    } catch (e) {
                        // 如果检查失败，回退到名称比较
                        if (this.directoryHandle.name === folder.name) {
                            item.classList.add('active');
                        }
                    }
                }
                
                listEl.appendChild(item);
            }
        };
        
        checkAndRenderItems();
    }
    
    // 切换到指定文件夹
    async switchToFolder(handle) {
        if (!handle) return;
        
        try {
            // 检查权限
            const options = { mode: 'read' };
            const permission = await handle.queryPermission(options);
            
            if (permission === 'granted' || (permission === 'prompt' && await handle.requestPermission(options) === 'granted')) {
                this.directoryHandle = handle;
                await this.saveFolderHandle(handle);
                this.showToast(`已切换到文件夹: ${handle.name}`, 'success');
                await this.loadFiles();
                await this.loadRecentFolders(); // 更新高亮状态
            } else {
                this.showToast('无法访问该文件夹，权限被拒绝', 'error');
            }
        } catch (error) {
            console.error('切换文件夹失败:', error);
            this.showToast('切换文件夹失败: ' + error.message, 'error');
        }
    }
    
    // 从最近列表中移除文件夹
    async removeRecentFolder(id) {
        if (!this.db) return;
        
        try {
            const transaction = this.db.transaction([this.recentFoldersStore], 'readwrite');
            const store = transaction.objectStore(this.recentFoldersStore);
            
            return new Promise((resolve, reject) => {
                const request = store.delete(id);
                
                request.onsuccess = () => {
                    // 不使用await，而是用.then()
                    this.loadRecentFolders()
                        .then(() => {
                            this.showToast('已从列表中移除', 'info');
                            resolve();
                        })
                        .catch(err => {
                            console.error('重新加载文件夹列表失败:', err);
                            this.showToast('已从列表中移除', 'info');
                            resolve(); // 仍然resolve，因为删除操作已成功
                        });
                };
                
                request.onerror = () => {
                    console.error('移除文件夹失败:', request.error);
                    this.showToast('移除失败', 'error');
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('移除文件夹失败:', error);
            this.showToast('移除失败', 'error');
        }
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
        this.mainContent = document.querySelector('.main-content');
        this.editor = document.getElementById('editor');
        this.preview = document.getElementById('preview');
        this.saveBtn = document.getElementById('saveBtn');
        this.newFileModal = document.getElementById('newFileModal');
        this.newFileName = document.getElementById('newFileName');
        this.toastContainer = document.getElementById('toastContainer');
        this.encodingSelect = document.getElementById('encodingSelect');
        this.splitResizer = document.getElementById('splitResizer');
        this.currentFileName = document.getElementById('currentFile');
        
        // 目录面板元素
        this.tocPanel = document.getElementById('tocPanel');
        this.tocContent = document.getElementById('tocContent');
        this.tocToggle = document.getElementById('tocToggle');
        this.tocVisible = false;
        
        // 全局查找面板元素
        this.globalSearchPanel = document.getElementById('globalSearchPanel');
        this.globalSearchInput = document.getElementById('globalSearchInput');
        this.globalSearchStatus = document.getElementById('globalSearchStatus');
        this.globalSearchResults = document.getElementById('globalSearchResults');
        this.searchToggle = document.getElementById('searchToggle');
        this.fileContentsCache = new Map(); // 缓存文件内容用于搜索
    }
    
    // 初始化 Marked 配置
    initMarked() {
        // 初始化 Mermaid（根据主题自动切换）
        if (typeof mermaid !== 'undefined') {
            const isDark = document.body.getAttribute('data-theme') === 'dark';
            mermaid.initialize({
                startOnLoad: false,
                theme: isDark ? 'dark' : 'default',
                securityLevel: 'loose',
                flowchart: {
                    useMaxWidth: true,
                    htmlLabels: true,
                    curve: 'basis'
                },
                sequence: {
                    useMaxWidth: true,
                    wrap: true
                },
                gantt: {
                    useMaxWidth: true
                }
            });
        }
        
        // 配置 marked
        marked.setOptions({
            gfm: true,
            breaks: true,
            pedantic: false,
            sanitize: false,
            smartLists: true,
            smartypants: true
        });
        
        const renderer = new marked.Renderer();
        
        // 自定义代码块渲染器，处理 Mermaid
        renderer.code = (code, language) => {
            // 如果是 mermaid 代码块，直接返回 mermaid div
            if (language === 'mermaid') {
                return `<div class="mermaid">${code}</div>`;
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
        
        renderer.listitem = (text) => {
            if (text.startsWith('<input')) {
                return `<li class="task-list-item">${text}</li>`;
            }
            return `<li>${text}</li>`;
        };
        
        renderer.heading = (text, level) => {
            const slug = text.toLowerCase()
                .replace(/[\s]+/g, '-')
                .replace(/[^\w\u4e00-\u9fa5-]/g, '');
            return `<h${level} id="${slug}">${text}</h${level}>`;
        };
        
        renderer.image = (href, title, text) => {
            const titleAttr = title ? ` title="${title}"` : '';
            return `<img src="${href}" alt="${text}"${titleAttr} loading="lazy" onclick="window.open('${href}', '_blank')">`;
        };
        
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
            // 更新全局搜索面板位置
            if (this.globalSearchPanel) {
                this.globalSearchPanel.classList.add('sidebar-collapsed');
            }
        });
        
        document.getElementById('showSidebar').addEventListener('click', () => {
            this.sidebar.classList.remove('collapsed');
            document.getElementById('showSidebar').style.display = 'none';
            // 更新全局搜索面板位置
            if (this.globalSearchPanel) {
                this.globalSearchPanel.classList.remove('sidebar-collapsed');
            }
        });
        
        // 打开文件夹
        document.getElementById('openFolderBtn').addEventListener('click', () => {
            this.openFolder();
        });
        
        // 刷新文件列表
        document.getElementById('refreshBtn').addEventListener('click', () => {
            if (this.directoryHandle) {
                this.loadFiles();
            } else {
                this.showToast('请先打开一个文件夹', 'warning');
            }
        });
        
        // 搜索
        this.searchInput.addEventListener('input', (e) => {
            this.filterFiles(e.target.value);
        });
        
        // 视图切换
        document.getElementById('viewBtn').addEventListener('click', () => this.setViewMode('view'));
        document.getElementById('splitBtn').addEventListener('click', () => this.setViewMode('split'));
        
        // 保存
        this.saveBtn.addEventListener('click', () => this.saveFile());
        
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
                } else if (e.key === 'f') {
                    e.preventDefault();
                    this.toggleGlobalSearch();
                }
            }
            // ESC 关闭查找面板
            if (e.key === 'Escape' && this.globalSearchPanel && this.globalSearchPanel.classList.contains('show')) {
                this.closeGlobalSearch();
            }
        });
        
        // 主题切换
        document.getElementById('themeToggle').addEventListener('click', () => {
            this.toggleTheme();
        });
        
        // 全局查找功能
        if (this.searchToggle) {
            this.searchToggle.addEventListener('click', () => {
                this.toggleGlobalSearch();
            });
        }
        
        // 全局查找面板事件
        if (this.globalSearchInput) {
            // 回车执行搜索
            this.globalSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.performGlobalSearch();
                }
            });
        }
        
        // 全局查找按钮
        const globalSearchBtn = document.getElementById('globalSearchBtn');
        const globalSearchClose = document.getElementById('globalSearchClose');
        
        if (globalSearchBtn) {
            globalSearchBtn.addEventListener('click', () => this.performGlobalSearch());
        }
        if (globalSearchClose) {
            globalSearchClose.addEventListener('click', () => this.closeGlobalSearch());
        }
        
        // 目录切换
        if (this.tocToggle) {
            this.tocToggle.addEventListener('click', () => {
                this.toggleToc();
            });
        }
        
        // 目录关闭按钮
        const tocClose = document.getElementById('tocClose');
        if (tocClose) {
            tocClose.addEventListener('click', () => {
                this.hideToc();
            });
        }
        
        // 编码选择
        if (this.encodingSelect) {
            this.encodingSelect.addEventListener('change', (e) => {
                this.manualEncoding = e.target.value;
                if (this.currentFileHandle) {
                    // 重新加载当前文件
                    const currentPath = this.currentFileEl.textContent;
                    this.loadFile(currentPath);
                }
            });
        }
        
        // 分栏调整器
        if (this.splitResizer) {
            this.splitResizer.addEventListener('mousedown', (e) => {
                this.startResize(e);
            });
        }
        
        // 全局鼠标事件（用于拖动）
        document.addEventListener('mousemove', (e) => {
            if (this.isResizing) {
                this.resize(e);
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isResizing) {
                this.stopResize();
            }
        });
    }
    
    // 开始调整分栏大小
    startResize(e) {
        this.isResizing = true;
        this.contentArea.classList.add('resizing');
        this.splitResizer.classList.add('dragging');
        e.preventDefault();
    }
    
    // 调整分栏大小
    resize(e) {
        if (!this.isResizing) return;
        
        const rect = this.contentArea.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = (x / rect.width) * 100;
        
        // 限制在 20% - 80% 之间
        this.splitRatio = Math.max(20, Math.min(80, percentage));
        
        this.editorContainer.style.flex = `0 0 ${this.splitRatio}%`;
        this.editorContainer.style.maxWidth = `${this.splitRatio}%`;
        this.previewContainer.style.flex = `0 0 ${100 - this.splitRatio}%`;
        this.previewContainer.style.maxWidth = `${100 - this.splitRatio}%`;
        this.splitResizer.style.left = `${this.splitRatio}%`;
    }
    
    // 停止调整分栏大小
    stopResize() {
        this.isResizing = false;
        this.contentArea.classList.remove('resizing');
        this.splitResizer.classList.remove('dragging');
        
        // 保存分栏比例
        localStorage.setItem('md-viewer-split-ratio', this.splitRatio);
    }
    
    // 打开文件夹
    async openFolder() {
        try {
            this.directoryHandle = await window.showDirectoryPicker();
            // 保存文件夹句柄
            await this.saveFolderHandle(this.directoryHandle);
            // 添加到最近文件夹列表
            await this.addToRecentFolders(this.directoryHandle);
            this.showToast('文件夹已打开: ' + this.directoryHandle.name, 'success');
            await this.loadFiles();
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.showToast('打开文件夹失败: ' + error.message, 'error');
            }
        }
    }
    
    // 加载文件列表
    async loadFiles() {
        if (!this.directoryHandle) {
            this.showToast('请先打开一个文件夹', 'warning');
            return;
        }
        
        this.fileTree.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> 扫描文件...</div>';
        this.fileHandles.clear();
        
        try {
            const files = await this.scanDirectory(this.directoryHandle);
            this.renderFileTree(files);
        } catch (error) {
            this.showToast('扫描文件失败: ' + error.message, 'error');
            this.fileTree.innerHTML = `
                <div class="empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>扫描失败</p>
                </div>
            `;
        }
    }
    
    // 递归扫描目录
    async scanDirectory(dirHandle, relativePath = '') {
        const items = [];
        
        try {
            for await (const entry of dirHandle.values()) {
                const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
                
                if (entry.kind === 'directory') {
                    const children = await this.scanDirectory(entry, entryPath);
                    if (children.length > 0) {
                        items.push({
                            name: entry.name,
                            type: 'folder',
                            path: entryPath,
                            children: children,
                            handle: entry
                        });
                    }
                } else if (entry.kind === 'file' && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
                    items.push({
                        name: entry.name,
                        type: 'file',
                        path: entryPath,
                        handle: entry
                    });
                    this.fileHandles.set(entryPath, entry);
                }
            }
        } catch (error) {
            console.error('扫描目录错误:', error);
        }
        
        // 排序
        items.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'folder' ? -1 : 1;
            }
            return a.name.localeCompare(b.name, 'zh-CN');
        });
        
        return items;
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
    
    // 检测文件编码
    async detectEncoding(buffer) {
        const arr = new Uint8Array(buffer.slice(0, 3));
        
        // 检测 UTF-8 BOM
        if (arr[0] === 0xEF && arr[1] === 0xBB && arr[2] === 0xBF) {
            return 'utf-8';
        }
        
        // 检测 UTF-16 LE BOM
        if (arr[0] === 0xFF && arr[1] === 0xFE) {
            return 'utf-16le';
        }
        
        // 检测 UTF-16 BE BOM
        if (arr[0] === 0xFE && arr[1] === 0xFF) {
            return 'utf-16be';
        }
        
        // 尝试检测 GBK (简单启发式检测)
        const testArr = new Uint8Array(buffer.slice(0, Math.min(1000, buffer.byteLength)));
        let hasHighByte = false;
        
        for (let i = 0; i < testArr.length; i++) {
            if (testArr[i] > 127) {
                hasHighByte = true;
                break;
            }
        }
        
        // 如果有高位字节，尝试作为 UTF-8 解码
        if (hasHighByte) {
            try {
                const decoder = new TextDecoder('utf-8', { fatal: true });
                decoder.decode(testArr);
                return 'utf-8';
            } catch (e) {
                // UTF-8 解码失败，可能是 GBK
                return 'gbk';
            }
        }
        
        // 默认 UTF-8
        return 'utf-8';
    }
    
    // 解码文件内容
    async decodeFileContent(file) {
        const buffer = await file.arrayBuffer();
        
        // 如果用户手动选择了编码
        if (this.manualEncoding && this.manualEncoding !== 'auto') {
            try {
                const decoder = new TextDecoder(this.manualEncoding);
                return decoder.decode(buffer);
            } catch (error) {
                this.showToast(`使用 ${this.manualEncoding.toUpperCase()} 解码失败，尝试自动检测`, 'warning');
            }
        }
        
        // 自动检测编码
        const encoding = await this.detectEncoding(buffer);
        
        try {
            const decoder = new TextDecoder(encoding);
            const content = decoder.decode(buffer);
            if (encoding !== 'utf-8') {
                this.showToast(`文件使用 ${encoding.toUpperCase()} 编码`, 'info');
            }
            return content;
        } catch (error) {
            // 如果解码失败，尝试其他编码
            console.warn(`使用 ${encoding} 解码失败，尝试其他编码`);
            
            const encodings = ['utf-8', 'gbk', 'gb2312', 'gb18030', 'big5'];
            for (const enc of encodings) {
                if (enc === encoding) continue;
                try {
                    const decoder = new TextDecoder(enc);
                    const content = decoder.decode(buffer);
                    this.showToast(`文件使用 ${enc.toUpperCase()} 编码打开`, 'info');
                    return content;
                } catch (e) {
                    continue;
                }
            }
            
            // 最后尝试忽略错误
            const decoder = new TextDecoder('utf-8', { fatal: false });
            this.showToast('无法正确识别编码，可能显示乱码', 'warning');
            return decoder.decode(buffer);
        }
    }
    
    // 加载文件
    async loadFile(filePath) {
        if (this.isModified) {
            if (!confirm('当前文件有未保存的修改，是否继续？')) {
                return;
            }
        }
        
        try {
            const fileHandle = this.fileHandles.get(filePath);
            if (!fileHandle) {
                this.showToast('文件句柄未找到', 'error');
                return;
            }
            
            const file = await fileHandle.getFile();
            const content = await this.decodeFileContent(file);
            
            this.currentFileHandle = fileHandle;
            this.currentContent = content;
            this.isModified = false;
            
            this.currentFileEl.textContent = filePath;
            this.editor.value = content;
            this.updatePreview();
            
            // 更新文件树选中状态
            this.fileTree.querySelectorAll('.tree-item-content').forEach(el => {
                el.classList.remove('active');
            });
            const activeItem = this.fileTree.querySelector(`[data-path="${filePath}"] .tree-item-content`);
            if (activeItem) {
                activeItem.classList.add('active');
            }
            
            this.welcomePage.style.display = 'none';
            this.setViewMode(this.viewMode);
            
            this.showToast('文件已打开', 'success');
        } catch (error) {
            this.showToast('打开文件失败: ' + error.message, 'error');
        }
    }
    
    // 保存文件
    async saveFile() {
        if (!this.currentFileHandle) {
            this.showToast('没有打开的文件', 'warning');
            return;
        }
        
        try {
            const writable = await this.currentFileHandle.createWritable();
            await writable.write(this.editor.value);
            await writable.close();
            
            this.currentContent = this.editor.value;
            this.isModified = false;
            this.showToast('保存成功', 'success');
        } catch (error) {
            this.showToast('保存失败: ' + error.message, 'error');
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
            this.splitResizer.style.display = 'none';
            this.contentArea.classList.remove('split-mode');
        } else if (mode === 'split') {
            document.getElementById('splitBtn').classList.add('active');
            this.editorContainer.style.display = 'flex';
            this.previewContainer.style.display = 'flex';
            this.saveBtn.style.display = 'flex';
            this.splitResizer.style.display = 'block';
            this.contentArea.classList.add('split-mode');
            
            // 恢复保存的分栏比例
            const savedRatio = localStorage.getItem('md-viewer-split-ratio');
            if (savedRatio) {
                this.splitRatio = parseFloat(savedRatio);
            }
            
            // 应用分栏比例
            this.editorContainer.style.flex = `0 0 ${this.splitRatio}%`;
            this.editorContainer.style.maxWidth = `${this.splitRatio}%`;
            this.previewContainer.style.flex = `0 0 ${100 - this.splitRatio}%`;
            this.previewContainer.style.maxWidth = `${100 - this.splitRatio}%`;
            this.splitResizer.style.left = `${this.splitRatio}%`;
        }
    }
    
    // 更新预览
    updatePreview() {
        const content = this.editor.value;
        this.preview.innerHTML = marked.parse(content);
        
        // 重新高亮代码块
        this.preview.querySelectorAll('pre code:not(.mermaid)').forEach((block) => {
            hljs.highlightElement(block);
        });
        
        // 渲染 Mermaid 图表
        if (typeof mermaid !== 'undefined') {
            const mermaidElements = this.preview.querySelectorAll('.mermaid');
            console.log(`[Preview] 找到 ${mermaidElements.length} 个 Mermaid 元素待渲染`);
            
            if (mermaidElements.length > 0) {
                mermaidElements.forEach((element, index) => {
                    element.id = `mermaid-${Date.now()}-${index}`;
                });
                
                console.log('[Preview] 开始渲染 Mermaid 图表...');
                mermaid.run({
                    nodes: mermaidElements
                }).then(() => {
                    console.log('[Preview] Mermaid 渲染完成，准备绑定事件');
                    // Mermaid 渲染完成后，等待一小段时间确保 DOM 更新完成
                    setTimeout(() => {
                        this.attachDiagramZoomHandlers();
                        console.log('[Preview] 事件绑定延迟执行完成');
                    }, 100);
                }).catch(err => {
                    console.error('[Preview] Mermaid 渲染错误:', err);
                });
            }
        } else {
            console.warn('[Preview] Mermaid 未定义！');
        }
        
        // 渲染数学公式
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(this.preview, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false
            });
        }
        
        // 更新目录
        this.updateToc();
    }
    
    // ==================== 目录功能 ====================
    
    // 切换目录显示
    toggleToc() {
        if (this.tocVisible) {
            this.hideToc();
        } else {
            this.showToc();
        }
    }
    
    // 显示目录
    showToc() {
        this.tocVisible = true;
        this.tocPanel.classList.remove('hidden');
        this.contentArea.classList.add('toc-visible');
        this.tocToggle.classList.add('active');
        localStorage.setItem('md-viewer-toc-visible', 'true');
    }
    
    // 隐藏目录
    hideToc() {
        this.tocVisible = false;
        this.tocPanel.classList.add('hidden');
        this.contentArea.classList.remove('toc-visible');
        this.tocToggle.classList.remove('active');
        localStorage.setItem('md-viewer-toc-visible', 'false');
    }
    
    // 更新目录内容
    updateToc() {
        if (!this.tocContent) return;
        
        // 从预览区域获取所有标题
        const headings = this.preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
        
        if (headings.length === 0) {
            this.tocContent.innerHTML = '<div class="toc-empty">暂无目录</div>';
            return;
        }
        
        // 生成目录列表
        const tocItems = [];
        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName.charAt(1));
            const text = heading.textContent;
            const id = heading.id || `heading-${index}`;
            
            // 确保标题有 id 用于跳转
            if (!heading.id) {
                heading.id = id;
            }
            
            tocItems.push(`
                <a class="toc-item toc-h${level}" href="#${id}" data-target="${id}" title="${text}">
                    ${text}
                </a>
            `);
        });
        
        this.tocContent.innerHTML = tocItems.join('');
        
        // 绑定点击事件
        this.tocContent.querySelectorAll('.toc-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = item.dataset.target;
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    // 滚动到目标位置
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    
                    // 高亮当前目录项
                    this.tocContent.querySelectorAll('.toc-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    
                    // 闪烁效果
                    targetElement.style.transition = 'background-color 0.3s';
                    targetElement.style.backgroundColor = 'rgba(74, 144, 217, 0.2)';
                    setTimeout(() => {
                        targetElement.style.backgroundColor = '';
                    }, 1000);
                }
            });
        });
        
        // 监听预览区域滚动，高亮当前位置的目录项
        this.setupTocScrollSpy();
    }
    
    // 设置目录滚动监听
    setupTocScrollSpy() {
        if (!this.previewContainer) return;
        
        // 移除旧的监听器
        if (this.tocScrollHandler) {
            this.previewContainer.removeEventListener('scroll', this.tocScrollHandler);
        }
        
        this.tocScrollHandler = () => {
            const headings = this.preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
            if (headings.length === 0) return;
            
            const scrollTop = this.previewContainer.scrollTop;
            const containerRect = this.previewContainer.getBoundingClientRect();
            
            let currentHeading = null;
            
            headings.forEach(heading => {
                const rect = heading.getBoundingClientRect();
                const relativeTop = rect.top - containerRect.top;
                
                // 如果标题在视口顶部附近或以上
                if (relativeTop <= 100) {
                    currentHeading = heading;
                }
            });
            
            if (currentHeading) {
                const tocItems = this.tocContent.querySelectorAll('.toc-item');
                tocItems.forEach(item => {
                    item.classList.remove('active');
                    if (item.dataset.target === currentHeading.id) {
                        item.classList.add('active');
                        // 只在目录面板可见时才滚动目录面板使当前项可见
                        if (this.tocVisible) {
                            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    }
                });
            }
        };
        
        this.previewContainer.addEventListener('scroll', this.tocScrollHandler);
    }
    
    // 加载目录显示状态
    loadTocState() {
        const savedState = localStorage.getItem('md-viewer-toc-visible');
        if (savedState === 'true') {
            this.showToc();
        } else {
            this.hideToc();
        }
    }
    
    // ==================== 全局文档查找功能 ====================
    
    // 切换全局查找面板
    toggleGlobalSearch() {
        if (this.globalSearchPanel.classList.contains('show')) {
            this.closeGlobalSearch();
        } else {
            this.openGlobalSearch();
        }
    }
    
    // 打开全局查找面板
    openGlobalSearch() {
        this.globalSearchPanel.classList.add('show');
        this.searchToggle.classList.add('active');
        this.mainContent.classList.add('search-panel-open');
        this.globalSearchInput.focus();
        this.globalSearchInput.select();
    }
    
    // 关闭全局查找面板
    closeGlobalSearch() {
        this.globalSearchPanel.classList.remove('show');
        this.searchToggle.classList.remove('active');
        this.mainContent.classList.remove('search-panel-open');
        this.globalSearchInput.value = '';
        this.globalSearchStatus.textContent = '';
        this.globalSearchResults.innerHTML = '';
        this.globalSearchResultsData = [];
    }
    
    // 执行全局搜索 - 搜索所有文档
    async performGlobalSearch() {
        const query = this.globalSearchInput.value.trim();
        
        if (!query) {
            this.globalSearchStatus.textContent = '';
            this.globalSearchResults.innerHTML = '';
            this.globalSearchResultsData = [];
            return;
        }
        
        if (this.fileHandles.size === 0) {
            this.globalSearchStatus.textContent = '请先打开一个文件夹';
            this.globalSearchResults.innerHTML = '';
            return;
        }
        
        this.globalSearchStatus.textContent = '搜索中...';
        this.globalSearchResults.innerHTML = '';
        this.globalSearchResultsData = [];
        
        const lowerQuery = query.toLowerCase();
        let totalMatches = 0;
        let filesWithMatches = 0;
        
        // 遍历所有文件句柄
        for (const [filePath, fileHandle] of this.fileHandles) {
            try {
                const file = await fileHandle.getFile();
                const content = await file.text();
                const lines = content.split('\n');
                
                const fileMatches = [];
                
                // 在每一行中搜索
                lines.forEach((line, lineIndex) => {
                    const lowerLine = line.toLowerCase();
                    let startPos = 0;
                    let matchIndex;
                    
                    while ((matchIndex = lowerLine.indexOf(lowerQuery, startPos)) !== -1) {
                        fileMatches.push({
                            lineNumber: lineIndex + 1,
                            lineContent: line.trim(),
                            matchStart: matchIndex,
                            matchEnd: matchIndex + query.length
                        });
                        startPos = matchIndex + 1;
                    }
                });
                
                if (fileMatches.length > 0) {
                    this.globalSearchResultsData.push({
                        filePath: filePath,
                        fileHandle: fileHandle,
                        matches: fileMatches
                    });
                    totalMatches += fileMatches.length;
                    filesWithMatches++;
                }
            } catch (error) {
                console.warn(`无法读取文件 ${filePath}:`, error);
            }
        }
        
        // 更新状态和渲染结果
        if (totalMatches > 0) {
            this.globalSearchStatus.textContent = `找到 ${totalMatches} 个结果，分布在 ${filesWithMatches} 个文件中`;
            this.renderGlobalSearchResults(query);
        } else {
            this.globalSearchStatus.textContent = '无结果';
            this.globalSearchResults.innerHTML = '<div class="no-results">没有找到匹配项</div>';
        }
    }
    
    // 渲染全局搜索结果
    renderGlobalSearchResults(query) {
        this.globalSearchResults.innerHTML = '';
        
        this.globalSearchResultsData.forEach(fileResult => {
            // 创建文件分组
            const fileGroup = document.createElement('div');
            fileGroup.className = 'search-result-file';
            
            // 文件标题
            const fileHeader = document.createElement('div');
            fileHeader.className = 'search-result-file-header';
            fileHeader.innerHTML = `
                <i class="fas fa-file-alt"></i>
                <span class="file-path">${this.escapeHtml(fileResult.filePath)}</span>
                <span class="match-count">(${fileResult.matches.length} 个匹配)</span>
            `;
            fileGroup.appendChild(fileHeader);
            
            // 匹配项列表
            const matchList = document.createElement('div');
            matchList.className = 'search-result-matches';
            
            fileResult.matches.forEach(match => {
                const matchItem = document.createElement('div');
                matchItem.className = 'search-result-item';
                
                // 高亮匹配文本
                const lineContent = match.lineContent;
                const lowerContent = lineContent.toLowerCase();
                const lowerQuery = query.toLowerCase();
                let highlightedContent = '';
                let lastEnd = 0;
                let pos = 0;
                
                while ((pos = lowerContent.indexOf(lowerQuery, lastEnd)) !== -1) {
                    highlightedContent += this.escapeHtml(lineContent.substring(lastEnd, pos));
                    highlightedContent += `<span class="search-match-highlight">${this.escapeHtml(lineContent.substring(pos, pos + query.length))}</span>`;
                    lastEnd = pos + query.length;
                }
                highlightedContent += this.escapeHtml(lineContent.substring(lastEnd));
                
                matchItem.innerHTML = `
                    <span class="line-number">行 ${match.lineNumber}:</span>
                    <span class="line-content">${highlightedContent}</span>
                `;
                
                // 双击跳转到文件
                matchItem.addEventListener('dblclick', () => {
                    this.jumpToSearchResult(fileResult.filePath, fileResult.fileHandle, match.lineNumber, query);
                });
                
                // 单击也可以跳转
                matchItem.addEventListener('click', () => {
                    this.jumpToSearchResult(fileResult.filePath, fileResult.fileHandle, match.lineNumber, query);
                });
                
                matchList.appendChild(matchItem);
            });
            
            fileGroup.appendChild(matchList);
            this.globalSearchResults.appendChild(fileGroup);
        });
    }
    
    // 跳转到搜索结果
    async jumpToSearchResult(filePath, fileHandle, lineNumber, query) {
        try {
            // 加载文件
            const file = await fileHandle.getFile();
            const content = await file.text();
            
            // 更新编辑器和预览
            this.editor.value = content;
            this.currentFileHandle = fileHandle;
            this.currentFile = filePath;
            this.isModified = false;
            
            // 更新文件列表选中状态
            document.querySelectorAll('.file-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.path === filePath) {
                    item.classList.add('active');
                }
            });
            
            // 更新当前文件名显示
            const fileName = filePath.split('/').pop();
            this.currentFileName.textContent = fileName;
            
            // 更新预览
            this.updatePreview();
            
            // 等待预览渲染完成后高亮并滚动
            setTimeout(() => {
                this.highlightAndScrollToLine(lineNumber, query);
            }, 100);
            
        } catch (error) {
            console.error('跳转到搜索结果失败:', error);
            this.showToast('跳转失败: ' + error.message, 'error');
        }
    }
    
    // 高亮并滚动到指定行
    highlightAndScrollToLine(lineNumber, query) {
        // 在编辑器中定位
        if (this.viewMode === 'split') {
            const lines = this.editor.value.split('\n');
            let charCount = 0;
            for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
                charCount += lines[i].length + 1; // +1 for newline
            }
            
            this.editor.focus();
            this.editor.setSelectionRange(charCount, charCount + lines[lineNumber - 1].length);
            
            // 滚动编辑器
            const lineHeight = parseInt(getComputedStyle(this.editor).lineHeight) || 20;
            this.editor.scrollTop = (lineNumber - 5) * lineHeight;
        }
        
        // 在预览中高亮匹配项
        this.highlightInPreview(query);
    }
    
    // 在预览区域高亮匹配项
    highlightInPreview(query) {
        // 清除之前的高亮
        this.clearPreviewHighlights();
        
        const walker = document.createTreeWalker(
            this.preview,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.parentElement.tagName === 'SCRIPT' || 
                node.parentElement.tagName === 'STYLE' ||
                node.parentElement.classList.contains('mermaid')) {
                continue;
            }
            textNodes.push(node);
        }
        
        const lowerQuery = query.toLowerCase();
        let firstMatch = null;
        
        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            const lowerText = text.toLowerCase();
            let startIndex = 0;
            let index;
            
            const fragments = [];
            let lastEnd = 0;
            
            while ((index = lowerText.indexOf(lowerQuery, startIndex)) !== -1) {
                if (index > lastEnd) {
                    fragments.push(document.createTextNode(text.substring(lastEnd, index)));
                }
                
                const highlight = document.createElement('span');
                highlight.className = 'search-highlight';
                highlight.textContent = text.substring(index, index + query.length);
                fragments.push(highlight);
                
                if (!firstMatch) {
                    firstMatch = highlight;
                }
                
                lastEnd = index + query.length;
                startIndex = lastEnd;
            }
            
            if (fragments.length > 0) {
                if (lastEnd < text.length) {
                    fragments.push(document.createTextNode(text.substring(lastEnd)));
                }
                
                const parent = textNode.parentNode;
                fragments.forEach(frag => {
                    parent.insertBefore(frag, textNode);
                });
                parent.removeChild(textNode);
            }
        });
        
        // 滚动到第一个匹配项
        if (firstMatch) {
            firstMatch.classList.add('current');
            firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    // 清除预览区域的搜索高亮
    clearPreviewHighlights() {
        const highlights = this.preview.querySelectorAll('.search-highlight');
        highlights.forEach(highlight => {
            const text = highlight.textContent;
            const textNode = document.createTextNode(text);
            highlight.parentNode.replaceChild(textNode, highlight);
        });
        this.preview.normalize();
    }
    
    // HTML 转义
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
        
        const icon = document.querySelector('#themeToggle i');
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        
        // 重新初始化 Mermaid 以应用新主题
        if (typeof mermaid !== 'undefined') {
            mermaid.initialize({
                startOnLoad: false,
                theme: newTheme === 'dark' ? 'dark' : 'default',
                securityLevel: 'loose',
                flowchart: {
                    useMaxWidth: true,
                    htmlLabels: true,
                    curve: 'basis'
                },
                sequence: {
                    useMaxWidth: true,
                    wrap: true
                },
                gantt: {
                    useMaxWidth: true
                }
            });
            // 如果当前有打开的文件，重新渲染
            if (this.currentFileHandle) {
                this.updatePreview();
            }
        }
    }
    
    // 加载主题
    loadTheme() {
        const savedTheme = localStorage.getItem('md-viewer-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        const icon = document.querySelector('#themeToggle i');
        icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    
    // 显示 Toast
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
        
        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
    
    // 初始化图表缩放功能
    initDiagramZoom() {
        console.log('[Zoom] 初始化缩放功能...');
        
        this.zoomModal = document.getElementById('diagramZoomModal');
        this.zoomContent = document.getElementById('zoomContent');
        this.zoomClose = document.getElementById('zoomClose');
        this.zoomIn = document.getElementById('zoomIn');
        this.zoomOut = document.getElementById('zoomOut');
        this.zoomReset = document.getElementById('zoomReset');
        this.zoomLevel = document.getElementById('zoomLevel');
        
        // 检查元素是否存在
        if (!this.zoomModal) console.error('[Zoom] 错误: diagramZoomModal 元素未找到!');
        if (!this.zoomContent) console.error('[Zoom] 错误: zoomContent 元素未找到!');
        if (!this.zoomClose) console.error('[Zoom] 错误: zoomClose 元素未找到!');
        if (!this.zoomIn) console.error('[Zoom] 错误: zoomIn 元素未找到!');
        if (!this.zoomOut) console.error('[Zoom] 错误: zoomOut 元素未找到!');
        if (!this.zoomReset) console.error('[Zoom] 错误: zoomReset 元素未找到!');
        if (!this.zoomLevel) console.error('[Zoom] 错误: zoomLevel 元素未找到!');
        
        this.currentZoomScale = 1;
        this.currentDiagram = null;
        
        // 拖拽相关状态
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.translateX = 0;
        this.translateY = 0;
        
        // 关闭按钮
        if (this.zoomClose) {
            this.zoomClose.addEventListener('click', () => this.closeDiagramZoom());
        }
        
        // 点击背景关闭（但拖拽时不关闭）
        if (this.zoomModal) {
            this.zoomModal.addEventListener('click', (e) => {
                if (e.target === this.zoomModal && !this.wasDragging) {
                    this.closeDiagramZoom();
                }
                this.wasDragging = false;
            });
        }
        
        // 缩放控制
        if (this.zoomIn) {
            this.zoomIn.addEventListener('click', () => this.adjustZoom(0.2));
        }
        if (this.zoomOut) {
            this.zoomOut.addEventListener('click', () => this.adjustZoom(-0.2));
        }
        if (this.zoomReset) {
            this.zoomReset.addEventListener('click', () => this.resetZoom());
        }
        
        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (!this.zoomModal || !this.zoomModal.classList.contains('show')) return;
            
            if (e.key === 'Escape') {
                this.closeDiagramZoom();
            } else if (e.key === '+' || e.key === '=') {
                this.adjustZoom(0.2);
            } else if (e.key === '-') {
                this.adjustZoom(-0.2);
            } else if (e.key === '0') {
                this.resetZoom();
            }
        });
        
        // 鼠标滚轮缩放
        if (this.zoomContent) {
            this.zoomContent.addEventListener('wheel', (e) => {
                if (!this.zoomModal || !this.zoomModal.classList.contains('show')) return;
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                this.adjustZoom(delta);
            });
            
            // 鼠标拖拽平移
            this.zoomContent.addEventListener('mousedown', (e) => {
                if (!this.zoomModal || !this.zoomModal.classList.contains('show')) return;
                if (e.button !== 0) return; // 只响应左键
                
                this.isDragging = true;
                this.wasDragging = false;
                this.dragStartX = e.clientX - this.translateX;
                this.dragStartY = e.clientY - this.translateY;
                this.zoomContent.style.cursor = 'grabbing';
                e.preventDefault();
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!this.isDragging) return;
                
                this.wasDragging = true;
                this.translateX = e.clientX - this.dragStartX;
                this.translateY = e.clientY - this.dragStartY;
                this.updateZoomTransform();
            });
            
            document.addEventListener('mouseup', () => {
                if (this.isDragging) {
                    this.isDragging = false;
                    if (this.zoomContent) {
                        this.zoomContent.style.cursor = 'grab';
                    }
                }
            });
        }
        
        console.log('[Zoom] 缩放功能初始化完成');
    }
    
    // 打开图表缩放
    openDiagramZoom(diagramElement) {
        console.log('[Zoom] 打开缩放模态框');
        console.log('[Zoom] 图表元素:', diagramElement);
        
        // 重置拖拽位置（初始居中，所以为 0）
        this.translateX = 0;
        this.translateY = 0;
        this.isDragging = false;
        this.wasDragging = false;
        
        // 克隆图表内容
        const clone = diagramElement.cloneNode(true);
        clone.style.cursor = 'grab';
        clone.style.maxWidth = 'none';
        clone.style.maxHeight = 'none';
        clone.style.margin = '0';
        clone.style.width = 'auto';
        clone.style.height = 'auto';
        clone.classList.add('zoom-diagram');
        
        // 确保 SVG 不会撑满容器，保持原始尺寸以便居中
        const svg = clone.querySelector('svg');
        if (svg) {
            svg.style.display = 'block';
            svg.style.margin = '0 auto';
        }
        
        this.zoomContent.innerHTML = '';
        this.zoomContent.appendChild(clone);
        this.currentDiagram = clone;
        this.zoomContent.style.cursor = 'grab';
        
        // 显示模态框
        this.zoomModal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        // 延迟后智能设置初始缩放（同时保持居中）
        setTimeout(() => {
            this.smartResetZoom();
        }, 100);
        
        console.log('[Zoom] 模态框已显示');
    }
    
    // 智能重置缩放 - 自动适配最佳大小
    smartResetZoom() {
        if (!this.currentDiagram) return;
        
        // 重置平移位置
        this.translateX = 0;
        this.translateY = 0;
        
        const svg = this.currentDiagram.querySelector('svg');
        if (!svg) {
            // 如果没有 SVG，使用默认缩放
            this.currentZoomScale = 1;
            this.updateZoomTransform();
            return;
        }
        
        // 获取容器尺寸
        const containerWidth = this.zoomContent.clientWidth;
        const containerHeight = this.zoomContent.clientHeight;
        
        // 获取 SVG 尺寸
        let svgWidth, svgHeight;
        try {
            const bbox = svg.getBBox();
            svgWidth = bbox.width;
            svgHeight = bbox.height;
        } catch (e) {
            // 如果 getBBox 失败，使用 clientWidth/Height
            svgWidth = svg.clientWidth || svg.width.baseVal.value;
            svgHeight = svg.clientHeight || svg.height.baseVal.value;
        }
        
        if (!svgWidth || !svgHeight) {
            this.currentZoomScale = 1;
            this.updateZoomTransform();
            return;
        }
        
        // 计算最佳缩放比例（留 10% 边距）
        const scaleX = (containerWidth * 0.9) / svgWidth;
        const scaleY = (containerHeight * 0.9) / svgHeight;
        const optimalScale = Math.min(scaleX, scaleY, 1.5); // 最大 150%
        
        // 设置缩放（最小 80%，最大 150%）
        this.currentZoomScale = Math.max(0.8, Math.min(1.5, optimalScale));
        this.updateZoomTransform();
        
        console.log(`[Zoom] 智能缩放到 ${Math.round(this.currentZoomScale * 100)}%`);
    }
    
    // 关闭图表缩放
    closeDiagramZoom() {
        this.zoomModal.classList.remove('show');
        document.body.style.overflow = '';
        setTimeout(() => {
            this.zoomContent.innerHTML = '';
            this.currentDiagram = null;
        }, 300);
    }
    
    // 调整缩放
    adjustZoom(delta) {
        this.currentZoomScale = Math.max(0.5, Math.min(5, this.currentZoomScale + delta));
        this.updateZoomTransform();
    }
    
    // 重置缩放
    resetZoom() {
        // 使用智能重置
        this.smartResetZoom();
    }
    
    // 更新缩放变换
    updateZoomTransform() {
        if (this.currentDiagram) {
            this.currentDiagram.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.currentZoomScale})`;
            this.currentDiagram.style.transformOrigin = 'center center';
            this.zoomLevel.textContent = `${Math.round(this.currentZoomScale * 100)}%`;
        }
    }
    
    // 为图表添加双击事件
    attachDiagramZoomHandlers() {
        const diagrams = this.preview.querySelectorAll('.mermaid');
        console.log(`[Zoom] 找到 ${diagrams.length} 个 Mermaid 图表`);
        
        if (diagrams.length === 0) {
            console.warn('[Zoom] 警告：没有找到 .mermaid 元素！');
            return;
        }
        
        diagrams.forEach((diagram, index) => {
            // 只处理有 SVG 的图表（渲染成功的）
            if (!diagram.querySelector('svg')) {
                console.warn(`[Zoom] 图表 ${index} 没有 SVG，跳过`);
                return;
            }
            
            // 检查是否已经绑定过
            if (diagram._zoomHandlerBound) {
                console.log(`[Zoom] 图表 ${index} 已经绑定过，跳过`);
                return;
            }
            
            // 设置样式
            diagram.style.cursor = 'zoom-in';
            diagram.style.userSelect = 'none';
            diagram.title = '双击放大查看 (可拖动/滚轮缩放)';
            
            // 使用 ondblclick 而不是 addEventListener（更可靠）
            const self = this;
            diagram.ondblclick = function(e) {
                console.log(`[Zoom] ✓✓✓ 图表 ${index} 被双击`);
                e.preventDefault();
                e.stopPropagation();
                self.openDiagramZoom(this);
            };
            
            // 标记已绑定
            diagram._zoomHandlerBound = true;
            
            console.log(`[Zoom] ✓ 已为图表 ${index} 绑定双击事件 (ondblclick)`);
        });
        
        console.log(`[Zoom] ✅ 成功绑定 ${diagrams.length} 个图表的事件`);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.mdViewer = new MDViewerStandalone();
});
