const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;

// 从命令行参数获取目录，默认为当前目录下的 docs 文件夹
const targetDir = process.argv[2] || path.join(__dirname, 'docs');

// MIME 类型
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// 递归获取所有 Markdown 文件
function getMarkdownFiles(dir, relativePath = '') {
    const items = [];
    
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        return items;
    }
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
            const children = getMarkdownFiles(fullPath, relPath);
            if (children.length > 0) {
                items.push({
                    name: entry.name,
                    type: 'folder',
                    path: relPath,
                    children: children
                });
            }
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.markdown')) {
            items.push({
                name: entry.name,
                type: 'file',
                path: relPath
            });
        }
    }
    
    // 排序：文件夹在前，文件在后，按名称排序
    items.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });
    
    return items;
}

// 解析请求体
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

// 发送 JSON 响应
function sendJson(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
}

// 静态文件服务
function serveStatic(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mimeType + '; charset=utf-8' });
        res.end(data);
    });
}

// 创建服务器
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;
    
    // API 路由
    if (pathname === '/api/files' && req.method === 'GET') {
        // 获取文件列表
        try {
            const files = getMarkdownFiles(targetDir);
            sendJson(res, { success: true, files, basePath: targetDir });
        } catch (error) {
            sendJson(res, { success: false, error: error.message });
        }
        return;
    }
    
    if (pathname === '/api/file' && req.method === 'GET') {
        // 读取文件
        try {
            const filePath = query.path;
            const fullPath = path.join(targetDir, filePath);
            
            if (!fullPath.startsWith(targetDir)) {
                sendJson(res, { success: false, error: '无效的文件路径' });
                return;
            }
            
            if (!fs.existsSync(fullPath)) {
                sendJson(res, { success: false, error: '文件不存在' });
                return;
            }
            
            const content = fs.readFileSync(fullPath, 'utf-8');
            sendJson(res, { success: true, content, path: filePath });
        } catch (error) {
            sendJson(res, { success: false, error: error.message });
        }
        return;
    }
    
    if (pathname === '/api/file' && req.method === 'POST') {
        // 保存文件
        try {
            const body = await parseBody(req);
            const { path: filePath, content } = body;
            const fullPath = path.join(targetDir, filePath);
            
            if (!fullPath.startsWith(targetDir)) {
                sendJson(res, { success: false, error: '无效的文件路径' });
                return;
            }
            
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(fullPath, content, 'utf-8');
            sendJson(res, { success: true, message: '保存成功' });
        } catch (error) {
            sendJson(res, { success: false, error: error.message });
        }
        return;
    }
    
    if (pathname === '/api/file/create' && req.method === 'POST') {
        // 创建新文件
        try {
            const body = await parseBody(req);
            let { path: filePath } = body;
            let fullPath = path.join(targetDir, filePath);
            
            if (!fullPath.endsWith('.md') && !fullPath.endsWith('.markdown')) {
                fullPath += '.md';
            }
            
            if (!fullPath.startsWith(targetDir)) {
                sendJson(res, { success: false, error: '无效的文件路径' });
                return;
            }
            
            if (fs.existsSync(fullPath)) {
                sendJson(res, { success: false, error: '文件已存在' });
                return;
            }
            
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(fullPath, '# 新文档\n\n开始编写你的内容...\n', 'utf-8');
            sendJson(res, { success: true, path: path.relative(targetDir, fullPath) });
        } catch (error) {
            sendJson(res, { success: false, error: error.message });
        }
        return;
    }
    
    if (pathname === '/api/file' && req.method === 'DELETE') {
        // 删除文件
        try {
            const filePath = query.path;
            const fullPath = path.join(targetDir, filePath);
            
            if (!fullPath.startsWith(targetDir)) {
                sendJson(res, { success: false, error: '无效的文件路径' });
                return;
            }
            
            if (!fs.existsSync(fullPath)) {
                sendJson(res, { success: false, error: '文件不存在' });
                return;
            }
            
            fs.unlinkSync(fullPath);
            sendJson(res, { success: true, message: '删除成功' });
        } catch (error) {
            sendJson(res, { success: false, error: error.message });
        }
        return;
    }
    
    // 提供目标目录中的原始文件（图片等）
    if (pathname.startsWith('/api/file/raw') && req.method === 'GET') {
        try {
            const filePath = query.path;
            const fullPath = path.join(targetDir, filePath);
            
            if (!fullPath.startsWith(targetDir)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }
            
            if (!fs.existsSync(fullPath)) {
                res.writeHead(404);
                res.end('Not Found');
                return;
            }
            
            serveStatic(res, fullPath);
        } catch (error) {
            res.writeHead(500);
            res.end('Internal Server Error');
        }
        return;
    }
    
    // 静态文件服务
    let staticPath = pathname === '/' ? '/index.html' : pathname;
    
    // 优先检查根目录的 standalone.html
    if (pathname === '/standalone.html') {
        const standaloneFile = path.join(__dirname, 'standalone.html');
        if (fs.existsSync(standaloneFile)) {
            serveStatic(res, standaloneFile);
            return;
        }
    }
    
    const filePath = path.join(__dirname, 'public', staticPath);
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        serveStatic(res, filePath);
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 MD Viewer 已启动!`);
    console.log(`📂 监视目录: ${targetDir}`);
    console.log(`🌐 访问地址: http://localhost:${PORT}`);
    console.log(`\n按 Ctrl+C 停止服务器\n`);
});
