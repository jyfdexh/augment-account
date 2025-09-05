/**
 * Service Worker CORS 代理
 * 用于拦截和代理跨域请求
 */

const CACHE_NAME = 'cors-proxy-cache-v1';
const PROXY_PREFIX = '/cors-proxy/';

// 代理配置
const PROXY_SERVERS = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://thingproxy.freeboard.io/fetch/'
];

let currentProxyIndex = 0;

self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker 安装中...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker 激活');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // 只处理代理请求
    if (url.pathname.startsWith(PROXY_PREFIX)) {
        event.respondWith(handleProxyRequest(event.request));
    }
});

/**
 * 处理代理请求
 */
async function handleProxyRequest(request) {
    const url = new URL(request.url);
    const targetUrl = url.pathname.replace(PROXY_PREFIX, '');
    
    if (!targetUrl) {
        return new Response('Missing target URL', { status: 400 });
    }

    // 尝试所有代理服务器
    for (let i = 0; i < PROXY_SERVERS.length; i++) {
        const proxyIndex = (currentProxyIndex + i) % PROXY_SERVERS.length;
        const proxyServer = PROXY_SERVERS[proxyIndex];
        
        try {
            const proxyUrl = proxyServer + encodeURIComponent(targetUrl);
            
            const proxyRequest = new Request(proxyUrl, {
                method: request.method,
                headers: {
                    'Accept': request.headers.get('Accept') || 'application/json',
                    'User-Agent': 'Mozilla/5.0 (compatible; CORS-Proxy/1.0)'
                },
                body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null
            });

            const response = await fetch(proxyRequest);
            
            if (response.ok) {
                // 成功，更新当前代理索引
                currentProxyIndex = proxyIndex;
                
                // 创建新的响应，添加CORS头
                const newResponse = new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: {
                        ...Object.fromEntries(response.headers.entries()),
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
                    }
                });
                
                return newResponse;
            }
        } catch (error) {
            console.log(`代理 ${proxyServer} 失败:`, error.message);
            continue;
        }
    }
    
    return new Response('All proxy servers failed', { status: 502 });
}

/**
 * 处理 OPTIONS 预检请求
 */
function handleOptionsRequest() {
    return new Response(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
            'Access-Control-Max-Age': '86400'
        }
    });
}
