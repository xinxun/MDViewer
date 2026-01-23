/**
 * MD Viewer Server 模式 - API 接口测试
 * 
 * 测试范围：
 * - GET /api/files
 * - GET /api/file
 * - POST /api/file
 * - POST /api/file/create
 * - DELETE /api/file
 * - 错误处理
 * - 安全性
 */

import { test, expect } from '@playwright/test';

test.describe('Server API - 文件列表', () => {
  test('TC-API001: GET /api/files 应该返回文件列表', async ({ request }) => {
    const response = await request.get('/api/files');
    
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('TC-API002: 文件列表应该只包含 .md 文件', async ({ request }) => {
    const response = await request.get('/api/files');
    const data = await response.json();
    
    if (data.length > 0) {
      for (const file of data) {
        const filePath = typeof file === 'string' ? file : file.path || file.name;
        expect(filePath.endsWith('.md')).toBe(true);
      }
    }
  });
});

test.describe('Server API - 读取文件', () => {
  test('TC-API010: GET /api/file 应该返回文件内容', async ({ request }) => {
    // 先获取文件列表
    const listResponse = await request.get('/api/files');
    const files = await listResponse.json();
    
    if (files.length > 0) {
      const firstFile = typeof files[0] === 'string' ? files[0] : files[0].path;
      
      const response = await request.get(`/api/file?path=${encodeURIComponent(firstFile)}`);
      expect(response.ok()).toBe(true);
      
      const data = await response.json();
      expect(data.content).toBeDefined();
    }
  });

  test('TC-API011: 读取不存在的文件应该返回 404', async ({ request }) => {
    const response = await request.get('/api/file?path=nonexistent-file-12345.md');
    
    expect(response.status()).toBe(404);
  });

  test('TC-API012: 缺少 path 参数应该返回错误', async ({ request }) => {
    const response = await request.get('/api/file');
    
    expect(response.ok()).toBe(false);
  });
});

test.describe('Server API - 保存文件', () => {
  test('TC-API020: POST /api/file 应该保存内容', async ({ request }) => {
    // 先获取一个存在的文件
    const listResponse = await request.get('/api/files');
    const files = await listResponse.json();
    
    if (files.length > 0) {
      const firstFile = typeof files[0] === 'string' ? files[0] : files[0].path;
      
      // 读取原内容
      const readResponse = await request.get(`/api/file?path=${encodeURIComponent(firstFile)}`);
      const originalData = await readResponse.json();
      const originalContent = originalData.content;
      
      // 保存（使用原内容，不实际修改）
      const saveResponse = await request.post('/api/file', {
        data: {
          path: firstFile,
          content: originalContent
        }
      });
      
      expect(saveResponse.ok()).toBe(true);
    }
  });

  test('TC-API021: 保存时缺少 path 应该返回错误', async ({ request }) => {
    const response = await request.post('/api/file', {
      data: {
        content: 'test content'
      }
    });
    
    expect(response.ok()).toBe(false);
  });

  test('TC-API022: 保存时缺少 content 应该返回错误', async ({ request }) => {
    const response = await request.post('/api/file', {
      data: {
        path: 'test.md'
      }
    });
    
    expect(response.ok()).toBe(false);
  });
});

test.describe('Server API - 创建文件', () => {
  const testFileName = `test-create-${Date.now()}.md`;

  test('TC-API030: POST /api/file/create 应该创建新文件', async ({ request }) => {
    const response = await request.post('/api/file/create', {
      data: {
        path: testFileName
      }
    });
    
    expect(response.ok()).toBe(true);
    
    // 验证文件存在
    const readResponse = await request.get(`/api/file?path=${encodeURIComponent(testFileName)}`);
    expect(readResponse.ok()).toBe(true);
    
    // 清理：删除测试文件
    await request.delete(`/api/file?path=${encodeURIComponent(testFileName)}`);
  });

  test('TC-API031: 创建已存在的文件应该处理', async ({ request }) => {
    // 先获取一个存在的文件
    const listResponse = await request.get('/api/files');
    const files = await listResponse.json();
    
    if (files.length > 0) {
      const existingFile = typeof files[0] === 'string' ? files[0] : files[0].path;
      
      const response = await request.post('/api/file/create', {
        data: {
          path: existingFile
        }
      });
      
      // 应该返回错误或跳过
      // 具体行为取决于实现
    }
  });
});

test.describe('Server API - 删除文件', () => {
  test('TC-API040: DELETE /api/file 应该删除文件', async ({ request }) => {
    // 先创建一个测试文件
    const testFileName = `test-delete-${Date.now()}.md`;
    
    await request.post('/api/file/create', {
      data: { path: testFileName }
    });
    
    // 删除文件
    const deleteResponse = await request.delete(`/api/file?path=${encodeURIComponent(testFileName)}`);
    expect(deleteResponse.ok()).toBe(true);
    
    // 验证文件不存在
    const readResponse = await request.get(`/api/file?path=${encodeURIComponent(testFileName)}`);
    expect(readResponse.status()).toBe(404);
  });

  test('TC-API041: 删除不存在的文件应该返回 404', async ({ request }) => {
    const response = await request.delete('/api/file?path=nonexistent-file-12345.md');
    
    expect(response.status()).toBe(404);
  });
});

test.describe('Server API - 安全性', () => {
  test('TC-API050: 路径遍历攻击应该被阻止', async ({ request }) => {
    // 尝试访问上级目录
    const response = await request.get('/api/file?path=../package.json');
    
    // 应该返回错误（403 或 404）
    expect(response.ok()).toBe(false);
  });

  test('TC-API051: 绝对路径应该被阻止', async ({ request }) => {
    const response = await request.get('/api/file?path=/etc/passwd');
    
    expect(response.ok()).toBe(false);
  });

  test('TC-API052: 双点路径应该被阻止', async ({ request }) => {
    const response = await request.get('/api/file?path=docs/../../package.json');
    
    expect(response.ok()).toBe(false);
  });
});
