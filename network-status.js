/**
 * 网络状态检测和管理组件
 * 用于检测网络连接状态和API可用性
 */

window.NetworkStatusManager = {
    status: {
        online: navigator.onLine,
        apiReachable: false,
        lastCheck: null,
        errors: []
    },

    // 初始化网络状态监听
    init() {
        // 监听网络状态变化
        window.addEventListener('online', () => {
            this.status.online = true;
            this.showNetworkStatus('网络连接已恢复', 'success');
            this.checkAPIStatus();
        });

        window.addEventListener('offline', () => {
            this.status.online = false;
            this.showNetworkStatus('网络连接已断开', 'error');
        });

        // 初始检测
        this.checkAPIStatus();
    },

    // 检测API状态
    async checkAPIStatus() {
        if (!this.status.online) {
            this.status.apiReachable = false;
            return false;
        }

        const testUrls = [
            'https://httpbin.org/json',
            'https://api.github.com',
            'https://jsonplaceholder.typicode.com/posts/1'
        ];

        let reachableCount = 0;
        const errors = [];

        for (const url of testUrls) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(url, {
                    method: 'HEAD',
                    mode: 'cors',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok || response.status === 404) {
                    reachableCount++;
                }
            } catch (error) {
                errors.push(`${url}: ${error.message}`);
            }
        }

        this.status.apiReachable = reachableCount > 0;
        this.status.lastCheck = new Date();
        this.status.errors = errors;

        return this.status.apiReachable;
    },

    // 显示网络状态提示
    showNetworkStatus(message, type = 'info') {
        if (typeof showToast === 'function') {
            showToast(message, type);
        } else {
            console.log(`[Network] ${message}`);
        }
    },

    // 获取网络诊断信息
    getDiagnostics() {
        return {
            online: this.status.online,
            apiReachable: this.status.apiReachable,
            lastCheck: this.status.lastCheck,
            userAgent: navigator.userAgent,
            connection: navigator.connection ? {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt
            } : null,
            errors: this.status.errors
        };
    },

    // 显示网络诊断对话框
    showDiagnostics() {
        const diagnostics = this.getDiagnostics();
        
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 9999;
            display: flex; align-items: center; justify-content: center;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--bg, white); border-radius: 12px; padding: 20px;
            max-width: 600px; width: 90vw; max-height: 80vh; overflow-y: auto;
            box-shadow: 0 25px 60px -12px rgba(0,0,0,.28);
        `;

        const connectionInfo = diagnostics.connection ? `
            <div style="margin: 10px 0;">
                <strong>连接类型:</strong> ${diagnostics.connection.effectiveType}<br>
                <strong>下载速度:</strong> ${diagnostics.connection.downlink} Mbps<br>
                <strong>延迟:</strong> ${diagnostics.connection.rtt} ms
            </div>
        ` : '<div style="margin: 10px 0; color: #666;">连接信息不可用</div>';

        const errorsInfo = diagnostics.errors.length > 0 ? `
            <div style="margin: 10px 0;">
                <strong>错误信息:</strong>
                <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 12px; margin-top: 5px;">
                    ${diagnostics.errors.join('<br>')}
                </div>
            </div>
        ` : '';

        dialog.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0;">🔍 网络诊断</h3>
                <button id="close-diagnostics" style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <div style="margin: 10px 0;">
                    <strong>网络状态:</strong> 
                    <span style="color: ${diagnostics.online ? '#16a34a' : '#dc2626'}">
                        ${diagnostics.online ? '✅ 在线' : '❌ 离线'}
                    </span>
                </div>
                
                <div style="margin: 10px 0;">
                    <strong>API可达性:</strong> 
                    <span style="color: ${diagnostics.apiReachable ? '#16a34a' : '#dc2626'}">
                        ${diagnostics.apiReachable ? '✅ 可达' : '❌ 不可达'}
                    </span>
                </div>
                
                <div style="margin: 10px 0;">
                    <strong>最后检测:</strong> ${diagnostics.lastCheck ? diagnostics.lastCheck.toLocaleString() : '未检测'}
                </div>
                
                ${connectionInfo}
                ${errorsInfo}
            </div>
            
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="recheck-network" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">重新检测</button>
                <button id="copy-diagnostics" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer;">复制信息</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // 绑定事件
        dialog.querySelector('#close-diagnostics').onclick = () => overlay.remove();
        
        dialog.querySelector('#recheck-network').onclick = async () => {
            const btn = dialog.querySelector('#recheck-network');
            btn.textContent = '检测中...';
            btn.disabled = true;
            
            await this.checkAPIStatus();
            overlay.remove();
            this.showDiagnostics(); // 重新显示更新后的信息
        };
        
        dialog.querySelector('#copy-diagnostics').onclick = () => {
            const text = JSON.stringify(diagnostics, null, 2);
            navigator.clipboard?.writeText(text);
            this.showNetworkStatus('诊断信息已复制到剪贴板', 'success');
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };
    },

    // 检测特定URL的可达性
    async testUrl(url, timeout = 5000) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'cors',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return {
                success: true,
                status: response.status,
                ok: response.ok
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
};

// 自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.NetworkStatusManager.init();
    });
} else {
    window.NetworkStatusManager.init();
}
