/**
 * CORS 代理配置文件
 * 用于 GitHub Pages 等静态部署环境的跨域解决方案
 */

window.CORSProxyConfig = {
    // 公共代理服务列表（按可靠性排序）
    proxies: [
        {
            name: 'nanno',
            url: 'https://cors-proxy.jyf.workers.dev/proxy?url=',
            type: 'simple',
            reliable: true,
            rateLimit: '1000/hour',
            // Workers 代理，支持完整的 CORS 功能
            supportsMethods: ['GET', 'POST'],
            supportsHeaders: true
        },
        {
            name: 'CorsProxy.io',
            url: 'https://corsproxy.io/?',
            type: 'simple',
            reliable: true,
            rateLimit: '200/hour',
            // 支持 GET，部分情况下可转发头部
            supportsMethods: ['GET'],
            supportsHeaders: true
        },
        {
            name: 'AllOrigins',
            url: 'https://api.allorigins.win/raw?url=',
            type: 'simple',
            reliable: true,
            rateLimit: '1000/hour',
            // AllOrigins 原生不转发自定义头，且不处理复杂预检
            supportsMethods: ['GET'],
            supportsHeaders: false
        },
        {
            name: 'Proxy CORS',
            url: 'https://proxy-cors.vercel.app/api/proxy?url=',
            type: 'simple',
            reliable: false,
            rateLimit: '100/hour',
            // 自建/函数型代理，通常支持转发头部与POST
            supportsMethods: ['GET', 'POST'],
            supportsHeaders: true
        },
        {
            name: 'CORS Anywhere (Heroku)',
            url: 'https://cors-anywhere.herokuapp.com/',
            type: 'simple',
            reliable: false,
            rateLimit: '50/hour',
            note: '需要先访问激活',
            supportsMethods: ['GET', 'POST'],
            supportsHeaders: true
        },
        {
            name: 'ThingProxy',
            url: 'https://thingproxy.freeboard.io/fetch/',
            type: 'simple',
            reliable: false,
            rateLimit: '100/hour',
            // 仅GET，且不保证转发授权头
            supportsMethods: ['GET'],
            supportsHeaders: false
        }
    ],

    // 备用代理服务（自建或第三方）
    backupProxies: [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://yacdn.org/proxy/',
        'https://cors-proxy.htmldriven.com/?url='
    ],

    // 代理检测配置
    detection: {
        timeout: 5000,
        testUrl: 'https://httpbin.org/json',
        maxRetries: 3,
        retryDelay: 1000
    },

    // 缓存配置
    cache: {
        enabled: true,
        duration: 5 * 60 * 1000, // 5分钟
        key: 'cors_proxy_cache'
    }
};

// —— 默认代理快照与用户自定义加载 ——
try {
    window.CORSProxyConfig._defaults = JSON.parse(JSON.stringify(window.CORSProxyConfig.proxies));
} catch (e) {
    window.CORSProxyConfig._defaults = [];
}

(function loadUserProxies() {
    try {
        const saved = localStorage.getItem('cors_proxy_user_list');
        if (saved) {
            const arr = JSON.parse(saved);
            if (Array.isArray(arr) && arr.length) {
                window.CORSProxyConfig.proxies = arr;
            }
        }
    } catch (e) {
        console.log('加载自定义代理列表失败:', e?.message || e);
    }
})();

/**
 * 智能代理管理器
 */
window.SmartCORSProxy = {
    currentProxy: null,
    workingProxies: [],
    failedProxies: new Set(),

    /**
     * 初始化代理检测
     */
    async init() {
        console.log('🔍 开始检测可用的CORS代理...');
        
        // 从缓存加载上次成功的代理
        this.loadFromCache();
        
        // 并发检测所有代理
        await this.detectWorkingProxies();
        
        // 保存到缓存
        this.saveToCache();
        
        console.log(`✅ 检测完成，找到 ${this.workingProxies.length} 个可用代理`);
        return this.workingProxies.length > 0;
    },

    /**
     * 检测可用代理
     */
    async detectWorkingProxies() {
        const { proxies } = window.CORSProxyConfig;
        const { testUrl, timeout } = window.CORSProxyConfig.detection;

        const promises = proxies.map(async (proxy) => {
            if (this.failedProxies.has(proxy.url)) return null;

            try {
                const proxyUrl = this.buildProxiedUrl(proxy, testUrl);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const response = await fetch(proxyUrl, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                clearTimeout(timeoutId);

                // 2xx/3xx/4xx 都视为“到达上游”
                if (response.status >= 200 && response.status < 500) {
                    console.log(`✅ 代理可用: ${proxy.name}`);
                    return proxy;
                } else {
                    console.log(`❌ 代理不可用: ${proxy.name} (${response.status})`);
                    return null;
                }
            } catch (error) {
                console.log(`❌ 代理检测失败: ${proxy.name} - ${error.message}`);
                this.failedProxies.add(proxy.url);
                return null;
            }
        });

        const results = await Promise.all(promises);
        this.workingProxies = results.filter(proxy => proxy !== null);
        
        // 设置当前代理为最可靠的
        if (this.workingProxies.length > 0) {
            this.currentProxy = this.workingProxies.find(p => p.reliable) || this.workingProxies[0];
        }
    },

    /**
     * 使用代理发送请求
     */
    async fetch(url, options = {}) {
        if (!this.currentProxy) {
            throw new Error('没有可用的CORS代理');
        }

        const method = (options.method || 'GET').toUpperCase();
        const headers = options.headers || {};
        const hasAuth = !!(headers['Authorization'] || headers['authorization']);

        // 基于请求能力匹配候选代理
        const supports = (p) => {
            const mOk = Array.isArray(p.supportsMethods) ? p.supportsMethods.includes(method) : true;
            const hOk = hasAuth ? !!p.supportsHeaders : true;
            return mOk && hOk;
        };

        let candidates = this.workingProxies.filter(supports);
        if (candidates.length === 0) {
            // 没有匹配能力的，退化为所有可用代理
            candidates = [...this.workingProxies];
        }

        // 如当前代理不满足能力，切到第一个候选
        if (!supports(this.currentProxy)) {
            this.currentProxy = candidates[0];
        }

        // 尝试按候选列表依次请求
        let lastNonRetryable = null; // 记住最后一个非网络错误/非5xx响应
        for (let i = 0; i < candidates.length; i++) {
            const proxy = i === 0 ? this.currentProxy : candidates[i];
            const proxyUrl = this.buildProxiedUrl(proxy, url);

            try {
                const response = await fetch(proxyUrl, {
                    ...options,
                    // 不再强制添加会触发预检的头
                    headers: {
                        ...headers
                    }
                });

                // 5xx 视为代理侧错误，换下一个
                if (!response.ok && response.status >= 500 && response.status <= 599) {
                    console.log(`代理 ${proxy.name} 返回 ${response.status}，尝试下一个...`);
                    continue;
                }

                // 若带鉴权头且返回 401/403，可能是代理限制（如未激活/预检），继续尝试下一个
                if (hasAuth && (response.status === 401 || response.status === 403)) {
                    console.log(`代理 ${proxy.name} 返回 ${response.status}（鉴权请求），尝试下一个...`);
                    lastNonRetryable = response;
                    continue;
                }

                // 其它情况：接受该响应
                this.currentProxy = proxy;
                return response;
            } catch (error) {
                console.log(`代理 ${proxy.name} 错误，尝试下一个...`);
                continue;
            }
        }

        // 若全部代理都不合适，返回最后一个非重试响应（例如持续 401/403），否则抛错
        if (lastNonRetryable) {
            return lastNonRetryable;
        }
        throw new Error('所有代理均请求失败');
    },

    /**
     * 切换到下一个可用代理
     */
    switchToNextProxy() {
        const currentIndex = this.workingProxies.indexOf(this.currentProxy);
        const nextIndex = (currentIndex + 1) % this.workingProxies.length;
        this.currentProxy = this.workingProxies[nextIndex];
        console.log(`🔄 切换到代理: ${this.currentProxy.name}`);
    },

    /**
     * 构建代理后的URL（不同代理拼接方式不同）
     */
    buildProxiedUrl(p, target) {
        const name = (p?.name || '').trim();
        const base = p?.url || p?.base || '';
        const enc = encodeURIComponent(target);
        if (name.startsWith('nanno')) return base + enc; // Workers 代理使用 URL 编码
        if (name.startsWith('AllOrigins')) return base + enc;
        if (name.startsWith('CorsProxy.io')) return base + target; // 支持 "?<full-url>"
        if (name.startsWith('Proxy CORS')) return base + enc; // vercel 函数
        if (name.startsWith('CORS Anywhere')) return base + target; // path 直接拼接
        if (name.startsWith('ThingProxy')) return base + target; // path 直接拼接
        // 回退：按 ?url= 语义处理（多数简单代理）
        return base + enc;
    },

    /**
     * 设置用户自定义代理列表（覆盖默认）
     */
    setUserProxies(list) {
        if (!Array.isArray(list)) throw new Error('代理列表需要为数组');
        const sanitized = list.map((p, i) => ({
            name: String(p.name || `Custom ${i + 1}`),
            url: String(p.url || ''),
            type: p.type || 'simple',
            reliable: !!p.reliable,
            rateLimit: p.rateLimit || '',
            supportsMethods: Array.isArray(p.supportsMethods) ? p.supportsMethods : ['GET'],
            supportsHeaders: p.supportsHeaders !== false
        })).filter(p => p.url);
        window.CORSProxyConfig.proxies = sanitized;
        try { localStorage.setItem('cors_proxy_user_list', JSON.stringify(sanitized)); } catch {}
        // 清空工作集，等待重新 init()
        this.workingProxies = [];
        this.currentProxy = null;
        this.failedProxies = new Set();
        return true;
    },

    /**
     * 重置为默认代理列表
     */
    resetProxies() {
        window.CORSProxyConfig.proxies = JSON.parse(JSON.stringify(window.CORSProxyConfig._defaults || []));
        try { localStorage.removeItem('cors_proxy_user_list'); } catch {}
        this.workingProxies = [];
        this.currentProxy = null;
        this.failedProxies = new Set();
        return true;
    },

    /**
     * 获取当前生效的代理列表
     */
    getEffectiveProxies() {
        return Array.isArray(window.CORSProxyConfig.proxies) ? window.CORSProxyConfig.proxies : [];
    },

    /**
     * 自检探针：对每个代理跑 简单GET/带鉴权GET/POST JSON
     * 返回 JSON 报告数组
     */
    async probeProxies(options = {}) {
        const timeoutMs = Number(options.timeoutMs || 8000);
        const proxies = Array.isArray(options.proxies) ? options.proxies : this.getEffectiveProxies();
        const PROBE_GET = 'https://httpbin.org/get?hello=world';
        const PROBE_GET_AUTH = 'https://httpbin.org/anything?probe=headers';
        const PROBE_POST = 'https://httpbin.org/post';
        const authHeaders = { 'Authorization': 'Bearer probe-123', 'X-Probe': 'CORS' };

        const toJson = (ok, status, latencyMs, error) => ({ ok, status: status || 0, latencyMs: latencyMs || 0, error: error || null });

        const results = [];
        for (const p of proxies) {
            const row = { name: p.name, base: p.url };
            // 1) 简单 GET
            let start = performance.now();
            try {
                const r = await this.fetchWithTimeout(this.buildProxiedUrl(p, PROBE_GET), { method: 'GET', headers: { 'Accept': 'application/json' } }, timeoutMs);
                const ok = r.status >= 200 && r.status < 500;
                row.simpleGet = toJson(ok, r.status, Math.round(performance.now() - start), ok ? null : `HTTP ${r.status}`);
            } catch (e) {
                row.simpleGet = toJson(false, 0, Math.round(performance.now() - start), String(e?.name || e?.message || e));
            }

            // 2) 带鉴权头 GET
            start = performance.now();
            let forwardedAuth = false;
            try {
                const r = await this.fetchWithTimeout(this.buildProxiedUrl(p, PROBE_GET_AUTH), { method: 'GET', headers: { ...authHeaders, 'Accept': 'application/json' } }, timeoutMs);
                const ok = r.status >= 200 && r.status < 500;
                let err = ok ? null : `HTTP ${r.status}`;
                try {
                    const data = await r.clone().json();
                    const h = data && data.headers;
                    if (h && h.Authorization === 'Bearer probe-123') forwardedAuth = true;
                } catch {}
                row.authGet = toJson(ok, r.status, Math.round(performance.now() - start), err);
            } catch (e) {
                row.authGet = toJson(false, 0, Math.round(performance.now() - start), String(e?.name || e?.message || e));
            }
            row.forwardedAuthorization = !!forwardedAuth;

            // 3) POST JSON（仅对宣称支持POST的尝试）
            const claimsPost = Array.isArray(p.supportsMethods) ? p.supportsMethods.includes('POST') : true;
            let postOk = false;
            start = performance.now();
            if (claimsPost) {
                try {
                    const body = JSON.stringify({ echo: 'ok' });
                    const r = await this.fetchWithTimeout(this.buildProxiedUrl(p, PROBE_POST), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body }, timeoutMs);
                    const ok = r.status >= 200 && r.status < 300;
                    let err = ok ? null : `HTTP ${r.status}`;
                    try {
                        const data = await r.clone().json();
                        postOk = ok && data && data.json && data.json.echo === 'ok';
                    } catch {}
                    row.postJson = toJson(ok, r.status, Math.round(performance.now() - start), err);
                } catch (e) {
                    row.postJson = toJson(false, 0, Math.round(performance.now() - start), String(e?.name || e?.message || e));
                }
            } else {
                row.postJson = toJson(false, 0, 0, 'skipped: proxy-declared-no-post');
            }
            row.postSupported = !!postOk;

            // 4) 结论与备注
            const notes = [];
            if (!row.simpleGet?.ok) notes.push('simpleGet失败');
            if ((p.name || '').includes('CORS Anywhere')) notes.push('可能需先激活(CORS Anywhere)');
            const claimsHeaders = p.supportsHeaders !== false;
            if (!row.forwardedAuthorization && claimsHeaders) notes.push('宣称可转发头但未回显Authorization');
            if ((p.name || '').includes('AllOrigins')) notes.push('自定义头会触发预检，/raw 不返回允许头，前端可能被拦截');
            if ((p.name || '').includes('ThingProxy')) notes.push('仅适合无鉴权简单GET');

            row.usableForAuthedGET = !!(row.authGet?.ok && row.forwardedAuthorization);
            row.usableForPOST = !!postOk;
            row.notes = notes.join('; ');
            results.push(row);
        }
        return results;
    },

    // fetch with timeout helper
    async fetchWithTimeout(url, options, timeoutMs) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const resp = await fetch(url, { ...(options || {}), signal: controller.signal });
            return resp;
        } finally {
            clearTimeout(id);
        }
    },

    /**
     * 从缓存加载
     */
    loadFromCache() {
        if (!window.CORSProxyConfig.cache.enabled) return;

        try {
            const cached = localStorage.getItem(window.CORSProxyConfig.cache.key);
            if (cached) {
                const data = JSON.parse(cached);
                const now = Date.now();
                
                if (now - data.timestamp < window.CORSProxyConfig.cache.duration) {
                    this.workingProxies = data.workingProxies || [];
                    this.currentProxy = data.currentProxy || null;
                    console.log('📦 从缓存加载代理配置');
                }
            }
        } catch (error) {
            console.log('缓存加载失败:', error);
        }
    },

    /**
     * 保存到缓存
     */
    saveToCache() {
        if (!window.CORSProxyConfig.cache.enabled) return;

        try {
            const data = {
                timestamp: Date.now(),
                workingProxies: this.workingProxies,
                currentProxy: this.currentProxy
            };
            localStorage.setItem(window.CORSProxyConfig.cache.key, JSON.stringify(data));
        } catch (error) {
            console.log('缓存保存失败:', error);
        }
    },

    /**
     * 获取代理状态信息
     */
    getStatus() {
        return {
            hasProxy: !!this.currentProxy,
            currentProxy: this.currentProxy?.name || 'None',
            workingCount: this.workingProxies.length,
            failedCount: this.failedProxies.size
        };
    }
};
