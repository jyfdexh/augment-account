# GitHub Pages CORS 解决方案部署指南

## 📋 概述

本指南提供了在 GitHub Pages 上部署 `augment-manager.html` 并解决跨域问题的完整解决方案。

## 🗂️ 文件结构

```
your-repo/
├── augment-manager.html          # 主应用（已优化）
├── cors-proxy-config.js          # 代理配置文件
├── cors-proxy-sw.js              # Service Worker 代理
├── cors-test.html                # 代理测试工具
└── CORS-DEPLOYMENT-GUIDE.md      # 本文档
```

## 🚀 部署步骤

### 1. 上传文件到 GitHub 仓库

将所有文件上传到你的 GitHub 仓库的根目录或 `docs` 文件夹。

### 2. 启用 GitHub Pages

1. 进入仓库设置 (Settings)
2. 滚动到 "Pages" 部分
3. 选择源分支 (通常是 `main` 或 `master`)
4. 选择文件夹 (根目录 `/` 或 `/docs`)
5. 点击 "Save"

### 3. 访问测试页面

部署完成后，访问以下URL进行测试：

- **主应用**: `https://yourusername.github.io/yourrepo/augment-manager.html`
- **代理测试**: `https://yourusername.github.io/yourrepo/cors-test.html`

## 🔧 CORS 解决方案

### 方案 1: 智能代理系统（推荐）

系统会自动检测可用的代理服务：

1. **AllOrigins** - 最可靠的免费代理
2. **CorsProxy.io** - 备用代理服务
3. **ThingProxy** - 第三备用选项

默认行为：
- GET 请求优先通过公共 CORS 代理，失败时回退直连。
- 非 GET 请求（如 POST）先直连，失败时回退到代理（根据代理能力可能受限）。

### 方案 2: Service Worker 代理

如果浏览器支持，会自动注册 Service Worker 来处理代理请求。

提示：生产环境建议自建代理以提升稳定性与安全性。

## 🧪 测试流程

### 使用代理测试工具

1. 访问 `cors-test.html`
2. 点击 "测试所有代理" 检查可用性
3. 使用 "智能代理" 测试最佳代理
4. 查看日志了解详细信息

### 主应用测试

1. 访问 `augment-manager.html`
2. 系统会自动检测 CORS 状态
3. 如果检测到跨域问题，会显示解决方案
4. 点击 "尝试代理" 启用代理模式

## ⚙️ 配置选项

### 修改代理服务器

编辑 `cors-proxy-config.js` 中的 `proxies` 数组：

```javascript
proxies: [
    {
        name: '自定义代理',
        url: 'https://your-proxy.com/api?url=',
        type: 'simple',
        reliable: true,
        rateLimit: '1000/hour'
    }
]
```

### 调整检测参数

修改 `detection` 配置：

```javascript
detection: {
    timeout: 5000,        // 检测超时时间
    testUrl: 'https://httpbin.org/json',  // 测试URL
    maxRetries: 3,        // 最大重试次数
    retryDelay: 1000      // 重试延迟
}
```

## 🛠️ 故障排除

### 问题 1: 所有代理都不可用

**解决方案:**
1. 检查网络连接
2. 尝试使用浏览器扩展 (如 CORS Unblock)
3. 使用 `cors-test.html` 选择可用代理或调整 `cors-proxy-config.js`

### 问题 2: Service Worker 注册失败

**解决方案:**
1. 确保使用 HTTPS (GitHub Pages 默认支持)
2. 检查浏览器控制台错误信息
3. 清除浏览器缓存后重试

### 问题 3: 代理响应慢

**解决方案:**
1. 使用代理测试工具找到最快的代理
2. 修改 `cors-proxy-config.js` 调整代理优先级
3. 增加超时时间设置

## 📊 性能优化

### 缓存策略

系统会自动缓存可用的代理配置 5 分钟，减少重复检测。

### 并发检测

代理检测使用并发方式，提高检测速度。

### 智能切换

当当前代理失败时，自动切换到下一个可用代理。

## 🔒 安全考虑

### 代理服务风险

- 使用第三方代理服务时，请求会经过第三方服务器
- 不要通过代理发送敏感信息
- 建议在生产环境中使用自建代理服务

### 推荐的自建代理

如果需要更高的安全性，可以部署自己的代理服务：

1. **Vercel/Netlify Functions**
2. **Cloudflare Workers**
3. **AWS Lambda**

## 📞 支持

如果遇到问题：

1. 查看浏览器控制台错误信息
2. 使用 `cors-test.html` 进行诊断
3. 检查 GitHub Pages 部署状态
4. 确认所有文件都已正确上传

## 🔄 更新日志

- **v1.0**: 初始版本，支持基本代理功能
- **v1.1**: 添加智能代理管理器
- **v1.2**: 增加 Service Worker 支持
- **v1.3**: 优化缓存和性能
- **v1.4**: 移除测试模式，默认代理优先；更新 UI 与文档
