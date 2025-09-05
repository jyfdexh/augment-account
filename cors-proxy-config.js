/**
 * CORS 代理配置文件
 * 用于 GitHub Pages 等静态部署环境的跨域解决方案
 */

window.CORSProxyConfig = {
    // 公共代理服务列表（按可靠性排序）
    proxies: [
        {
            name: 'AllOrigins',
            url: 'https://api.allorigins.win/raw?url=',
            type: 'simple',
            reliable: true,
            rateLimit: '1000/hour'
        },
        {
            name: 'CorsProxy.io',
            url: 'https://corsproxy.io/?',
            type: 'simple',
            reliable: true,
            rateLimit: '200/hour'
        },
        {
            name: 'Proxy CORS',
            url: 'https://proxy-cors.vercel.app/api/proxy?url=',
            type: 'simple',
            reliable: false,
            rateLimit: '100/hour'
        },
        {
            name: 'CORS Anywhere (Heroku)',
            url: 'https://cors-anywhere.herokuapp.com/',
            type: 'simple',
            reliable: false,
            rateLimit: '50/hour',
            note: '需要先访问激活'
        },
        {
            name: 'ThingProxy',
            url: 'https://thingproxy.freeboard.io/fetch/',
            type: 'simple',
            reliable: false,
            rateLimit: '100/hour'
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
                const proxyUrl = proxy.url + encodeURIComponent(testUrl);
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

                if (response.ok) {
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

        const proxyUrl = this.currentProxy.url + encodeURIComponent(url);
        
        try {
            const response = await fetch(proxyUrl, {
                ...options,
                headers: {
                    ...options.headers,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (!response.ok && this.workingProxies.length > 1) {
                // 当前代理失败，尝试下一个
                console.log(`代理 ${this.currentProxy.name} 失败，尝试下一个...`);
                this.switchToNextProxy();
                return this.fetch(url, options);
            }

            return response;
        } catch (error) {
            if (this.workingProxies.length > 1) {
                console.log(`代理 ${this.currentProxy.name} 错误，尝试下一个...`);
                this.switchToNextProxy();
                return this.fetch(url, options);
            }
            throw error;
        }
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
