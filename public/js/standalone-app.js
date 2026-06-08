// MD Viewer - 纯前端版本 (使用 File System Access API)
class MDViewerStandalone {
    constructor() {
        this.directoryHandle = null;
        this.currentFileHandle = null;
        this.currentContent = '';
        this.isModified = false;
        this.viewMode = 'split'; // 默认分栏模式
        this.fileHandles = new Map();
        this.manualEncoding = 'utf-8'; // 默认使用 UTF-8 编码
        this.splitRatio = 50; // 分栏比例（百分比）
        this.isResizing = false;
        this.basePath = ''; // 用户设置的文件夹完整路径前缀
        this.dbName = 'md-viewer-db';
        this.storeName = 'folders';
        this.recentFoldersStore = 'recentFolders';
        this.maxRecentFolders = 10; // 最多保存10个最近目录
        this.globalSearchResultsData = []; // 全局搜索结果数据
        
        // 导航历史记录
        this.navigationHistory = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        this.isNavigatingHistory = false; // 防止历史导航时重复记录
        
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
                            this.loadBasePath(); // 加载基础路径
                            this.showToast(`已自动打开上次的文件夹: ${handle.name}`, 'success');
                            await this.loadFiles();
                            // 显示设置路径按钮
                            const setBasePathBtn = document.getElementById('setBasePathBtn');
                            if (setBasePathBtn) setBasePathBtn.style.display = '';
                            // 自动打开上次的文件
                            await this.restoreLastFile();
                        } else if (permission === 'prompt') {
                            // 请求权限
                            const newPermission = await handle.requestPermission(options);
                            if (newPermission === 'granted') {
                                this.directoryHandle = handle;
                                this.loadBasePath(); // 加载基础路径
                                this.showToast(`已恢复上次的文件夹: ${handle.name}`, 'success');
                                await this.loadFiles();
                                // 显示设置路径按钮
                                const setBasePathBtn = document.getElementById('setBasePathBtn');
                                if (setBasePathBtn) setBasePathBtn.style.display = '';
                                // 自动打开上次的文件
                                await this.restoreLastFile();
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
    
    /**
     * 恢复上次打开的文件
     */
    async restoreLastFile() {
        const lastFilePath = localStorage.getItem('md-viewer-last-file');
        if (!lastFilePath) return;
        
        // 等待文件树加载完成
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 检查文件是否存在于当前打开的文件夹中
        if (this.fileHandles.has(lastFilePath)) {
            console.log('[Restore] 正在恢复上次打开的文件:', lastFilePath);
            await this.loadFile(lastFilePath);
        } else {
            console.log('[Restore] 上次的文件不在当前文件夹中:', lastFilePath);
        }
    }
    
    /**
     * 刷新当前文档（重新从文件系统读取）
     */
    async refreshCurrentFile() {
        const currentPath = this.currentFileEl.textContent;
        
        if (!currentPath || currentPath === '请打开文件夹并选择 Markdown 文件') {
            this.showToast('没有打开的文件', 'warning');
            return;
        }
        
        // 检查是否有未保存的修改
        if (this.isModified) {
            const confirm = window.confirm('当前文件有未保存的修改，刷新将丢失这些修改。是否继续？');
            if (!confirm) return;
        }
        
        try {
            const fileHandle = this.fileHandles.get(currentPath);
            if (!fileHandle) {
                this.showToast('文件句柄未找到', 'error');
                return;
            }
            
            // 重新读取文件内容
            const file = await fileHandle.getFile();
            const content = await this.decodeFileContent(file);
            
            this.currentContent = content;
            this.isModified = false;
            this.editor.value = content;
            this.updatePreview();
            
            this.showToast('文档已刷新', 'success');
        } catch (error) {
            this.showToast('刷新文件失败: ' + error.message, 'error');
        }
    }
    
    /**
     * 获取当前文件的完整路径
     * @param {boolean} useSystemPath - 是否返回完整系统路径
     * @returns {string} 完整路径
     */
    getFullFilePath(useSystemPath = true) {
        const relativePath = this.currentFileEl.textContent;
        if (!relativePath || relativePath === '请打开文件夹并选择 Markdown 文件') {
            return '';
        }
        
        // 如果设置了基础路径，返回完整系统路径
        if (useSystemPath && this.basePath) {
            // 规范化路径分隔符
            const normalizedBase = this.basePath.replace(/\/+$/, ''); // 移除尾部斜杠
            return `${normalizedBase}/${relativePath}`.replace(/\//g, '\\'); // Windows 风格
        }
        
        // 组合文件夹名和相对路径
        const folderName = this.directoryHandle ? this.directoryHandle.name : '';
        return folderName ? `${folderName}/${relativePath}` : relativePath;
    }
    
    /**
     * 获取当前文件所在目录的完整路径
     * @returns {string} 目录路径
     */
    getFullDirectoryPath() {
        const fullPath = this.getFullFilePath(true);
        if (!fullPath) return '';
        
        // 获取目录部分
        const lastSep = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
        return lastSep > 0 ? fullPath.substring(0, lastSep) : fullPath;
    }
    
    /**
     * 设置文件夹的基础路径（完整系统路径）
     */
    setBasePath() {
        const folderName = this.directoryHandle ? this.directoryHandle.name : '';
        const savedPath = localStorage.getItem(`md-viewer-base-path-${folderName}`);
        
        const currentPath = savedPath || this.basePath || '';
        const newPath = prompt(
            `请输入文件夹 "${folderName}" 的完整系统路径：\n\n` +
            `例如: C:\\Users\\Documents\\${folderName}\n` +
            `或: /home/user/documents/${folderName}\n\n` +
            `设置后，复制的路径将是完整的系统路径，可直接在文件管理器中打开。`,
            currentPath
        );
        
        if (newPath !== null) {
            this.basePath = newPath.trim();
            if (this.basePath) {
                localStorage.setItem(`md-viewer-base-path-${folderName}`, this.basePath);
                this.showToast('基础路径已设置', 'success');
                
                // 更新当前文件的提示
                if (this.currentFileHandle) {
                    this.currentFileEl.title = `点击复制路径: ${this.getFullFilePath()}`;
                }
            } else {
                localStorage.removeItem(`md-viewer-base-path-${folderName}`);
                this.showToast('基础路径已清除', 'info');
            }
        }
    }
    
    /**
     * 从 localStorage 加载基础路径
     */
    loadBasePath() {
        const folderName = this.directoryHandle ? this.directoryHandle.name : '';
        if (folderName) {
            this.basePath = localStorage.getItem(`md-viewer-base-path-${folderName}`) || '';
        }
    }
    
    /**
     * 复制当前文件路径到剪贴板
     */
    async copyFilePath() {
        const fullPath = this.getFullFilePath();
        
        if (!fullPath) {
            this.showToast('没有打开的文件', 'warning');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(fullPath);
            this.showToast('路径已复制: ' + fullPath, 'success');
        } catch (error) {
            // 降级方案：使用 execCommand
            const textarea = document.createElement('textarea');
            textarea.value = fullPath;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast('路径已复制: ' + fullPath, 'success');
        }
    }
    
    /**
     * 显示文件路径详情弹窗
     */
    showFilePathInfo() {
        const relativePath = this.currentFileEl.textContent;
        if (!relativePath || relativePath === '请打开文件夹并选择 Markdown 文件') {
            this.showToast('没有打开的文件', 'warning');
            return;
        }
        
        const folderName = this.directoryHandle ? this.directoryHandle.name : '未知';
        const fullPath = this.getFullFilePath();
        const fileName = relativePath.split('/').pop();
        const directory = relativePath.includes('/') 
            ? relativePath.substring(0, relativePath.lastIndexOf('/'))
            : '根目录';
        
        const info = `📁 文件夹: ${folderName}\n📂 目录: ${directory}\n📄 文件名: ${fileName}\n📋 完整路径: ${fullPath}`;
        
        // 使用 alert 显示（简单方案）或可以用自定义弹窗
        alert(info);
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
        
        // PlantUML 服务器配置
        this.plantumlServer = 'https://www.plantuml.com/plantuml';
        
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
        
        // Mermaid 代码预处理 - 自动修复常见语法问题
        this.preprocessMermaid = (code) => {
            // 处理节点标签中的多行文本和特殊字符
            // 匹配 ID[...] 或 ID["..."] 格式的节点定义
            let result = code;
            
            // 0. 检测是否为时序图
            const isSequenceDiagram = /^\s*sequenceDiagram\s*$/m.test(result);
            
            // 0.0 检测是否为甘特图 - 处理 section 名中的冒号
            // Mermaid 10.6.1 的 Gantt 解析器将换行符视为普通空白，导致 section 名中的冒号
            // 与任务定义的冒号(:id, date, duration)产生歧义，需要将 section 名中的冒号替换
            const isGanttDiagram = /^\s*gantt\s*$/m.test(result);
            if (isGanttDiagram) {
                result = result.replace(
                    /^(\s*section\s+)(.+)$/gm,
                    (match, keyword, sectionName) => {
                        // 如果 section 名包含冒号，替换为中文全角冒号（避免与任务定义冲突）
                        if (sectionName.includes(':')) {
                            const fixedName = sectionName.replace(/:/g, '：');
                            return keyword + fixedName;
                        }
                        return match;
                    }
                );
            }
            
            // 0.1 处理时序图中的 Mermaid 保留字作为 participant 名称
            // 保留字列表: break, end, loop, alt, else, opt, par, critical, section 等
            if (isSequenceDiagram) {
                const reservedWords = ['break', 'end', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'critical', 'option', 'section', 'rect', 'note', 'activate', 'deactivate'];
                
                // 处理 participant 声明中的保留字
                result = result.replace(
                    /^(\s*)(participant|actor)\s+(\w+)\s+as\s+(\w+)$/gmi,
                    (match, indent, keyword, id, alias) => {
                        // 如果 ID 是保留字，需要给 alias 加引号
                        if (reservedWords.includes(id.toLowerCase())) {
                            return `${indent}${keyword} ${id}_ as ${alias}`;
                        }
                        return match;
                    }
                );
                
                // 同时修复消息中引用这些 ID 的地方
                reservedWords.forEach(word => {
                    const regex = new RegExp(`(--?>>?|--?[x)]|--?>)(${word})(:)`, 'gi');
                    result = result.replace(regex, `$1${word}_$3`);
                    const regex2 = new RegExp(`^(\\s*)(${word})(--?>>?|--?[x)]|--?>)`, 'gmi');
                    result = result.replace(regex2, `$1${word}_$3`);
                });
            }
            
            // 0.2 处理时序图消息中的特殊字符（括号等）
            if (isSequenceDiagram) {
                // 匹配时序图消息: Actor->>Actor: Message 或 Actor-->>Actor: Message
                // 支持的箭头: -> --> ->> -->> -x --x -) --)
                result = result.replace(
                    /^(\s*)(\w+)(--?>>?|--?[x)]|--?>)(\w+):\s*(.+)$/gm,
                    (match, indent, from, arrow, to, message) => {
                        // 如果消息已经用引号包裹，保持不变
                        if (message.startsWith('"') && message.endsWith('"')) {
                            return match;
                        }
                        // 如果消息包含特殊字符（不含括号，括号在现代 Mermaid 中原生支持），用引号包裹
                        const hasSpecialChars = /[{}[\]<>]/.test(message);
                        if (hasSpecialChars) {
                            // 转义内部的双引号
                            const escapedMessage = message.replace(/"/g, "'");
                            return `${indent}${from}${arrow}${to}: "${escapedMessage}"`;
                        }
                        return match;
                    }
                );
                
                // 处理 Note 语句中的特殊字符
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
            
            // 1. 处理 subgraph 标签 - 仅用于流程图
            if (!isSequenceDiagram) {
                result = result.replace(/subgraph\s+(\w+)\[([^\]]+)\]/g, (match, id, label) => {
                    // 如果标签已经用引号包裹，保持不变
                    if (label.startsWith('"') && label.endsWith('"')) {
                        return match;
                    }
                    // 将换行转换为 <br>，并用引号包裹
                    const fixedLabel = label.trim().replace(/\n/g, '<br>');
                    return `subgraph ${id}["${fixedLabel}"]`;
                });
            }
            
            // 2. 处理普通节点 ID[Label] - 仅用于流程图
            if (!isSequenceDiagram) {
                result = result.replace(/(\w+)\[((?:[^\[\]]|\n)+)\]/g, (match, id, label) => {
                    // 跳过已经是 subgraph 的
                    if (result.includes(`subgraph ${id}[`)) {
                        // 检查这个匹配是否就是 subgraph 的一部分
                        const beforeMatch = result.substring(0, result.indexOf(match));
                        if (beforeMatch.endsWith('subgraph ') || beforeMatch.match(/subgraph\s+$/)) {
                            return match;
                        }
                    }
                    
                    // 如果标签已经用引号包裹，保持不变
                    if (label.startsWith('"') && label.endsWith('"')) {
                        return match;
                    }
                    
                    // 如果包含换行或特殊字符，需要处理
                    const hasNewline = label.includes('\n');
                    const hasSpecialChars = /[()/:&]/.test(label);
                    
                    if (hasNewline || hasSpecialChars) {
                        // 将换行转换为 <br>，并用引号包裹
                        let fixedLabel = label.trim().replace(/\n\s*/g, '<br>');
                        // 转义内部的双引号
                        fixedLabel = fixedLabel.replace(/"/g, '#quot;');
                        return `${id}["${fixedLabel}"]`;
                    }
                    
                    return match;
                });
            }
            
            // 3. 处理圆角节点 ID(Label) - 仅用于流程图，跳过时序图
            if (!isSequenceDiagram) {
                result = result.replace(/(\w+)\(((?:[^()]|\n)+)\)/g, (match, id, label) => {
                    // 跳过 classDef 和其他关键字
                    if (['fill', 'stroke', 'color', 'class', 'click'].includes(id)) {
                        return match;
                    }
                    
                    const hasNewline = label.includes('\n');
                    const hasSpecialChars = /[/:&\[\]]/.test(label);
                    
                    if (hasNewline || hasSpecialChars) {
                        let fixedLabel = label.trim().replace(/\n\s*/g, '<br>');
                        fixedLabel = fixedLabel.replace(/"/g, '#quot;');
                        return `${id}("${fixedLabel}")`;
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
            
            // 后备方案：如果编码库未加载，返回原始代码
            console.warn('[PlantUML] plantuml-encoder 库未加载');
            return null;
        };
        
        // 自定义代码块渲染器，处理 Mermaid 和 PlantUML
        renderer.code = (code, language) => {
            // 如果是 mermaid 代码块，预处理后返回 mermaid div
            if (language === 'mermaid') {
                const processedCode = this.preprocessMermaid(code);
                console.log('[Mermaid] Original code:', code.substring(0, 200));
                console.log('[Mermaid] Processed code:', processedCode.substring(0, 200));
                return `<div class="mermaid">${processedCode}</div>`;
            }
            
            // 如果是 PlantUML 代码块，返回带有占位符的容器
            if (language === 'plantuml' || language === 'puml') {
                const uniqueId = `plantuml-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                // 存储原始代码用于后续渲染
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
            // 使用 data-original-src 保存原始路径，后续在 updatePreview 中解析为 blob URL
            const isRemote = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('data:') || href.startsWith('blob:');
            const originalSrc = isRemote ? '' : ` data-original-src="${href}"`;
            return `<img src="${isRemote ? href : ''}" alt="${text}"${titleAttr}${originalSrc} loading="lazy" onclick="window.open('${href}', '_blank')">`;
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
        
        // 查看功能演示按钮（欢迎页面）
        const showDemoBtn = document.getElementById('showDemoBtn');
        if (showDemoBtn) {
            showDemoBtn.addEventListener('click', () => {
                this.showFeaturesDemo();
            });
        }
        
        // 查看功能演示按钮（侧边栏）
        const showDemoBtn2 = document.getElementById('showDemoBtn2');
        if (showDemoBtn2) {
            showDemoBtn2.addEventListener('click', () => {
                this.showFeaturesDemo();
            });
        }
        
        // 刷新文件列表
        document.getElementById('refreshBtn').addEventListener('click', () => {
            if (this.directoryHandle) {
                this.loadFiles();
            } else {
                this.showToast('请先打开一个文件夹', 'warning');
            }
        });
        
        // 刷新当前文档
        const refreshFileBtn = document.getElementById('refreshFileBtn');
        if (refreshFileBtn) {
            refreshFileBtn.addEventListener('click', () => {
                this.refreshCurrentFile();
            });
        }
        
        // 复制文件路径按钮
        const copyPathBtn = document.getElementById('copyPathBtn');
        if (copyPathBtn) {
            copyPathBtn.addEventListener('click', () => {
                this.copyFilePath();
            });
        }
        
        // 设置基础路径按钮
        const setBasePathBtn = document.getElementById('setBasePathBtn');
        if (setBasePathBtn) {
            setBasePathBtn.addEventListener('click', () => {
                this.setBasePath();
            });
        }
        
        // 导航历史按钮
        const goBackBtn = document.getElementById('goBackBtn');
        const goForwardBtn = document.getElementById('goForwardBtn');
        
        if (goBackBtn) {
            goBackBtn.addEventListener('click', () => {
                this.goBack();
            });
        }
        
        if (goForwardBtn) {
            goForwardBtn.addEventListener('click', () => {
                this.goForward();
            });
        }
        
        // 点击文件名显示路径详情
        if (this.currentFileEl) {
            this.currentFileEl.addEventListener('click', () => {
                if (this.currentFileHandle) {
                    this.copyFilePath();
                }
            });
            this.currentFileEl.style.cursor = 'pointer';
        }
        
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
            // Alt+← 返回上一位置
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                this.goBack();
            }
            // Alt+→ 前进到下一位置
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                this.goForward();
            }
            // F5 刷新当前文档（阻止浏览器默认刷新）
            if (e.key === 'F5') {
                if (this.currentFileHandle) {
                    e.preventDefault();
                    this.refreshCurrentFile();
                }
                // 如果没有打开文件，则允许浏览器默认刷新
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
        
        // 导出功能
        this.initExportFeature();
        
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
        
        // 分栏同步按钮
        const syncLeftToRight = document.getElementById('syncLeftToRight');
        const syncRightToLeft = document.getElementById('syncRightToLeft');
        
        if (syncLeftToRight) {
            syncLeftToRight.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止触发拖动
                this.syncEditorToPreview();
            });
        }
        
        if (syncRightToLeft) {
            syncRightToLeft.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止触发拖动
                this.syncPreviewToEditor();
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
        
        // 预览区域双击进入编辑模式
        if (this.preview) {
            this.preview.addEventListener('dblclick', (e) => {
                this.handlePreviewDoubleClick(e);
            });
        }
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
    
    // 处理预览区域双击事件 - 进入编辑模式
    handlePreviewDoubleClick(e) {
        console.log('[DblClick] 预览区域双击事件触发', {
            hasFileHandle: !!this.currentFileHandle,
            viewMode: this.viewMode,
            target: e.target.tagName
        });
        
        // 如果没有打开文件，不处理
        if (!this.currentFileHandle) {
            console.log('[DblClick] 没有打开文件，跳过');
            return;
        }
        
        // 如果已经是分屏模式，不处理（避免重复）
        if (this.viewMode === 'split') {
            console.log('[DblClick] 已经是分屏模式，跳过');
            return;
        }
        
        // 排除特殊元素的双击（如 Mermaid 图表缩放）
        const target = e.target;
        if (target.closest('.mermaid') || target.closest('.plantuml') || 
            target.closest('a') || target.closest('code') || target.closest('pre')) {
            console.log('[DblClick] 点击的是特殊元素，跳过');
            return;
        }
        
        console.log('[DblClick] 切换到分屏模式');
        
        // 获取双击位置对应的文本内容
        const clickedElement = this.findClickedParagraph(target);
        const searchText = clickedElement ? this.getElementSearchText(clickedElement) : null;
        
        // 切换到分屏模式
        this.setViewMode('split');
        
        // 如果找到了对应的文本，尝试定位到编辑器中
        if (searchText) {
            setTimeout(() => {
                this.locateTextInEditor(searchText);
            }, 100);
        }
        
        this.showToast('已进入编辑模式', 'info');
    }
    
    // 找到双击的段落元素
    findClickedParagraph(element) {
        // 向上查找最近的块级元素
        const blockElements = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TD', 'TH', 'DIV'];
        let current = element;
        
        while (current && current !== this.preview) {
            if (blockElements.includes(current.tagName)) {
                return current;
            }
            current = current.parentElement;
        }
        
        return element;
    }
    
    // 获取元素的搜索文本
    getElementSearchText(element) {
        // 获取纯文本内容（去除子元素的影响）
        let text = element.textContent || '';
        
        // 清理文本：移除多余空白
        text = text.trim().replace(/\s+/g, ' ');
        
        // 如果文本太短或太长，返回null
        if (text.length < 3 || text.length > 200) {
            return null;
        }
        
        // 取前50个字符作为搜索关键字
        return text.substring(0, 50);
    }
    
    // 在编辑器中定位文本
    locateTextInEditor(searchText) {
        if (!this.editor || !searchText) return;
        
        const content = this.editor.value;
        
        // 尝试查找完整匹配
        let index = content.indexOf(searchText);
        
        // 如果没找到，尝试查找前20个字符
        if (index === -1 && searchText.length > 20) {
            index = content.indexOf(searchText.substring(0, 20));
        }
        
        // 如果还没找到，尝试用第一个单词
        if (index === -1) {
            const firstWord = searchText.split(/\s+/)[0];
            if (firstWord && firstWord.length >= 3) {
                index = content.indexOf(firstWord);
            }
        }
        
        if (index !== -1) {
            // 计算行号
            const lineNumber = content.substring(0, index).split('\n').length;
            
            // 定位到该行
            this.editor.focus();
            
            // 设置光标位置
            this.editor.setSelectionRange(index, index + searchText.length);
            
            // 滚动到可见位置
            const lines = content.substring(0, index).split('\n');
            const lineHeight = parseInt(getComputedStyle(this.editor).lineHeight) || 20;
            const scrollTop = (lines.length - 1) * lineHeight - this.editor.clientHeight / 3;
            this.editor.scrollTop = Math.max(0, scrollTop);
            
            console.log(`[Edit] 定位到第 ${lineNumber} 行: "${searchText.substring(0, 30)}..."`);
        }
    }

    // 打开文件夹
    async openFolder() {
        try {
            this.directoryHandle = await window.showDirectoryPicker();
            // 保存文件夹句柄
            await this.saveFolderHandle(this.directoryHandle);
            // 添加到最近文件夹列表
            await this.addToRecentFolders(this.directoryHandle);
            // 加载基础路径设置
            this.loadBasePath();
            this.showToast('文件夹已打开: ' + this.directoryHandle.name, 'success');
            await this.loadFiles();
            
            // 显示设置路径按钮
            const setBasePathBtn = document.getElementById('setBasePathBtn');
            if (setBasePathBtn) {
                setBasePathBtn.style.display = '';
            }
            
            // 如果没有设置基础路径，提示用户设置
            if (!this.basePath) {
                const shouldSet = confirm(
                    `是否设置文件夹 "${this.directoryHandle.name}" 的完整系统路径？\n\n` +
                    `设置后，复制的路径将是完整的文件系统路径，可以直接在文件管理器中打开。`
                );
                if (shouldSet) {
                    this.setBasePath();
                }
            }
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
        
        // 分析更多内容进行编码检测
        const sampleSize = Math.min(4096, buffer.byteLength);
        const testArr = new Uint8Array(buffer.slice(0, sampleSize));
        
        // 使用更严格的 UTF-8 验证
        if (this.isValidUtf8(testArr)) {
            return 'utf-8';
        }
        
        // 检测是否可能是 GBK/GB2312
        if (this.looksLikeGbk(testArr)) {
            return 'gbk';
        }
        
        // 默认 UTF-8
        return 'utf-8';
    }
    
    /**
     * 严格验证是否为有效的 UTF-8 编码
     * UTF-8 编码规则：
     * - 0xxxxxxx: ASCII (0-127)
     * - 110xxxxx 10xxxxxx: 2字节 (128-2047)
     * - 1110xxxx 10xxxxxx 10xxxxxx: 3字节 (2048-65535)
     * - 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx: 4字节 (65536+)
     */
    isValidUtf8(arr) {
        let i = 0;
        let hasMultiByte = false;
        
        while (i < arr.length) {
            const byte = arr[i];
            
            if (byte <= 0x7F) {
                // ASCII
                i++;
            } else if ((byte & 0xE0) === 0xC0) {
                // 2字节序列: 110xxxxx
                if (i + 1 >= arr.length) return false;
                if ((arr[i + 1] & 0xC0) !== 0x80) return false;
                // 检查过长编码 (overlong encoding)
                if ((byte & 0x1E) === 0) return false;
                hasMultiByte = true;
                i += 2;
            } else if ((byte & 0xF0) === 0xE0) {
                // 3字节序列: 1110xxxx
                if (i + 2 >= arr.length) return false;
                if ((arr[i + 1] & 0xC0) !== 0x80) return false;
                if ((arr[i + 2] & 0xC0) !== 0x80) return false;
                // 检查过长编码
                if (byte === 0xE0 && (arr[i + 1] & 0x20) === 0) return false;
                hasMultiByte = true;
                i += 3;
            } else if ((byte & 0xF8) === 0xF0) {
                // 4字节序列: 11110xxx
                if (i + 3 >= arr.length) return false;
                if ((arr[i + 1] & 0xC0) !== 0x80) return false;
                if ((arr[i + 2] & 0xC0) !== 0x80) return false;
                if ((arr[i + 3] & 0xC0) !== 0x80) return false;
                // 检查过长编码
                if (byte === 0xF0 && (arr[i + 1] & 0x30) === 0) return false;
                hasMultiByte = true;
                i += 4;
            } else {
                // 非法的 UTF-8 起始字节
                return false;
            }
        }
        
        // 如果只有 ASCII，也是有效的 UTF-8
        return true;
    }
    
    /**
     * 启发式检测是否像 GBK 编码
     * GBK 双字节字符范围：
     * - 第一字节: 0x81-0xFE
     * - 第二字节: 0x40-0xFE (排除 0x7F)
     */
    looksLikeGbk(arr) {
        let gbkPairs = 0;
        let invalidPairs = 0;
        let i = 0;
        
        while (i < arr.length) {
            const byte = arr[i];
            
            if (byte <= 0x7F) {
                // ASCII
                i++;
            } else if (byte >= 0x81 && byte <= 0xFE) {
                // 可能是 GBK 双字节的第一个字节
                if (i + 1 < arr.length) {
                    const nextByte = arr[i + 1];
                    if ((nextByte >= 0x40 && nextByte <= 0x7E) || 
                        (nextByte >= 0x80 && nextByte <= 0xFE)) {
                        gbkPairs++;
                        i += 2;
                    } else {
                        invalidPairs++;
                        i++;
                    }
                } else {
                    i++;
                }
            } else {
                invalidPairs++;
                i++;
            }
        }
        
        // 如果有 GBK 字符对且没有太多无效对，则认为是 GBK
        return gbkPairs > 0 && invalidPairs <= gbkPairs * 0.1;
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
            
            // 保存上次打开的文件路径（用于F5刷新后恢复）
            localStorage.setItem('md-viewer-last-file', filePath);
            
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
            
            // 显示工具栏按钮
            const refreshBtn = document.getElementById('refreshFileBtn');
            if (refreshBtn) {
                refreshBtn.style.display = '';
            }
            const copyPathBtn = document.getElementById('copyPathBtn');
            if (copyPathBtn) {
                copyPathBtn.style.display = '';
            }
            
            // 更新工具栏文件名的提示（显示完整路径）
            this.currentFileEl.title = `点击复制路径: ${this.getFullFilePath()}`;
            
            // 记录导航历史
            this.pushNavigationHistory('file', { scrollTop: 0 });
            this.updateNavigationButtons();
            
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
        // 清理之前创建的 blob URL，防止内存泄漏
        if (this._imageBlobUrls) {
            for (const url of this._imageBlobUrls) {
                URL.revokeObjectURL(url);
            }
        }
        this._imageBlobUrls = [];
        
        const content = this.editor.value;
        this.preview.innerHTML = marked.parse(content);
        
        // 注意：代码块已由自定义 renderer.code 高亮，无需再次调用 hljs.highlightElement
        // 处理本地 .md 文件链接的点击
        this.bindMdLinkHandlers();
        
        // 解析本地图片路径（通过 File System Access API 读取图片并创建 blob URL）
        this.resolveImagePaths();
        
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
        
        // 渲染 PlantUML 图表
        this.renderPlantUML();
        
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
    
    // ==================== 本地文档链接跳转功能 ====================
    
    /**
     * 绑定本地 .md 文件链接的点击事件处理器
     * 拦截相对路径的 .md 链接，在应用内跳转
     */
    bindMdLinkHandlers() {
        // 查找所有指向 .md 文件的链接（排除外部链接）
        const mdLinks = this.preview.querySelectorAll('a[href$=".md"], a[href$=".markdown"]');
        
        mdLinks.forEach(link => {
            const href = link.getAttribute('href');
            
            // 跳过外部链接（http/https 开头）
            if (href.startsWith('http://') || href.startsWith('https://')) {
                return;
            }
            
            // 跳过锚点链接
            if (href.startsWith('#')) {
                return;
            }
            
            // 绑定点击事件
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleMdLinkClick(href);
            });
            
            // 添加视觉提示
            link.style.cursor = 'pointer';
            link.title = link.title || `点击打开: ${href}`;
        });
    }
    
    /**
     * 处理 .md 链接点击
     * @param {string} href - 链接的 href 属性值
     */
    handleMdLinkClick(href) {
        // 获取当前文件路径
        const currentPath = this.currentFileEl.textContent;
        
        if (!currentPath) {
            this.showToast('请先打开一个文件', 'warning');
            return;
        }
        
        // 记录当前位置到导航历史（跳转前）
        const previewContainer = this.preview.parentElement;
        this.pushNavigationHistory('link', {
            scrollTop: previewContainer ? previewContainer.scrollTop : 0
        });
        
        // 解析目标文件路径
        const targetPath = this.resolveRelativePath(currentPath, href);
        
        console.log(`[Link] 当前文件: ${currentPath}`);
        console.log(`[Link] 链接 href: ${href}`);
        console.log(`[Link] 解析后路径: ${targetPath}`);
        
        // 检查文件是否存在于已加载的文件列表中
        if (this.fileHandles.has(targetPath)) {
            this.loadFile(targetPath);
        } else {
            // 尝试规范化路径后再次查找
            const normalizedPath = this.normalizePath(targetPath);
            if (this.fileHandles.has(normalizedPath)) {
                this.loadFile(normalizedPath);
            } else {
                this.showToast(`文件不存在: ${targetPath}`, 'error');
                console.warn(`[Link] 文件未找到。已知文件:`, Array.from(this.fileHandles.keys()));
            }
        }
    }
    
    /**
     * 解析相对路径
     * @param {string} currentPath - 当前文件路径 (如: "docs/guide/intro.md")
     * @param {string} relativePath - 相对路径 (如: "./other.md" 或 "../parent.md")
     * @returns {string} 解析后的完整路径
     */
    resolveRelativePath(currentPath, relativePath) {
        // 获取当前文件的目录
        const pathParts = currentPath.split('/');
        pathParts.pop(); // 移除文件名，保留目录路径
        
        // 处理相对路径
        let targetParts = [...pathParts];
        const relParts = relativePath.split('/');
        
        for (const part of relParts) {
            if (part === '.' || part === '') {
                // 当前目录，跳过
                continue;
            } else if (part === '..') {
                // 上级目录
                if (targetParts.length > 0) {
                    targetParts.pop();
                }
            } else {
                // 添加路径部分
                targetParts.push(part);
            }
        }
        
        return targetParts.join('/');
    }
    
    /**
     * 规范化路径（处理反斜杠、多余斜杠等）
     * @param {string} path - 路径
     * @returns {string} 规范化后的路径
     */
    normalizePath(path) {
        return path
            .replace(/\\/g, '/')  // 反斜杠转正斜杠
            .replace(/\/+/g, '/') // 多个斜杠合并
            .replace(/^\//, '')   // 移除开头斜杠
            .replace(/\/$/, '');  // 移除结尾斜杠
    }

    // ==================== 本地图片解析功能 ====================

    /**
     * 解析预览中的本地图片路径
     * 对于相对路径的图片，通过 File System Access API 读取并创建 blob URL
     */
    async resolveImagePaths() {
        const images = this.preview.querySelectorAll('img[data-original-src]');
        if (images.length === 0) return;

        const currentPath = this.currentFileEl.textContent;
        if (!currentPath || currentPath === '请打开文件夹并选择 Markdown 文件') return;

        console.log(`[Image] 找到 ${images.length} 张本地图片待解析`);

        // 获取当前文件所在目录路径
        const pathParts = currentPath.split('/');
        pathParts.pop(); // 移除文件名
        const currentDir = pathParts.join('/');

        for (const img of images) {
            const originalSrc = img.getAttribute('data-original-src');
            if (!originalSrc) continue;

            try {
                // 解析图片的相对路径
                const resolvedPath = this.resolveRelativePath(currentPath, originalSrc);
                const normalizedPath = this.normalizePath(resolvedPath);
                console.log(`[Image] 解析图片: ${originalSrc} → ${normalizedPath}`);

                // 通过 File System Access API 读取图片
                const blobUrl = await this.readImageFile(normalizedPath);
                if (blobUrl) {
                    img.src = blobUrl;
                    img.removeAttribute('data-original-src');
                    // 更新 onclick 以打开 blob URL
                    img.setAttribute('onclick', `window.open('${blobUrl}', '_blank')`);
                    // 记录 blob URL 以便后续清理
                    if (!this._imageBlobUrls) this._imageBlobUrls = [];
                    this._imageBlobUrls.push(blobUrl);
                    console.log(`[Image] 图片已加载: ${normalizedPath}`);
                } else {
                    // 加载失败时保留原始路径
                    img.src = originalSrc;
                    img.removeAttribute('data-original-src');
                }
            } catch (error) {
                console.warn(`[Image] 加载图片失败: ${originalSrc}`, error);
                // 加载失败时保留原始路径（可能显示为损坏图标）
                img.src = originalSrc;
                img.removeAttribute('data-original-src');
            }
        }
    }

    /**
     * 通过 File System Access API 读取图片文件并返回 blob URL
     * @param {string} filePath - 相对于根目录的文件路径 (如: "docs/images/photo.png")
     * @returns {Promise<string|null>} blob URL 或 null
     */
    async readImageFile(filePath) {
        if (!this.directoryHandle) return null;

        try {
            // 将路径拆分为目录部分和文件名
            const parts = filePath.split('/');
            const fileName = parts.pop();
            
            // 逐级进入子目录
            let currentHandle = this.directoryHandle;
            for (const part of parts) {
                if (!part) continue;
                try {
                    currentHandle = await currentHandle.getDirectoryHandle(part);
                } catch (e) {
                    console.warn(`[Image] 无法进入目录: ${part}`, e);
                    return null;
                }
            }

            // 获取图片文件句柄
            const imageFileHandle = await currentHandle.getFileHandle(fileName);
            const imageFile = await imageFileHandle.getFile();

            // 创建 blob URL
            const blobUrl = URL.createObjectURL(imageFile);
            console.log(`[Image] 创建 Blob URL: ${blobUrl}`);
            return blobUrl;
        } catch (error) {
            console.warn(`[Image] 读取图片文件失败: ${filePath}`, error);
            return null;
        }
    }

    // ==================== 导航历史功能 ====================
    
    /**
     * 记录当前位置到导航历史
     * @param {string} type - 类型: 'file', 'heading', 'scroll'
     * @param {object} data - 位置数据
     */
    pushNavigationHistory(type, data) {
        if (this.isNavigatingHistory) return;
        
        const currentFile = this.currentFileEl.textContent;
        if (!currentFile || currentFile === '请打开文件夹并选择 Markdown 文件') return;
        
        const entry = {
            type: type,
            filePath: currentFile,
            timestamp: Date.now(),
            ...data
        };
        
        // 如果不是在历史末尾，删除当前位置之后的历史
        if (this.historyIndex < this.navigationHistory.length - 1) {
            this.navigationHistory = this.navigationHistory.slice(0, this.historyIndex + 1);
        }
        
        // 避免连续记录相同位置
        const lastEntry = this.navigationHistory[this.navigationHistory.length - 1];
        if (lastEntry && 
            lastEntry.filePath === entry.filePath && 
            lastEntry.type === entry.type &&
            lastEntry.headingId === entry.headingId) {
            return;
        }
        
        this.navigationHistory.push(entry);
        
        // 限制历史记录大小
        if (this.navigationHistory.length > this.maxHistorySize) {
            this.navigationHistory.shift();
        }
        
        this.historyIndex = this.navigationHistory.length - 1;
        this.updateNavigationButtons();
    }
    
    /**
     * 返回上一个位置
     */
    async goBack() {
        if (this.historyIndex <= 0) {
            this.showToast('已经是最早的位置', 'info');
            return;
        }
        
        this.isNavigatingHistory = true;
        this.historyIndex--;
        
        const entry = this.navigationHistory[this.historyIndex];
        await this.navigateToEntry(entry);
        
        this.isNavigatingHistory = false;
        this.updateNavigationButtons();
    }
    
    /**
     * 前进到下一个位置
     */
    async goForward() {
        if (this.historyIndex >= this.navigationHistory.length - 1) {
            this.showToast('已经是最新的位置', 'info');
            return;
        }
        
        this.isNavigatingHistory = true;
        this.historyIndex++;
        
        const entry = this.navigationHistory[this.historyIndex];
        await this.navigateToEntry(entry);
        
        this.isNavigatingHistory = false;
        this.updateNavigationButtons();
    }
    
    /**
     * 导航到历史记录条目
     */
    async navigateToEntry(entry) {
        const currentFile = this.currentFileEl.textContent;
        
        // 如果是不同文件，先加载文件
        if (entry.filePath !== currentFile) {
            await this.loadFile(entry.filePath);
            // 等待渲染完成
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // 滚动到指定位置
        if (entry.headingId) {
            const targetElement = document.getElementById(entry.headingId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
                // 分栏模式下同步编辑器
                if (this.viewMode === 'split' && entry.headingText && entry.headingLevel) {
                    this.scrollEditorToHeading(entry.headingText, entry.headingLevel);
                }
            }
        } else if (entry.scrollTop !== undefined) {
            this.preview.parentElement.scrollTo({
                top: entry.scrollTop,
                behavior: 'smooth'
            });
        }
        
        this.showToast(`返回: ${entry.filePath.split('/').pop()}`, 'info');
    }
    
    /**
     * 更新导航按钮状态
     */
    updateNavigationButtons() {
        const goBackBtn = document.getElementById('goBackBtn');
        const goForwardBtn = document.getElementById('goForwardBtn');
        
        if (goBackBtn) {
            if (this.historyIndex > 0) {
                goBackBtn.style.display = '';
                goBackBtn.disabled = false;
                goBackBtn.style.opacity = '1';
            } else {
                goBackBtn.style.display = '';
                goBackBtn.disabled = true;
                goBackBtn.style.opacity = '0.4';
            }
        }
        
        if (goForwardBtn) {
            if (this.historyIndex < this.navigationHistory.length - 1) {
                goForwardBtn.style.display = '';
                goForwardBtn.disabled = false;
                goForwardBtn.style.opacity = '1';
            } else {
                goForwardBtn.style.display = '';
                goForwardBtn.disabled = true;
                goForwardBtn.style.opacity = '0.4';
            }
        }
    }

    // ==================== 分栏同步功能 ====================
    
    /**
     * 将编辑器滚动位置同步到预览区
     * 基于编辑器当前行号找到对应的预览位置
     */
    syncEditorToPreview() {
        if (this.viewMode !== 'split') return;
        
        const editorScrollRatio = this.editor.scrollTop / (this.editor.scrollHeight - this.editor.clientHeight);
        
        // 计算编辑器当前可见的行号
        const lineHeight = this.getEditorLineHeight();
        const firstVisibleLine = Math.floor(this.editor.scrollTop / lineHeight);
        
        // 获取编辑器内容的行
        const lines = this.editor.value.substring(0, this.editor.selectionStart || 0).split('\n');
        const currentLineIndex = lines.length - 1;
        
        // 尝试找到对应的标题位置
        const headingMatch = this.findNearestHeadingFromLine(firstVisibleLine);
        
        if (headingMatch) {
            const targetElement = document.getElementById(headingMatch.id);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                this.showToast('已同步到预览区', 'success');
                return;
            }
        }
        
        // 如果没有找到标题，使用比例同步
        const previewScrollTop = editorScrollRatio * (this.preview.scrollHeight - this.preview.clientHeight);
        this.preview.parentElement.scrollTo({
            top: previewScrollTop,
            behavior: 'smooth'
        });
        this.showToast('已同步到预览区', 'success');
    }
    
    /**
     * 将预览区滚动位置同步到编辑器
     * 基于预览区当前可见的标题找到对应的编辑器位置
     */
    syncPreviewToEditor() {
        if (this.viewMode !== 'split') return;
        
        // 找到预览区当前可见的第一个标题
        const previewContainer = this.preview.parentElement;
        const headings = this.preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
        
        let visibleHeading = null;
        const containerTop = previewContainer.scrollTop;
        
        for (const heading of headings) {
            const rect = heading.getBoundingClientRect();
            const containerRect = previewContainer.getBoundingClientRect();
            const relativeTop = rect.top - containerRect.top;
            
            if (relativeTop >= -50 && relativeTop < previewContainer.clientHeight / 2) {
                visibleHeading = heading;
                break;
            }
        }
        
        if (visibleHeading) {
            // 在编辑器中找到对应的标题行
            const headingText = visibleHeading.textContent;
            const headingLevel = parseInt(visibleHeading.tagName.charAt(1));
            const lineIndex = this.findHeadingLineInEditor(headingText, headingLevel);
            
            if (lineIndex >= 0) {
                this.scrollEditorToLine(lineIndex);
                this.showToast('已同步到编辑器', 'success');
                return;
            }
        }
        
        // 使用比例同步
        const previewScrollRatio = previewContainer.scrollTop / (previewContainer.scrollHeight - previewContainer.clientHeight);
        const editorScrollTop = previewScrollRatio * (this.editor.scrollHeight - this.editor.clientHeight);
        this.editor.scrollTo({
            top: editorScrollTop,
            behavior: 'smooth'
        });
        this.showToast('已同步到编辑器', 'success');
    }
    
    /**
     * 获取编辑器的行高
     */
    getEditorLineHeight() {
        const style = window.getComputedStyle(this.editor);
        return parseFloat(style.lineHeight) || 20;
    }
    
    /**
     * 从编辑器行号找到最近的标题
     */
    findNearestHeadingFromLine(lineNumber) {
        const lines = this.editor.value.split('\n');
        
        // 从当前行向上查找标题
        for (let i = Math.min(lineNumber, lines.length - 1); i >= 0; i--) {
            const line = lines[i];
            const match = line.match(/^(#{1,6})\s+(.+)/);
            if (match) {
                const text = match[2].trim();
                const slug = text.toLowerCase()
                    .replace(/[\s]+/g, '-')
                    .replace(/[^\w\u4e00-\u9fa5-]/g, '');
                return { id: slug, text: text, level: match[1].length };
            }
        }
        return null;
    }
    
    /**
     * 在编辑器中查找标题所在行
     */
    findHeadingLineInEditor(headingText, level) {
        const lines = this.editor.value.split('\n');
        const prefix = '#'.repeat(level);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // 匹配标题格式
            if (line.startsWith(prefix + ' ')) {
                const text = line.substring(prefix.length + 1).trim();
                // 简化比较（去除可能的格式差异）
                if (text === headingText || 
                    text.replace(/[*_`]/g, '') === headingText.replace(/[*_`]/g, '')) {
                    return i;
                }
            }
        }
        return -1;
    }
    
    /**
     * 滚动编辑器到指定行
     */
    scrollEditorToLine(lineIndex) {
        const lines = this.editor.value.split('\n');
        let charIndex = 0;
        
        for (let i = 0; i < lineIndex && i < lines.length; i++) {
            charIndex += lines[i].length + 1; // +1 for newline
        }
        
        // 设置光标位置
        this.editor.focus();
        this.editor.setSelectionRange(charIndex, charIndex);
        
        // 计算滚动位置
        const lineHeight = this.getEditorLineHeight();
        const scrollTop = lineIndex * lineHeight - this.editor.clientHeight / 3;
        
        this.editor.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: 'smooth'
        });
    }
    
    /**
     * 滚动编辑器到指定标题（供目录点击使用）
     */
    scrollEditorToHeading(headingText, headingLevel) {
        const lineIndex = this.findHeadingLineInEditor(headingText, headingLevel);
        if (lineIndex >= 0) {
            this.scrollEditorToLine(lineIndex);
        }
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
    
    // 渲染 PlantUML 图表
    renderPlantUML() {
        const plantumlElements = this.preview.querySelectorAll('.plantuml');
        console.log(`[Preview] 找到 ${plantumlElements.length} 个 PlantUML 元素待渲染`);
        
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
            
            // 使用深色/浅色主题
            const isDark = document.body.getAttribute('data-theme') === 'dark';
            const format = 'svg'; // 使用 SVG 格式以获得更好的渲染效果
            
            // 构建 PlantUML 服务器 URL
            const imgUrl = `${this.plantumlServer}/${format}/${encoded}`;
            
            console.log(`[PlantUML] 渲染图表: ${element.id}`);
            
            // 创建图片元素
            const img = new Image();
            img.onload = () => {
                element.innerHTML = '';
                element.appendChild(img);
                // 绑定缩放事件
                this.attachDiagramZoomHandlers();
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
    
    /**
     * 显示功能演示文档
     * 用于在用户首次使用时展示软件的全部能力
     */
    showFeaturesDemo() {
        // 内置的功能演示文档
        const demoContent = `# 🎨 MD Viewer 功能演示

欢迎使用 MD Viewer！这是一个功能强大的 Markdown 阅读器，支持多种图表和格式。

---

## 📊 Mermaid 图表

### 流程图

\`\`\`mermaid
graph TD
    A[开始使用 MD Viewer] --> B{选择文件夹}
    B --> C[浏览文件列表]
    C --> D[选择 Markdown 文件]
    D --> E[实时预览]
    E --> F{需要编辑?}
    F -->|是| G[分栏编辑模式]
    F -->|否| H[继续阅读]
    G --> I[保存文件]
    I --> E
\`\`\`

### 时序图

\`\`\`mermaid
sequenceDiagram
    participant 用户
    participant MD Viewer
    participant 文件系统
    
    用户->>MD Viewer: 打开文件夹
    MD Viewer->>文件系统: 请求读取权限
    文件系统-->>MD Viewer: 授权成功
    MD Viewer->>文件系统: 读取 .md 文件列表
    文件系统-->>MD Viewer: 返回文件列表
    MD Viewer-->>用户: 显示文件树
    用户->>MD Viewer: 点击文件
    MD Viewer->>文件系统: 读取文件内容
    文件系统-->>MD Viewer: 返回内容
    MD Viewer-->>用户: 渲染预览
\`\`\`

### 饼图

\`\`\`mermaid
pie title MD Viewer 支持的功能
    "Markdown 语法" : 30
    "代码高亮" : 20
    "Mermaid 图表" : 20
    "PlantUML 图表" : 15
    "数学公式" : 15
\`\`\`

### 状态图

\`\`\`mermaid
stateDiagram-v2
    [*] --> 浅色主题
    浅色主题 --> 深色主题: 点击切换
    深色主题 --> 浅色主题: 点击切换
    浅色主题 --> [*]
    深色主题 --> [*]
\`\`\`

---

## 🏗️ PlantUML 图表

PlantUML 提供更专业的 UML 图表支持。

### 时序图

\`\`\`plantuml
@startuml
skinparam backgroundColor #FEFEFE

actor 用户 as U
participant "前端" as F
participant "后端" as B
database "数据库" as D

U -> F: 请求数据
activate F
F -> B: API 调用
activate B
B -> D: 查询
activate D
D --> B: 返回结果
deactivate D
B --> F: 响应数据
deactivate B
F --> U: 显示结果
deactivate F
@enduml
\`\`\`

### 类图

\`\`\`plantuml
@startuml
class MDViewer {
    - currentFile: String
    - isModified: Boolean
    + loadFile(): void
    + saveFile(): void
    + updatePreview(): void
}

class Editor {
    - content: String
    + getValue(): String
    + setValue(): void
}

class Preview {
    + render(): void
    + renderMermaid(): void
    + renderPlantUML(): void
}

MDViewer *-- Editor
MDViewer *-- Preview
@enduml
\`\`\`

### 思维导图

\`\`\`plantuml
@startmindmap
* MD Viewer
** 📁 文件管理
*** 打开文件夹
*** 最近打开
*** 文件搜索
** ✏️ 编辑功能
*** 实时预览
*** 分栏模式
** 🎨 渲染支持
*** Mermaid
*** PlantUML
*** 数学公式
** 🌙 主题
*** 浅色
*** 深色
@endmindmap
\`\`\`

### 活动图

\`\`\`plantuml
@startuml
start
:打开 MD Viewer;
if (有上次打开的文件夹?) then (是)
    :自动恢复;
else (否)
    :显示欢迎页面;
endif
:选择文件;
:渲染内容;
fork
    :渲染 Markdown;
fork again
    :渲染 Mermaid;
fork again
    :渲染 PlantUML;
end fork
:显示预览;
stop
@enduml
\`\`\`

---

## 💻 代码高亮

支持 180+ 种编程语言的语法高亮。

### JavaScript

\`\`\`javascript
// 异步函数示例
async function fetchData(url) {
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('Error:', error);
    }
}
\`\`\`

### Python

\`\`\`python
def fibonacci(n):
    """生成斐波那契数列"""
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

# 使用生成器
for num in fibonacci(10):
    print(num)
\`\`\`

---

## 📐 数学公式

使用 KaTeX 渲染数学公式。

### 行内公式

著名的质能方程 $E = mc^2$，以及勾股定理 $a^2 + b^2 = c^2$。

### 块级公式

$$
\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

---

## 📋 其他功能

### 表格

| 功能 | Mermaid | PlantUML |
|------|:-------:|:--------:|
| 流程图 | ✅ | ✅ |
| 时序图 | ✅ | ✅ |
| 类图 | ✅ | ✅ |
| 思维导图 | ❌ | ✅ |
| 甘特图 | ✅ | ✅ |
| 离线使用 | ✅ | ❌ |

### 任务列表

- [x] 支持 Mermaid 图表
- [x] 支持 PlantUML 图表
- [x] 支持数学公式
- [x] 深色/浅色主题切换
- [x] 文件夹记忆功能
- [ ] 导出为 PDF

### 引用

> 💡 **提示**: 双击任意图表可以放大查看！

---

**开始使用**: 点击左侧"打开文件夹"按钮，选择包含 Markdown 文件的文件夹即可开始！ 🚀
`;

        // 隐藏欢迎页面，显示预览
        this.welcomePage.style.display = 'none';
        this.previewContainer.style.display = 'flex';
        this.editorContainer.style.display = 'none';
        this.splitResizer.style.display = 'none';
        
        // 更新标题
        this.currentFileEl.textContent = '📖 功能演示 (内置文档)';
        
        // 渲染演示内容
        this.preview.innerHTML = marked.parse(demoContent);
        
        // 注意：代码块已由自定义 renderer.code 高亮，无需再次调用 hljs.highlightElement
        // 渲染 Mermaid 图表
        if (typeof mermaid !== 'undefined') {
            const mermaidElements = this.preview.querySelectorAll('.mermaid');
            if (mermaidElements.length > 0) {
                mermaidElements.forEach((element, index) => {
                    element.id = `mermaid-demo-${Date.now()}-${index}`;
                });
                mermaid.run({ nodes: mermaidElements }).then(() => {
                    setTimeout(() => {
                        this.attachDiagramZoomHandlers();
                    }, 100);
                });
            }
        }
        
        // 渲染 PlantUML 图表
        this.renderPlantUML();
        
        // 渲染数学公式
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(this.preview, {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false}
                ],
                throwOnError: false
            });
        }
        
        this.showToast('正在加载功能演示...', 'info');
    }
    
    // ==================== 导出功能 ====================
    
    /**
     * 初始化导出功能
     */
    initExportFeature() {
        const exportBtn = document.getElementById('exportBtn');
        const exportMenu = document.getElementById('exportMenu');
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        const exportWordBtn = document.getElementById('exportWordBtn');
        const exportHtmlBtn = document.getElementById('exportHtmlBtn');
        
        if (!exportBtn || !exportMenu) return;
        
        // 切换下拉菜单
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu.classList.toggle('show');
        });
        
        // 点击其他地方关闭菜单
        document.addEventListener('click', () => {
            exportMenu.classList.remove('show');
        });
        
        // 导出PDF
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                exportMenu.classList.remove('show');
                this.exportToPdf();
            });
        }
        
        // 导出Word
        if (exportWordBtn) {
            exportWordBtn.addEventListener('click', () => {
                exportMenu.classList.remove('show');
                this.exportToWord();
            });
        }
        
        // 导出HTML
        if (exportHtmlBtn) {
            exportHtmlBtn.addEventListener('click', () => {
                exportMenu.classList.remove('show');
                this.exportToHtml();
            });
        }
        
        // 批量导出按钮
        const batchExportPdfBtn = document.getElementById('batchExportPdfBtn');
        const batchExportWordBtn = document.getElementById('batchExportWordBtn');
        const batchExportHtmlBtn = document.getElementById('batchExportHtmlBtn');
        
        if (batchExportPdfBtn) {
            batchExportPdfBtn.addEventListener('click', () => {
                exportMenu.classList.remove('show');
                this.batchExport('pdf');
            });
        }
        
        if (batchExportWordBtn) {
            batchExportWordBtn.addEventListener('click', () => {
                exportMenu.classList.remove('show');
                this.batchExport('word');
            });
        }
        
        if (batchExportHtmlBtn) {
            batchExportHtmlBtn.addEventListener('click', () => {
                exportMenu.classList.remove('show');
                this.batchExport('html');
            });
        }
    }
    
    /**
     * 获取当前文件名（不带扩展名）
     */
    getExportFileName() {
        const currentFile = this.currentFileEl.textContent;
        if (!currentFile || currentFile.includes('请打开') || currentFile.includes('功能演示')) {
            return 'document';
        }
        // 提取文件名，去掉路径和扩展名
        const fileName = currentFile.split('/').pop().split('\\').pop();
        return fileName.replace(/\.(md|markdown)$/i, '') || 'document';
    }
    
    /**
     * 显示导出进度
     */
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
    
    /**
     * 隐藏导出进度
     */
    hideExportProgress() {
        const overlay = document.getElementById('exportOverlay');
        if (overlay) {
            overlay.remove();
        }
    }
    
    /**
     * 获取完整的导出样式
     */
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
            h4 { font-size: 1em; }
            p { margin: 0 0 16px 0; }
            a { color: #0366d6; text-decoration: none; }
            strong { font-weight: 600; }
            em { font-style: italic; }
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
                line-height: 1.45;
                margin: 0 0 16px 0;
            }
            pre code {
                background: transparent;
                padding: 0;
                font-size: 100%;
            }
            blockquote {
                margin: 0 0 16px 0;
                padding: 0 1em;
                color: #6a737d;
                border-left: 0.25em solid #dfe2e5;
            }
            ul, ol {
                margin: 0 0 16px 0;
                padding-left: 2em;
            }
            li { margin: 0.25em 0; }
            li + li { margin-top: 0.25em; }
            table {
                border-collapse: collapse;
                width: 100%;
                margin: 0 0 16px 0;
            }
            table th, table td {
                border: 1px solid #dfe2e5;
                padding: 6px 13px;
            }
            table th {
                font-weight: 600;
                background-color: #f6f8fa;
            }
            table tr:nth-child(2n) {
                background-color: #f6f8fa;
            }
            hr {
                height: 0.25em;
                padding: 0;
                margin: 24px 0;
                background-color: #e1e4e8;
                border: 0;
            }
            img {
                max-width: 100%;
                height: auto;
                display: block;
                margin: 16px auto;
            }
            svg {
                max-width: 100%;
                height: auto;
            }
            .mermaid, .plantuml {
                text-align: center;
                margin: 24px 0;
                page-break-inside: avoid;
            }
            .mermaid svg, .plantuml img {
                max-width: 100%;
                height: auto;
            }
            .task-list-item {
                list-style-type: none;
            }
            .task-list-item input {
                margin-right: 0.5em;
            }
            @media print {
                body { padding: 0; }
                pre, code { white-space: pre-wrap; word-wrap: break-word; }
                .mermaid, .plantuml { page-break-inside: avoid; }
            }
        `;
    }
    
    /**
     * 获取用于导出的HTML内容（包含处理后的图表）
     */
    getExportHtmlContent() {
        // 克隆预览区内容
        const content = this.preview.cloneNode(true);
        
        // 移除不需要导出的元素
        content.querySelectorAll('.zoom-hint, .copy-btn, .plantuml-loading').forEach(el => el.remove());
        
        return content.innerHTML;
    }
    
    /**
     * 导出为PDF（使用浏览器打印功能，效果最好）
     */
    async exportToPdf() {
        if (!this.preview.innerHTML || this.preview.innerHTML.trim() === '') {
            this.showToast('没有可导出的内容', 'warning');
            return;
        }
        
        const fileName = this.getExportFileName();
        
        // 创建打印窗口
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            this.showToast('请允许弹出窗口以导出PDF', 'warning');
            return;
        }
        
        const htmlContent = `
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
</html>`;
        
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        this.showToast('请在打印对话框中选择"另存为PDF"', 'info');
    }
    
    /**
     * 导出为Word
     */
    async exportToWord() {
        if (!this.preview.innerHTML || this.preview.innerHTML.trim() === '') {
            this.showToast('没有可导出的内容', 'warning');
            return;
        }
        
        const fileName = this.getExportFileName();
        this.showExportProgress('正在生成 Word 文档...');
        
        try {
            // 将SVG图表转换为图片数据
            const content = this.preview.cloneNode(true);
            
            // 移除不需要的元素
            content.querySelectorAll('.zoom-hint, .copy-btn, .plantuml-loading').forEach(el => el.remove());
            
            // 处理Mermaid SVG - 转换为内联样式
            content.querySelectorAll('.mermaid svg').forEach(svg => {
                svg.setAttribute('width', '100%');
                svg.style.maxWidth = '100%';
            });
            
            // 构建Word兼容的HTML文档
            const htmlContent = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <title>${fileName}</title>
    <!--[if gte mso 9]>
    <xml>
        <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        @page { size: A4; margin: 2cm; }
        body {
            font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
        }
        h1 { font-size: 22pt; font-weight: bold; margin: 24pt 0 12pt 0; border-bottom: 1pt solid #ccc; padding-bottom: 6pt; }
        h2 { font-size: 18pt; font-weight: bold; margin: 20pt 0 10pt 0; border-bottom: 1pt solid #eee; padding-bottom: 4pt; }
        h3 { font-size: 14pt; font-weight: bold; margin: 16pt 0 8pt 0; }
        h4 { font-size: 12pt; font-weight: bold; margin: 14pt 0 6pt 0; }
        p { margin: 0 0 12pt 0; }
        code {
            font-family: Consolas, "Courier New", monospace;
            font-size: 10pt;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
        }
        pre {
            font-family: Consolas, "Courier New", monospace;
            font-size: 10pt;
            background-color: #f5f5f5;
            padding: 12pt;
            border: 1pt solid #ddd;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        pre code { background: none; padding: 0; }
        blockquote {
            margin: 12pt 0;
            padding: 6pt 12pt;
            border-left: 4pt solid #ddd;
            color: #666;
        }
        table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
        th, td { border: 1pt solid #000; padding: 6pt 10pt; }
        th { background-color: #f0f0f0; font-weight: bold; }
        ul, ol { margin: 12pt 0; padding-left: 24pt; }
        li { margin: 4pt 0; }
        img { max-width: 100%; height: auto; }
        a { color: #0066cc; }
        hr { border: none; border-top: 1pt solid #ccc; margin: 18pt 0; }
        .mermaid, .plantuml { text-align: center; margin: 18pt 0; }
    </style>
</head>
<body>
    ${content.innerHTML}
</body>
</html>`;
            
            // 创建Blob并下载
            const blob = new Blob(['\ufeff' + htmlContent], { 
                type: 'application/msword;charset=utf-8' 
            });
            
            // 使用FileSaver或原生下载
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
            console.error('Word导出失败:', error);
            this.showToast('Word导出失败: ' + error.message, 'error');
        }
    }
    
    /**
     * 导出为HTML
     */
    async exportToHtml() {
        if (!this.preview.innerHTML || this.preview.innerHTML.trim() === '') {
            this.showToast('没有可导出的内容', 'warning');
            return;
        }
        
        const fileName = this.getExportFileName();
        
        try {
            // 构建完整的独立HTML文档，内联所有样式
            const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${fileName}</title>
    <style>
        ${this.getExportStyles()}
        /* Mermaid图表容器 */
        .mermaid { text-align: center; margin: 24px 0; }
        .mermaid svg { max-width: 100%; height: auto; }
        /* PlantUML图表容器 */
        .plantuml { text-align: center; margin: 24px 0; }
        .plantuml img { max-width: 100%; height: auto; }
        /* 代码高亮基础样式 */
        .hljs { display: block; overflow-x: auto; padding: 0.5em; background: #f6f8fa; }
        .hljs-comment, .hljs-quote { color: #6a737d; }
        .hljs-keyword, .hljs-selector-tag { color: #d73a49; }
        .hljs-string, .hljs-attr { color: #032f62; }
        .hljs-number, .hljs-literal { color: #005cc5; }
        .hljs-function, .hljs-title { color: #6f42c1; }
        .hljs-built_in, .hljs-builtin-name { color: #005cc5; }
    </style>
</head>
<body>
${this.getExportHtmlContent()}
</body>
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
            console.error('HTML导出失败:', error);
            this.showToast('HTML导出失败: ' + error.message, 'error');
        }
    }
    
    // ==================== 批量导出功能 ====================
    
    /**
     * 批量导出所有 Markdown 文件
     * @param {string} format - 导出格式: 'pdf', 'word', 'html'
     */
    async batchExport(format) {
        // 检查是否有打开的文件夹
        if (this.fileHandles.size === 0) {
            this.showToast('请先打开一个包含 Markdown 文件的文件夹', 'warning');
            return;
        }
        
        // 获取格式名称
        const formatNames = {
            'pdf': 'PDF',
            'word': 'Word',
            'html': 'HTML'
        };
        const formatName = formatNames[format] || format.toUpperCase();
        
        try {
            // 让用户选择输出目录
            let outputDir;
            try {
                outputDir = await window.showDirectoryPicker({
                    mode: 'readwrite',
                    startIn: 'downloads'
                });
            } catch (e) {
                if (e.name === 'AbortError') {
                    // 用户取消了选择
                    return;
                }
                throw e;
            }
            
            const total = this.fileHandles.size;
            let processed = 0;
            let succeeded = 0;
            let failed = 0;
            const errors = [];
            
            this.showBatchExportProgress(`准备导出 ${total} 个文件为 ${formatName}...`, 0, total);
            
            // 遍历所有文件
            for (const [filePath, fileHandle] of this.fileHandles) {
                processed++;
                this.updateBatchExportProgress(`正在导出: ${filePath}`, processed, total);
                
                try {
                    // 读取文件内容
                    const file = await fileHandle.getFile();
                    const content = await this.decodeFileContent(file);
                    
                    // 渲染 Markdown 为 HTML
                    const htmlContent = this.renderMarkdownToHtml(content);
                    
                    // 生成输出文件名（保留目录结构，将路径分隔符替换为下划线）
                    const baseName = filePath.replace(/\.(md|markdown)$/i, '');
                    const safeFileName = baseName.replace(/[\/\\]/g, '_').replace(/[<>:"|?*]/g, '');
                    
                    // 根据格式生成文件
                    let outputContent;
                    let outputFileName;
                    
                    switch (format) {
                        case 'pdf':
                            // 使用 html2pdf.js 将 HTML 转换为真正的 PDF
                            outputFileName = `${safeFileName}.pdf`;
                            const fullPdfHtml = this.generatePdfReadyHtml(baseName, htmlContent, true);
                            outputContent = await this.convertHtmlToPdfBlob(fullPdfHtml, baseName);
                            break;
                        case 'word':
                            outputFileName = `${safeFileName}.doc`;
                            outputContent = '\ufeff' + this.generateWordHtml(baseName, htmlContent);
                            break;
                        case 'html':
                        default:
                            outputFileName = `${safeFileName}.html`;
                            outputContent = this.generateStandaloneHtml(baseName, htmlContent);
                            break;
                    }
                    
                    // 写入文件到输出目录
                    const outputFileHandle = await outputDir.getFileHandle(outputFileName, { create: true });
                    const writable = await outputFileHandle.createWritable();
                    
                    // PDF 输出是 Blob，其他格式是字符串
                    if (outputContent instanceof Blob) {
                        await writable.write(outputContent);
                    } else {
                        await writable.write(outputContent);
                    }
                    await writable.close();
                    
                    succeeded++;
                } catch (error) {
                    failed++;
                    errors.push({ file: filePath, error: error.message });
                    console.warn(`导出失败 ${filePath}:`, error);
                }
            }
            
            this.hideBatchExportProgress();
            
            // 显示结果
            if (failed === 0) {
                this.showToast(`批量导出完成: ${succeeded} 个文件已导出为 ${formatName}`, 'success');
            } else {
                this.showToast(`导出完成: 成功 ${succeeded} 个，失败 ${failed} 个`, 'warning');
                console.error('批量导出失败的文件:', errors);
            }
            
        } catch (error) {
            this.hideBatchExportProgress();
            console.error('批量导出失败:', error);
            this.showToast('批量导出失败: ' + error.message, 'error');
        }
    }
    
    /**
     * 显示批量导出进度
     */
    showBatchExportProgress(message, current, total) {
        let overlay = document.getElementById('batchExportOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'export-overlay';
            overlay.id = 'batchExportOverlay';
            overlay.innerHTML = `
                <div class="export-progress batch-export-progress">
                    <i class="fas fa-spinner"></i>
                    <p class="batch-message">${message}</p>
                    <div class="batch-progress-bar">
                        <div class="batch-progress-fill" style="width: 0%"></div>
                    </div>
                    <p class="batch-counter">0 / ${total}</p>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        this.updateBatchExportProgress(message, current, total);
    }
    
    /**
     * 更新批量导出进度
     */
    updateBatchExportProgress(message, current, total) {
        const overlay = document.getElementById('batchExportOverlay');
        if (!overlay) return;
        
        const messageEl = overlay.querySelector('.batch-message');
        const progressFill = overlay.querySelector('.batch-progress-fill');
        const counterEl = overlay.querySelector('.batch-counter');
        
        if (messageEl) messageEl.textContent = message;
        if (progressFill) progressFill.style.width = `${(current / total) * 100}%`;
        if (counterEl) counterEl.textContent = `${current} / ${total}`;
    }
    
    /**
     * 隐藏批量导出进度
     */
    hideBatchExportProgress() {
        const overlay = document.getElementById('batchExportOverlay');
        if (overlay) {
            overlay.remove();
        }
    }
    
    /**
     * 将 Markdown 内容渲染为 HTML
     * @param {string} markdownContent - Markdown 源文本
     * @returns {string} 渲染后的 HTML
     */
    renderMarkdownToHtml(markdownContent) {
        // 使用 marked 渲染
        return marked.parse(markdownContent);
    }
    
    /**
     * 生成独立的 HTML 文件内容
     */
    generateStandaloneHtml(title, bodyContent) {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        ${this.getExportStyles()}
        .mermaid { text-align: center; margin: 24px 0; }
        .mermaid svg { max-width: 100%; height: auto; }
        .plantuml { text-align: center; margin: 24px 0; }
        .plantuml img { max-width: 100%; height: auto; }
        .hljs { display: block; overflow-x: auto; padding: 0.5em; background: #f6f8fa; }
        .hljs-comment, .hljs-quote { color: #6a737d; }
        .hljs-keyword, .hljs-selector-tag { color: #d73a49; }
        .hljs-string, .hljs-attr { color: #032f62; }
        .hljs-number, .hljs-literal { color: #005cc5; }
        .hljs-function, .hljs-title { color: #6f42c1; }
    </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
    }
    
    /**
     * 生成适合打印为 PDF 的 HTML 文件
     * @param {string} title - 文档标题
     * @param {string} bodyContent - HTML 正文内容
     * @param {boolean} forBatch - 是否用于批量导出（不显示打印提示）
     */
    generatePdfReadyHtml(title, bodyContent, forBatch = false) {
        const printScript = forBatch ? '' : `
<script>
    // 提示用户打印
    alert('请使用浏览器的打印功能 (Ctrl+P) 将此文档保存为 PDF');
<\/script>`;

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        ${this.getExportStyles()}
        @media print {
            body { padding: 0; margin: 0; }
            pre, code { white-space: pre-wrap; word-wrap: break-word; }
        }
    </style>
</head>
<body>
${bodyContent}${printScript}
</body>
</html>`;
    }
    
    /**
     * 生成 Word 兼容的 HTML 文件
     */
    generateWordHtml(title, bodyContent) {
        return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <title>${this.escapeHtml(title)}</title>
    <!--[if gte mso 9]>
    <xml>
        <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
        </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        @page { size: A4; margin: 2cm; }
        body {
            font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
        }
        h1 { font-size: 22pt; font-weight: bold; margin: 24pt 0 12pt 0; border-bottom: 1pt solid #ccc; padding-bottom: 6pt; }
        h2 { font-size: 18pt; font-weight: bold; margin: 20pt 0 10pt 0; border-bottom: 1pt solid #eee; padding-bottom: 4pt; }
        h3 { font-size: 14pt; font-weight: bold; margin: 16pt 0 8pt 0; }
        h4 { font-size: 12pt; font-weight: bold; margin: 14pt 0 6pt 0; }
        p { margin: 0 0 12pt 0; }
        code {
            font-family: Consolas, "Courier New", monospace;
            font-size: 10pt;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
        }
        pre {
            font-family: Consolas, "Courier New", monospace;
            font-size: 10pt;
            background-color: #f5f5f5;
            padding: 12pt;
            border: 1pt solid #ddd;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        pre code { background: none; padding: 0; }
        blockquote {
            margin: 12pt 0;
            padding: 6pt 12pt;
            border-left: 4pt solid #ddd;
            color: #666;
        }
        table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
        th, td { border: 1pt solid #000; padding: 6pt 10pt; }
        th { background-color: #f0f0f0; font-weight: bold; }
        ul, ol { margin: 12pt 0; padding-left: 24pt; }
        li { margin: 4pt 0; }
        img { max-width: 100%; height: auto; }
        a { color: #0066cc; }
        hr { border: none; border-top: 1pt solid #ccc; margin: 18pt 0; }
    </style>
</head>
<body>
${bodyContent}
</body>
</html>`;
    }
    
    /**
     * 使用 html2pdf.js 将 HTML 内容转换为 PDF Blob
     * @param {string} htmlContent - 完整的 HTML 文档字符串
     * @param {string} title - 文档标题
     * @returns {Promise<Blob>} PDF 文件的 Blob 对象
     */
    async convertHtmlToPdfBlob(htmlContent, title) {
        // 创建临时容器用于渲染 HTML
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '210mm'; // A4 宽度
        container.innerHTML = htmlContent;
        document.body.appendChild(container);
        
        try {
            // 等待图片和样式加载
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const opt = {
                margin: [10, 10, 10, 10],
                filename: `${title}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    windowWidth: 794, // A4 width in px at 96dpi
                },
                jsPDF: {
                    unit: 'mm',
                    format: 'a4',
                    orientation: 'portrait'
                },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };
            
            const pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');
            return pdfBlob;
        } finally {
            // 清理临时容器
            if (container.parentNode) {
                document.body.removeChild(container);
            }
        }
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
        
        // 构建层级结构
        const tocTree = this.buildTocTree(headings);
        
        // 渲染目录树
        this.tocContent.innerHTML = '';
        this.renderTocTree(tocTree, this.tocContent);
        
        // 监听预览区域滚动，高亮当前位置的目录项
        this.setupTocScrollSpy();
    }
    
    // 构建目录树结构
    buildTocTree(headings) {
        const tree = [];
        const stack = [{ level: 0, children: tree }];
        
        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName.charAt(1));
            const text = heading.textContent;
            const id = heading.id || `heading-${index}`;
            
            // 确保标题有 id 用于跳转
            if (!heading.id) {
                heading.id = id;
            }
            
            const node = {
                level: level,
                text: text,
                id: id,
                children: []
            };
            
            // 找到父节点
            while (stack.length > 1 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }
            
            stack[stack.length - 1].children.push(node);
            stack.push(node);
        });
        
        return tree;
    }
    
    // 渲染目录树
    renderTocTree(nodes, container) {
        nodes.forEach(node => {
            const hasChildren = node.children && node.children.length > 0;
            
            const itemWrapper = document.createElement('div');
            itemWrapper.className = 'toc-item-wrapper';
            
            const itemRow = document.createElement('div');
            itemRow.className = 'toc-item-row';
            
            // 折叠按钮（仅当有子节点时显示）
            if (hasChildren) {
                const collapseBtn = document.createElement('span');
                collapseBtn.className = 'toc-collapse-btn';
                collapseBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                collapseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const childrenContainer = itemWrapper.querySelector('.toc-children');
                    const isCollapsed = childrenContainer.classList.contains('collapsed');
                    
                    if (isCollapsed) {
                        childrenContainer.classList.remove('collapsed');
                        collapseBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                    } else {
                        childrenContainer.classList.add('collapsed');
                        collapseBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
                    }
                });
                itemRow.appendChild(collapseBtn);
            } else {
                // 占位符保持对齐
                const placeholder = document.createElement('span');
                placeholder.className = 'toc-collapse-placeholder';
                itemRow.appendChild(placeholder);
            }
            
            // 目录链接
            const link = document.createElement('a');
            link.className = `toc-item toc-h${node.level}`;
            link.href = `#${node.id}`;
            link.dataset.target = node.id;
            link.title = node.text;
            link.textContent = node.text;
            
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetElement = document.getElementById(node.id);
                
                if (targetElement) {
                    // 记录导航历史
                    this.pushNavigationHistory('heading', {
                        headingId: node.id,
                        headingText: node.text,
                        headingLevel: node.level
                    });
                    
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    
                    // 高亮当前目录项
                    this.tocContent.querySelectorAll('.toc-item').forEach(i => i.classList.remove('active'));
                    link.classList.add('active');
                    
                    // 闪烁效果
                    targetElement.style.transition = 'background-color 0.3s';
                    targetElement.style.backgroundColor = 'rgba(74, 144, 217, 0.2)';
                    setTimeout(() => {
                        targetElement.style.backgroundColor = '';
                    }, 1000);
                    
                    // 分栏模式下同步编辑器位置
                    if (this.viewMode === 'split') {
                        this.scrollEditorToHeading(node.text, node.level);
                    }
                }
            });
            
            itemRow.appendChild(link);
            itemWrapper.appendChild(itemRow);
            
            // 子节点容器
            if (hasChildren) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'toc-children';
                this.renderTocTree(node.children, childrenContainer);
                itemWrapper.appendChild(childrenContainer);
            }
            
            container.appendChild(itemWrapper);
        });
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
        
        // 添加工具栏
        const toolbar = document.createElement('div');
        toolbar.className = 'search-results-toolbar';
        toolbar.innerHTML = `
            <button class="btn-small" id="expandAllResults" title="展开全部">
                <i class="fas fa-expand-alt"></i> 展开
            </button>
            <button class="btn-small" id="collapseAllResults" title="折叠全部">
                <i class="fas fa-compress-alt"></i> 折叠
            </button>
        `;
        this.globalSearchResults.appendChild(toolbar);
        
        // 绑定展开/折叠全部按钮
        toolbar.querySelector('#expandAllResults').addEventListener('click', () => {
            this.globalSearchResults.querySelectorAll('.search-result-matches').forEach(matchList => {
                matchList.classList.remove('collapsed');
            });
            this.globalSearchResults.querySelectorAll('.file-collapse-btn').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-chevron-down"></i>';
            });
        });
        
        toolbar.querySelector('#collapseAllResults').addEventListener('click', () => {
            this.globalSearchResults.querySelectorAll('.search-result-matches').forEach(matchList => {
                matchList.classList.add('collapsed');
            });
            this.globalSearchResults.querySelectorAll('.file-collapse-btn').forEach(btn => {
                btn.innerHTML = '<i class="fas fa-chevron-right"></i>';
            });
        });
        
        this.globalSearchResultsData.forEach(fileResult => {
            // 创建文件分组
            const fileGroup = document.createElement('div');
            fileGroup.className = 'search-result-file';
            
            // 文件标题（可折叠）
            const fileHeader = document.createElement('div');
            fileHeader.className = 'search-result-file-header';
            fileHeader.innerHTML = `
                <span class="file-collapse-btn"><i class="fas fa-chevron-down"></i></span>
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
                
                // 使用防抖机制，避免单击和双击重复触发
                let clickTimer = null;
                matchItem.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // 如果已经有等待的定时器，清除它（双击时会先触发两次click）
                    if (clickTimer) {
                        clearTimeout(clickTimer);
                    }
                    // 延迟执行，给双击事件机会取消
                    clickTimer = setTimeout(() => {
                        this.jumpToSearchResult(fileResult.filePath, fileResult.fileHandle, match.lineNumber, query);
                        clickTimer = null;
                    }, 200);
                });
                
                matchItem.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    // 取消单击的定时器
                    if (clickTimer) {
                        clearTimeout(clickTimer);
                        clickTimer = null;
                    }
                    // 立即执行跳转
                    this.jumpToSearchResult(fileResult.filePath, fileResult.fileHandle, match.lineNumber, query);
                });
                
                matchList.appendChild(matchItem);
            });
            
            fileGroup.appendChild(matchList);
            
            // 绑定文件标题的折叠事件
            const collapseBtn = fileHeader.querySelector('.file-collapse-btn');
            fileHeader.addEventListener('click', () => {
                const isCollapsed = matchList.classList.contains('collapsed');
                
                if (isCollapsed) {
                    matchList.classList.remove('collapsed');
                    collapseBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                } else {
                    matchList.classList.add('collapsed');
                    collapseBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
                }
            });
            
            this.globalSearchResults.appendChild(fileGroup);
        });
    }
    
    // 跳转到搜索结果
    async jumpToSearchResult(filePath, fileHandle, lineNumber, query) {
        try {
            // 记录导航历史
            const previewContainer = this.preview.parentElement;
            this.pushNavigationHistory('search', {
                scrollTop: previewContainer ? previewContainer.scrollTop : 0
            });
            
            // 加载文件
            const file = await fileHandle.getFile();
            const content = await this.decodeFileContent(file);
            
            // 更新编辑器和预览
            this.editor.value = content;
            this.currentFileHandle = fileHandle;
            this.currentContent = content;
            this.isModified = false;
            
            // 更新当前文件路径显示（关键修复）
            this.currentFileEl.textContent = filePath;
            
            // 更新文件树选中状态
            this.fileTree.querySelectorAll('.tree-item-content').forEach(el => {
                el.classList.remove('active');
            });
            const activeItem = this.fileTree.querySelector(`[data-path="${filePath}"] .tree-item-content`);
            if (activeItem) {
                activeItem.classList.add('active');
            }
            
            // 隐藏欢迎页面，显示内容
            this.welcomePage.style.display = 'none';
            this.setViewMode(this.viewMode);
            
            // 显示工具栏按钮
            const refreshBtn = document.getElementById('refreshFileBtn');
            if (refreshBtn) refreshBtn.style.display = '';
            const copyPathBtn = document.getElementById('copyPathBtn');
            if (copyPathBtn) copyPathBtn.style.display = '';
            
            // 保存上次打开的文件路径
            localStorage.setItem('md-viewer-last-file', filePath);
            
            // 更新预览
            this.updatePreview();
            
            // 更新导航按钮
            this.updateNavigationButtons();
            
            // 等待预览渲染完成后高亮并滚动
            setTimeout(() => {
                this.highlightAndScrollToLine(lineNumber, query);
            }, 150);
            
        } catch (error) {
            console.error('跳转到搜索结果失败:', error);
            this.showToast('跳转失败: ' + error.message, 'error');
        }
    }
    
    // 高亮并滚动到指定行
    highlightAndScrollToLine(lineNumber, query) {
        console.log(`[Search] 跳转到第 ${lineNumber} 行，搜索: "${query}", 视图模式: ${this.viewMode}`);
        
        // 确保预览容器可见
        if (this.previewContainer) {
            this.previewContainer.style.display = 'flex';
        }
        
        // 在编辑器中定位（分栏模式）
        if (this.viewMode === 'split' && this.editor) {
            const lines = this.editor.value.split('\n');
            let charCount = 0;
            for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
                charCount += lines[i].length + 1; // +1 for newline
            }
            
            this.editor.focus();
            this.editor.setSelectionRange(charCount, charCount + lines[lineNumber - 1].length);
            
            // 滚动编辑器
            const lineHeight = parseInt(getComputedStyle(this.editor).lineHeight) || 20;
            this.editor.scrollTop = Math.max(0, (lineNumber - 5) * lineHeight);
        }
        
        // 在预览中高亮匹配项并滚动（预览模式和分栏模式都需要）
        // 使用延时确保 DOM 已更新
        setTimeout(() => {
            this.highlightInPreview(query, lineNumber);
        }, 50);
    }
    
    // 在预览区域高亮匹配项
    highlightInPreview(query, targetLineNumber = null) {
        if (!query || !this.preview) {
            console.warn('[Search] 无效的查询或预览区域');
            return;
        }
        
        // 防止重复滚动 - 如果正在处理同一个查询和行号，跳过
        const cacheKey = `${query}_${targetLineNumber}`;
        if (this._lastHighlightKey === cacheKey && this._highlightInProgress) {
            console.log('[Search] 跳过重复的高亮请求');
            return;
        }
        this._lastHighlightKey = cacheKey;
        this._highlightInProgress = true;
        
        console.log(`[Search] 在预览区高亮: "${query}", 目标行: ${targetLineNumber}`);
        
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
        
        // 收集所有高亮项
        const allHighlights = this.preview.querySelectorAll('.search-highlight');
        console.log(`[Search] 共找到 ${allHighlights.length} 个匹配项`);
        
        // 如果有目标行号，先滚动到大致位置
        if (targetLineNumber && this.previewContainer) {
            // 基于行号估算滚动位置
            // 预览内容总高度 / 源文件总行数 ≈ 每行平均高度
            const sourceContent = this.editor ? this.editor.value : '';
            const totalLines = sourceContent.split('\n').length || 1;
            const scrollHeight = this.previewContainer.scrollHeight;
            const containerHeight = this.previewContainer.clientHeight;
            
            // 估算目标位置
            const estimatedPosition = (targetLineNumber / totalLines) * scrollHeight;
            const targetScrollTop = Math.max(0, estimatedPosition - containerHeight / 2);
            
            console.log(`[Search] 目标行: ${targetLineNumber}/${totalLines}, 估算位置: ${estimatedPosition}, scrollTop: ${targetScrollTop}`);
            
            // 先滚动到估算位置
            this.previewContainer.scrollTop = targetScrollTop;
        }
        
        // 找到最接近当前滚动位置的匹配项
        let targetMatch = null;
        if (allHighlights.length > 0) {
            if (targetLineNumber && allHighlights.length > 1) {
                // 有多个匹配项时，找到最接近当前滚动位置（视口中心）的那个
                const scrollContainer = this.previewContainer;
                const viewportCenter = scrollContainer.scrollTop + scrollContainer.clientHeight / 2;
                
                let minDistance = Infinity;
                allHighlights.forEach(highlight => {
                    // 计算元素的绝对位置
                    let offsetTop = 0;
                    let el = highlight;
                    while (el && el !== scrollContainer) {
                        offsetTop += el.offsetTop;
                        el = el.offsetParent;
                    }
                    
                    const distance = Math.abs(offsetTop - viewportCenter);
                    if (distance < minDistance) {
                        minDistance = distance;
                        targetMatch = highlight;
                    }
                });
                console.log(`[Search] 选择最接近视口中心的匹配项，距离: ${minDistance}`);
            } else {
                // 只有一个匹配项，或没有目标行号
                targetMatch = allHighlights[0];
            }
        }
        
        // 滚动到目标匹配项
        if (targetMatch) {
            console.log('[Search] 找到目标匹配项，准备精确滚动');
            targetMatch.classList.add('current');
            
            // 添加高亮闪烁效果
            targetMatch.style.transition = 'background-color 0.3s';
            targetMatch.style.backgroundColor = '#ffeb3b';
            
            // 使用 setTimeout 确保 DOM 更新完成，然后精确滚动
            setTimeout(() => {
                try {
                    const scrollContainer = this.previewContainer;
                    
                    if (scrollContainer && targetMatch) {
                        // 使用 getBoundingClientRect 计算相对位置 - 这是最可靠的方法
                        const matchRect = targetMatch.getBoundingClientRect();
                        const containerRect = scrollContainer.getBoundingClientRect();
                        
                        // 检查匹配项是否在视口中
                        const isInView = matchRect.top >= containerRect.top && 
                                         matchRect.bottom <= containerRect.bottom;
                        
                        console.log(`[Search] 匹配项位置: top=${matchRect.top}, 容器: top=${containerRect.top}, bottom=${containerRect.bottom}, 在视口中: ${isInView}`);
                        
                        if (!isInView) {
                            // 不在视口中，需要滚动
                            // 计算需要滚动的距离
                            const relativeTop = matchRect.top - containerRect.top;
                            const scrollAdjustment = relativeTop - scrollContainer.clientHeight / 2 + matchRect.height / 2;
                            
                            console.log(`[Search] 需要滚动调整: ${scrollAdjustment}`);
                            scrollContainer.scrollTop += scrollAdjustment;
                        }
                        
                        console.log(`[Search] 最终 scrollTop: ${scrollContainer.scrollTop}`);
                    }
                } catch (e) {
                    console.error('[Search] 滚动失败:', e);
                }
                
                // 滚动完成，重置标志
                this._highlightInProgress = false;
                
                // 2秒后恢复正常高亮样式
                setTimeout(() => {
                    if (targetMatch) {
                        targetMatch.style.backgroundColor = '';
                    }
                }, 2000);
            }, 100);
        } else {
            console.log('[Search] 未找到匹配项');
            this._highlightInProgress = false;
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
        this.currentZoomScale = Math.max(0.5, Math.min(10, this.currentZoomScale + delta));
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
