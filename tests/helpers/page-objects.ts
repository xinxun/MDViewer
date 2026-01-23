/**
 * MD Viewer 自动化测试 - 通用工具和页面对象
 * 
 * 提供页面对象模式封装，简化测试代码编写
 */

import { Page, Locator, expect } from '@playwright/test';

/**
 * Standalone 模式页面对象
 */
export class StandalonePage {
  readonly page: Page;
  
  // 侧边栏元素
  readonly sidebar: Locator;
  readonly openFolderBtn: Locator;
  readonly refreshBtn: Locator;
  readonly expandAllBtn: Locator;
  readonly collapseAllBtn: Locator;
  readonly fileTree: Locator;
  readonly fileSearchInput: Locator;
  readonly recentFoldersList: Locator;
  
  // 工具栏元素
  readonly toolbar: Locator;
  readonly viewModeBtn: Locator;
  readonly splitModeBtn: Locator;
  readonly saveBtn: Locator;
  readonly searchBtn: Locator;
  readonly tocBtn: Locator;
  readonly themeBtn: Locator;
  readonly encodingSelect: Locator;
  
  // 内容区域
  readonly editor: Locator;
  readonly preview: Locator;
  readonly resizer: Locator;
  readonly welcomePage: Locator;
  
  // TOC 面板
  readonly tocPanel: Locator;
  readonly tocCloseBtn: Locator;
  
  // 搜索面板
  readonly searchPanel: Locator;
  readonly searchInput: Locator;
  readonly searchResults: Locator;
  
  // 图表缩放模态框
  readonly zoomModal: Locator;
  readonly zoomCloseBtn: Locator;
  readonly zoomInBtn: Locator;
  readonly zoomOutBtn: Locator;
  readonly zoomResetBtn: Locator;
  readonly zoomContent: Locator;
  
  // Toast 通知
  readonly toastContainer: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // 侧边栏 - 使用真实的 ID 选择器
    this.sidebar = page.locator('#sidebar, .sidebar');
    this.openFolderBtn = page.locator('#openFolderBtn');
    this.refreshBtn = page.locator('#refreshBtn');
    this.expandAllBtn = page.locator('#expandAllBtn');
    this.collapseAllBtn = page.locator('#collapseAllBtn');
    this.fileTree = page.locator('#fileTree');
    this.fileSearchInput = page.locator('#searchInput');
    this.recentFoldersList = page.locator('#recentFoldersList');
    
    // 工具栏 - 使用真实的 ID 选择器
    this.toolbar = page.locator('.toolbar');
    this.viewModeBtn = page.locator('#viewBtn');
    this.splitModeBtn = page.locator('#splitBtn');
    this.saveBtn = page.locator('#saveBtn');
    this.searchBtn = page.locator('#searchToggle');
    this.tocBtn = page.locator('#tocToggle');
    this.themeBtn = page.locator('#themeToggle');
    this.encodingSelect = page.locator('#encodingSelect');
    
    // 内容区域 - 使用真实的 ID 选择器
    this.editor = page.locator('#editor');
    this.preview = page.locator('#preview');
    this.resizer = page.locator('#splitResizer');
    this.welcomePage = page.locator('#welcomePage');
    
    // TOC - 使用真实的 ID 选择器
    this.tocPanel = page.locator('#tocPanel');
    this.tocCloseBtn = page.locator('#tocClose');
    
    // 搜索 - 使用真实的 ID 选择器
    this.searchPanel = page.locator('#globalSearchPanel');
    this.searchInput = page.locator('#globalSearchInput');
    this.searchResults = page.locator('#globalSearchResults');
    
    // 缩放 - 使用真实的 ID 选择器
    this.zoomModal = page.locator('#diagramZoomModal');
    this.zoomCloseBtn = page.locator('#zoomClose');
    this.zoomInBtn = page.locator('#zoomIn');
    this.zoomOutBtn = page.locator('#zoomOut');
    this.zoomResetBtn = page.locator('#zoomReset');
    this.zoomContent = page.locator('#zoomContent');
    
    // Toast
    this.toastContainer = page.locator('#toastContainer');
  }

  /**
   * 打开 standalone.html 页面
   */
  async goto() {
    await this.page.goto('/standalone.html');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * 检查浏览器是否支持 File System Access API
   */
  async checkFileSystemAPISupport(): Promise<boolean> {
    return await this.page.evaluate(() => {
      return 'showDirectoryPicker' in window;
    });
  }

  /**
   * 获取当前主题
   */
  async getCurrentTheme(): Promise<string> {
    return await this.page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || 'light';
    });
  }

  /**
   * 切换主题
   */
  async toggleTheme() {
    await this.themeBtn.click();
  }

  /**
   * 切换到查看模式
   */
  async switchToViewMode() {
    await this.viewModeBtn.click();
  }

  /**
   * 切换到分屏模式
   */
  async switchToSplitMode() {
    await this.splitModeBtn.click();
  }

  /**
   * 打开搜索面板
   */
  async openSearch() {
    await this.searchBtn.click();
    await expect(this.searchPanel).toBeVisible();
  }

  /**
   * 打开 TOC 面板
   */
  async openTOC() {
    await this.tocBtn.click();
    await expect(this.tocPanel).toBeVisible();
  }

  /**
   * 在编辑器中输入内容
   */
  async typeInEditor(content: string) {
    await this.editor.click();
    await this.editor.fill(content);
  }

  /**
   * 获取预览区域的 HTML 内容
   */
  async getPreviewHTML(): Promise<string> {
    return await this.preview.innerHTML();
  }

  /**
   * 等待 Mermaid 图表渲染完成
   */
  async waitForMermaidRender() {
    await this.page.waitForSelector('.mermaid svg', { timeout: 10000 });
  }

  /**
   * 双击 Mermaid 图表打开缩放
   */
  async doubleClickMermaidDiagram() {
    const diagram = this.page.locator('.mermaid').first();
    await diagram.dblclick();
    await expect(this.zoomModal).toBeVisible();
  }

  /**
   * 关闭缩放模态框
   */
  async closeZoomModal() {
    await this.zoomCloseBtn.click();
    await expect(this.zoomModal).not.toBeVisible();
  }

  /**
   * 检查是否显示不支持警告
   */
  async hasUnsupportedBrowserWarning(): Promise<boolean> {
    const warning = this.page.locator('.browser-warning, .unsupported-warning');
    return await warning.isVisible();
  }

  /**
   * 在文件树中点击文件
   */
  async clickFileInTree(fileName: string) {
    await this.fileTree.locator(`text=${fileName}`).click();
  }

  /**
   * 搜索文件
   */
  async searchFiles(query: string) {
    await this.fileSearchInput.fill(query);
  }

  /**
   * 执行全局搜索
   */
  async globalSearch(query: string) {
    await this.openSearch();
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  /**
   * 获取 Toast 消息内容
   */
  async getToastMessage(): Promise<string> {
    const toast = this.toastContainer.locator('.toast').first();
    return await toast.textContent() || '';
  }
}

/**
 * Server 模式页面对象
 */
export class ServerPage {
  readonly page: Page;
  
  // 侧边栏
  readonly sidebar: Locator;
  readonly fileTree: Locator;
  readonly newFileBtn: Locator;
  readonly refreshBtn: Locator;
  
  // 工具栏
  readonly toolbar: Locator;
  readonly viewModeBtn: Locator;
  readonly editModeBtn: Locator;
  readonly splitModeBtn: Locator;
  readonly saveBtn: Locator;
  readonly deleteBtn: Locator;
  readonly themeBtn: Locator;
  
  // 内容区域
  readonly editor: Locator;
  readonly preview: Locator;
  
  // 模态框
  readonly newFileModal: Locator;
  readonly newFileInput: Locator;
  readonly createFileBtn: Locator;
  readonly cancelBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    
    // 侧边栏
    this.sidebar = page.locator('.sidebar');
    this.fileTree = page.locator('.file-tree, #fileTree');
    this.newFileBtn = page.locator('#newFileBtn, .new-file-btn');
    this.refreshBtn = page.locator('#refreshBtn, .refresh-btn');
    
    // 工具栏
    this.toolbar = page.locator('.toolbar');
    this.viewModeBtn = page.locator('[data-mode="view"]');
    this.editModeBtn = page.locator('[data-mode="edit"]');
    this.splitModeBtn = page.locator('[data-mode="split"]');
    this.saveBtn = page.locator('#saveBtn, .save-btn');
    this.deleteBtn = page.locator('#deleteBtn, .delete-btn');
    this.themeBtn = page.locator('#themeBtn, .theme-btn');
    
    // 内容区域
    this.editor = page.locator('.editor, #editor');
    this.preview = page.locator('.preview, #preview');
    
    // 新建文件模态框
    this.newFileModal = page.locator('.new-file-modal, #newFileModal');
    this.newFileInput = page.locator('#newFileName');
    this.createFileBtn = page.locator('#createFileBtn');
    this.cancelBtn = page.locator('.cancel-btn, #cancelBtn');
  }

  /**
   * 打开 Server 模式首页
   */
  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * 等待文件列表加载
   */
  async waitForFileList() {
    await this.page.waitForSelector('.file-tree .file-item, .file-tree li');
  }

  /**
   * 点击文件
   */
  async clickFile(fileName: string) {
    await this.fileTree.locator(`text=${fileName}`).click();
  }

  /**
   * 创建新文件
   */
  async createNewFile(fileName: string) {
    await this.newFileBtn.click();
    await this.newFileInput.fill(fileName);
    await this.createFileBtn.click();
  }

  /**
   * 保存当前文件
   */
  async saveFile() {
    await this.saveBtn.click();
  }

  /**
   * 删除当前文件
   */
  async deleteFile() {
    this.page.on('dialog', dialog => dialog.accept());
    await this.deleteBtn.click();
  }

  /**
   * 切换主题
   */
  async toggleTheme() {
    await this.themeBtn.click();
  }

  /**
   * 在编辑器中输入
   */
  async typeInEditor(content: string) {
    await this.editor.fill(content);
  }

  /**
   * 获取预览内容
   */
  async getPreviewHTML(): Promise<string> {
    return await this.preview.innerHTML();
  }
}

/**
 * API 测试辅助类
 */
export class APIHelper {
  readonly baseURL: string;

  constructor(baseURL: string = 'http://localhost:3000') {
    this.baseURL = baseURL;
  }

  /**
   * 获取文件列表
   */
  async getFiles(page: Page): Promise<any> {
    const response = await page.request.get(`${this.baseURL}/api/files`);
    return await response.json();
  }

  /**
   * 读取文件内容
   */
  async getFile(page: Page, filePath: string): Promise<string> {
    const response = await page.request.get(`${this.baseURL}/api/file?path=${encodeURIComponent(filePath)}`);
    const data = await response.json();
    return data.content;
  }

  /**
   * 保存文件
   */
  async saveFile(page: Page, filePath: string, content: string): Promise<boolean> {
    const response = await page.request.post(`${this.baseURL}/api/file`, {
      data: { path: filePath, content }
    });
    return response.ok();
  }

  /**
   * 创建新文件
   */
  async createFile(page: Page, filePath: string): Promise<boolean> {
    const response = await page.request.post(`${this.baseURL}/api/file/create`, {
      data: { path: filePath }
    });
    return response.ok();
  }

  /**
   * 删除文件
   */
  async deleteFile(page: Page, filePath: string): Promise<boolean> {
    const response = await page.request.delete(`${this.baseURL}/api/file?path=${encodeURIComponent(filePath)}`);
    return response.ok();
  }
}
