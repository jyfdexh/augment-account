// ==UserScript==
// @name         !.Ai Augment Tool (Community sort fix + Manual Import + Invalid Section)
// @description  北京时间天数/周几；获取订阅后自动弹出管理；余额色条；检测转圈；默认按到期排序；无到期日=社区计划(月更)，排序置底并显示标签；修复google.com.hk匹配与UI渲染空值；过期无日期不显示“社区计划”；新增手动填写导入；失效凭证单独分栏
// @version      2.9.9-manual-import-invalid-section
// @author       ank
// @namespace    http://010314.xyz/
// @match        https://augmentcode.com/*
// @match        https://*.augmentcode.com/*
// @match        https://www.google.com/*
// @match        https://www.google.com.hk/*
// @match        https://www.google.com.sg/*
// @match        https://www.google.co.jp/*
// @match        https://www.google.co.kr/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @connect      portal.withorb.com
// @connect      augmentcode.com
// @connect      api.github.com
// @run-at       document-end
// ==/UserScript==

(() => {
    'use strict';

    const CFG = {
        clientID: 'v',
        authURL: 'https://auth.augmentcode.com/authorize',
        orbAPI: 'https://portal.withorb.com/api/v1',
        pricingUnit: 'jWTJo9ptbapMWkvg',
        CONCURRENCY: 4,
        PAGE_SIZE: 18
    };

    const BJ_TZ = 'Asia/Shanghai';
    const BJ_OFFSET = 8 * 3600 * 1000;

    const $  = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));
    const json = s => { try { return JSON.parse(s); } catch { return null; } };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const now = () => Date.now();
    const copy = t => GM_setClipboard ? GM_setClipboard(String(t ?? '')) : navigator.clipboard?.writeText(String(t ?? ''));
    const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
    const rand = n => { const a=new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); };
    const sha256 = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    const http = (url, opt = {}) => new Promise((ok, fail) => {
        GM_xmlhttpRequest({
            method: opt.method || 'GET', url, headers: opt.headers || {},
            data: opt.data ? JSON.stringify(opt.data) : undefined, timeout: 15000,
            onload: r => r.status < 300 ? ok(json(r.responseText) || r.responseText) : fail(r.status),
            onerror: () => fail('网络错误'), ontimeout: () => fail('超时')
        });
    });

    const nn = v => (v === null || v === undefined) ? '' : String(v);

    function fmtBJ(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const parts = new Intl.DateTimeFormat('zh-CN', {
            timeZone: BJ_TZ, year:'numeric', month:'2-digit', day:'2-digit',
            hour:'2-digit', minute:'2-digit', hour12:false
        }).formatToParts(d).reduce((m,p)=> (m[p.type]=p.value, m), {});
        return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    }
    const weekBJ = iso => new Intl.DateTimeFormat('zh-CN', { timeZone: BJ_TZ, weekday:'short' }).format(new Date(iso));
    function bjDayStartMs(t) {
        const ms = (t instanceof Date ? t.getTime() : new Date(t).getTime());
        if (isNaN(ms)) return NaN;
        const aligned = Math.floor((ms + BJ_OFFSET) / 86400000) * 86400000 - BJ_OFFSET;
        return aligned;
    }
    function daysLeftBJ(iso) {
        if (!iso) return '';
        const end0 = bjDayStartMs(iso);
        const now0 = bjDayStartMs(Date.now());
        if (isNaN(end0) || isNaN(now0)) return '';
        const diff = Math.floor((end0 - now0) / 86400000);
        return diff >= 0 ? `${diff}天后到期` : `已过期${Math.abs(diff)}天`;
    }
    const ratioColor = r => { r = Math.max(0, Math.min(1, r||0)); const hue = Math.round(120*r); return { bg:`hsla(${hue},70%,45%,.14)`, fg:`hsl(${hue},70%,35%)`, bd:`hsla(${hue},70%,45%,.6)` }; };

    const store = {
        get: () => {
            const arr = json(GM_getValue('creds','[]')) || [];
            return Array.isArray(arr) ? arr.map(x => ({
                id: x.id ?? Date.now(),
                email: nn(x.email),
                tenant: nn(x.tenant),
                token: nn(x.token),
                subToken: nn(x.subToken),
                lastBalance: x.lastBalance ?? '',
                lastIncluded: x.lastIncluded ?? '',
                lastEndDate: nn(x.lastEndDate),
                status: nn(x.status),
                updatedAt: x.updatedAt ?? 0
            })) : [];
        },
        set: list => GM_setValue('creds', JSON.stringify(list || [])),
        add: item => { const list = store.get(); list.push({ id: Date.now(), updatedAt: now(), ...item }); store.set(list); },
        del: id => store.set(store.get().filter(x=>x.id!==id)),
        update: (id, patch) => { const list=store.get(); const i=list.findIndex(x=>x.id===id); if(i>-1) list[i]={...list[i], ...patch, updatedAt: now()}; store.set(list); }
    };
    const hist = { get:()=>json(GM_getValue('history','{}'))||{}, set:h=>GM_setValue('history',JSON.stringify(h)),
        push(id,rec){ const all=hist.get(); all[id]=all[id]||[]; all[id].push({ts:now(),...rec}); if(all[id].length>50) all[id].shift(); hist.set(all); } };
    const undo = { get:()=>json(GM_getValue('undo','[]'))||[], push(s){const a=undo.get();a.push({ts:now(),data:s}); if(a.length>10)a.shift(); GM_setValue('undo',JSON.stringify(a));},
        pop(){const a=undo.get(); const last=a.pop(); GM_setValue('undo',JSON.stringify(a)); return last?.data;}, has(){return undo.get().length>0;} };

    // GitHub Gist 云同步管理
    const gistSync = {
        getConfig: () => {
            try {
                const config = GM_getValue('gist_sync_config', '{}');
                const parsed = json(config) || {};
                return { token: '', gistId: '', autoSync: false, ...parsed };
            } catch {
                return { token: '', gistId: '', autoSync: false };
            }
        },

        setConfig: (config) => {
            try {
                GM_setValue('gist_sync_config', JSON.stringify(config));
                return true;
            } catch {
                return false;
            }
        },

        async upload(data, token, gistId = null) {
            const url = gistId
                ? `https://api.github.com/gists/${gistId}`
                : 'https://api.github.com/gists';

            try {
                const response = await http(url, {
                    method: gistId ? 'PATCH' : 'POST',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    data: {
                        description: 'Augment Account Credentials - Auto Sync',
                        public: false,
                        files: {
                            'augment-creds.json': {
                                content: JSON.stringify({
                                    data: data,
                                    lastSync: new Date().toISOString(),
                                    version: '1.0'
                                }, null, 2)
                            }
                        }
                    }
                });

                return response;
            } catch (error) {
                if (typeof error === 'number') {
                    if (error === 401) throw new Error('GitHub Token无效或已过期');
                    if (error === 403) throw new Error('权限不足，请检查Token权限');
                    if (error === 404) throw new Error('Gist不存在或无访问权限');
                    throw new Error(`GitHub API错误: HTTP ${error}`);
                }
                throw new Error(`上传失败: ${error}`);
            }
        },

        async download(token, gistId) {
            try {
                const response = await http(`https://api.github.com/gists/${gistId}`, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                const file = response.files && response.files['augment-creds.json'];
                if (!file) {
                    throw new Error('Gist中未找到凭证文件');
                }

                const content = json(file.content);
                if (!content) {
                    throw new Error('凭证文件格式错误');
                }

                return {
                    data: content.data || [],
                    lastSync: content.lastSync,
                    version: content.version
                };
            } catch (error) {
                if (typeof error === 'number') {
                    if (error === 401) throw new Error('GitHub Token无效或已过期');
                    if (error === 403) throw new Error('权限不足，请检查Token权限');
                    if (error === 404) throw new Error('Gist不存在或无访问权限');
                    throw new Error(`GitHub API错误: HTTP ${error}`);
                }
                throw new Error(`下载失败: ${error}`);
            }
        },

        async sync(direction = 'upload') {
            const config = this.getConfig();
            if (!config.token) {
                throw new Error('请先配置 GitHub Token');
            }

            if (direction === 'upload') {
                const localData = store.get();
                const result = await this.upload(localData, config.token, config.gistId);

                // 保存 Gist ID（首次上传时）
                if (!config.gistId) {
                    config.gistId = result.id;
                    this.setConfig(config);
                }

                return { direction: 'upload', count: localData.length, gistId: result.id };
            } else {
                if (!config.gistId) {
                    throw new Error('请先配置 Gist ID 或进行首次上传');
                }

                const cloudData = await this.download(config.token, config.gistId);
                store.set(cloudData.data);

                return { direction: 'download', count: cloudData.data.length, lastSync: cloudData.lastSync };
            }
        },

        async testConnection(token) {
            try {
                const response = await http('https://api.github.com/user', {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                return {
                    success: true,
                    user: response.login || 'Unknown',
                    message: `连接成功！用户: ${response.login || 'Unknown'}`
                };
            } catch (error) {
                if (typeof error === 'number') {
                    if (error === 401) return { success: false, message: 'Token无效或已过期' };
                    if (error === 403) return { success: false, message: 'Token权限不足' };
                    return { success: false, message: `GitHub API错误: HTTP ${error}` };
                }
                return { success: false, message: `连接失败: ${error}` };
            }
        }
    };

    GM_addStyle(`
    :root{--bg:#fff;--fg:#0f172a;--muted:#64748b;--panel:#f8fafc;--bd:#e2e8f0;--chip:#eef2f7}
    @media (prefers-color-scheme: dark){
      :root{--bg:#0b1220;--fg:#e5eefc;--muted:#9fb0ca;--panel:#0e1729;--bd:#1d2a44;--chip:#0f1b33}
    }
    #aug-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);z-index:9998}
    #aug{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;width:min(1200px,96vw);max-height:92vh;background:var(--bg);border-radius:18px;box-shadow:0 25px 60px -12px rgba(0,0,0,.28);font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    #aug-head{display:flex;align-items:center;padding:14px 18px;border-bottom:1px solid var(--bd);background:var(--bg);position:sticky;top:0;z-index:2}
    #aug-title{margin:0 0 0 8px;font-weight:700;font-size:18px;color:var(--fg)}
    #aug-close{margin-left:auto;cursor:pointer;padding:8px;border-radius:8px;color:var(--muted)}
    #aug-close:hover{background:var(--chip);color:var(--fg)}
    #aug-body{overflow:auto;padding:12px 16px 16px;max-height:calc(92vh - 60px);background:var(--panel)}
    .header-stats{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;padding:10px 12px;background:linear-gradient(135deg,var(--panel) 0%,var(--chip) 100%);border-radius:12px;border:1px solid var(--bd)}
    .stat-item{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:13px}
    .stat-value{font-weight:700;color:var(--fg)}
    .btn{padding:6px 10px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;transition:.15s}
    .btn-primary{background:#3b82f6;color:#fff}.btn-primary:hover{background:#2563eb}
    .btn-secondary{background:var(--chip);color:var(--fg);border:1px solid var(--bd)}.btn-secondary:hover{background:#e5e7eb1a}
    .btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--bd)}.btn-ghost:hover{background:#f3f4f6}
    .btn-danger{background:#ef4444;color:#fff}.btn-danger:hover{background:#dc2626}
    .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
    .card{background:var(--bg);border:1px solid var(--bd);border-radius:12px;padding:10px 12px;transition:.2s;position:relative}
    .card:hover{box-shadow:0 4px 12px -4px rgba(0,0,0,.18)}
    .card.st-ok{border-left:4px solid #16a34a}.card.st-warn{border-left:4px solid #f59e0b}.card.st-bad{border-left:4px solid #ef4444}.card.st-muted{border-left:4px solid #94a3b8}
    .card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
    .card-title{font-weight:700;font-size:14px;color:var(--fg);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65%}
    .status{padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700}
    .ok{background:#16a34a1a;color:#16a34a}.bad{background:#ef44441a;color:#ef4444}.warn{background:#f59e0b1a;color:#f59e0b}.muted{background:#94a3b81a;color:#94a3b8}
    .meta{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;margin-bottom:6px;flex-wrap:wrap}
    .chip{padding:2px 6px;border-radius:6px;border:1px solid var(--bd);font-family:ui-monospace,monospace}
    .balbar{height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin-top:4px}
    .balbar>div{height:100%}
    .row{display:flex;gap:6px;align-items:center}
    .line{display:flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--bd);border-radius:8px;padding:4px 6px;cursor:pointer;overflow:hidden}
    .line .v{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,monospace}
    .line.copied{outline:2px solid #93c5fd;outline-offset:1px}
    .actions{display:flex;gap:6px;justify-content:flex-end;margin-top:6px;padding-top:6px;border-top:1px solid var(--bd)}
    .selbox{width:16px;height:16px;margin-right:6px}
    .check-badge{position:absolute;top:8px;right:8px;background:#dcfce7;color:#166534;border-radius:12px;padding:2px 8px;font-size:12px;font-weight:700;display:none}
    .check-badge.show{display:inline-block}
    .card-loading{position:absolute;top:8px;right:8px;display:inline-flex;align-items:center;gap:6px;background:#e0f2fe;color:#075985;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}
    .spin{width:12px;height:12px;border-radius:50%;border:2px solid #93c5fd;border-top-color:transparent;animation:sp .8s linear infinite}
    @keyframes sp{to{transform:rotate(360deg)}}
    .pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:10px}
    #aug-toasts{position:fixed;top:16px;right:16px;z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none}
    .aug-toast{pointer-events:auto;background:var(--bg);color:var(--fg);border:1px solid var(--bd);border-radius:12px;padding:10px 12px;box-shadow:0 10px 24px rgba(0,0,0,.18);opacity:0;transform:translateY(-6px);transition:all .25s}
    .aug-toast.show{opacity:1;transform:translateY(0)}
    /* 导入对话框 tabs */
    .tabs{display:flex;gap:6px;border-bottom:1px solid var(--bd);margin-bottom:8px}
    .tab{padding:6px 10px;border:1px solid var(--bd);border-bottom:none;border-radius:8px 8px 0 0;background:var(--panel);cursor:pointer}
    .tab.active{background:var(--bg);font-weight:700}
    .tab-panel{display:none}
    .tab-panel.active{display:block}
    .form-grid{display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center}
    .ipt{width:100%;padding:8px 10px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--fg)}
    .section-title{margin:16px 0 8px;font-weight:800;color:var(--fg)}
    .section-title.collapsible{cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px}
    .section-title.collapsible:hover{color:#3b82f6}
    .section-title .toggle-icon{transition:transform 0.2s ease;font-size:12px}
    .section-title.collapsed .toggle-icon{transform:rotate(-90deg)}
    .section-content{transition:all 0.3s ease;overflow:hidden}
    .section-content.collapsed{max-height:0;opacity:0;margin:0;padding:0}
  `);

    function ringChartSVG(used, total){
        total = Number(total)||0; used = Number(used)||0;
        const pct = total>0 ? Math.round((total-used)/total*100) : 100;
        const r=18,c=20,per=2*Math.PI*r, val=(pct/100)*per;
        return `<svg width="46" height="46" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="4"></circle>
      <circle cx="20" cy="20" r="${r}" fill="none" stroke="#60a5fa" stroke-width="4" stroke-dasharray="${val} ${per-val}" transform="rotate(-90 ${c} ${c})"></circle>
      <text x="20" y="22" text-anchor="middle" font-size="10" fill="currentColor">${pct}%</text>
    </svg>`;
    }

    const select = new Set();
    const view = { page:1, size:CFG.PAGE_SIZE, sort:'end.asc' };

    const statusBadge = st => ({ ACTIVE:'ok', EXPIRED:'bad', NO_BALANCE:'bad', BANNED:'bad', ERROR:'warn', NO_TOKEN:'muted' }[st]||'muted');
    const statusClass = st => ({ ACTIVE:'st-ok', EXPIRED:'st-bad', NO_BALANCE:'st-bad', BANNED:'st-bad', ERROR:'st-warn', NO_TOKEN:'st-muted' }[st]||'st-muted');
    const statusText  = st => ({ ACTIVE:'正常', EXPIRED:'已过期', NO_BALANCE:'余额不足', BANNED:'已封禁', ERROR:'检测失败', NO_TOKEN:'无令牌' }[st]||'未知');
    const isInvalid   = st => ['EXPIRED','NO_BALANCE','BANNED','ERROR'].includes(st||'');

    const ui = {
        show(html){
            const old=$('#aug'); if(old) old.remove(); const oldov=$('#aug-overlay'); if(oldov) oldov.remove();
            const ov=document.createElement('div'); ov.id='aug-overlay';
            const el=document.createElement('div'); el.id='aug';
            el.innerHTML=`<div id="aug-head">🔑<h3 id="aug-title">凭证管理</h3><span id="aug-close">✕</span></div><div id="aug-body">${html}</div>`;
            document.body.appendChild(ov); ov.appendChild(el);
            const close=()=>{ try{el.remove();}catch{} try{ov.remove();}catch{} };
            $('#aug-close').onclick=close; ov.addEventListener('click',close); el.addEventListener('click',e=>e.stopPropagation());
            document.addEventListener('keydown', e=>{ if(e.key==='Escape') close(); }, {once:true});
            if (!$('#aug-toasts')) { const tw=document.createElement('div'); tw.id='aug-toasts'; document.body.appendChild(tw); }
            return el;
        },
        toast(msg, ms=1600){
            let tw = $('#aug-toasts'); if(!tw){ tw=document.createElement('div'); tw.id='aug-toasts'; document.body.appendChild(tw); }
            const t = document.createElement('div');
            t.className='aug-toast';
            t.textContent = msg;
            tw.appendChild(t);
            requestAnimationFrame(()=>t.classList.add('show'));
            setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(), 250); }, ms);
        },
        header(creds, stats){
            return `
      <div class="header-stats">
        <div class="stat-item">${ringChartSVG(stats.used, stats.total)}<span style="margin-left:4px">总余额 <span class="stat-value">${stats.total-stats.used}</span> / ${stats.total}</span></div>
        <div class="stat-item">✅ 正常 <span class="stat-value">${stats.active}</span></div>
        <div class="stat-item">🔒 异常 <span class="stat-value">${stats.abnormal}</span></div>
        <div class="stat-item">⚠️ 无令牌 <span class="stat-value">${stats.noToken}</span></div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
          <label style="color:var(--muted)">排序</label>
          <select id="sortsel" class="btn-ghost" style="padding:6px 10px;border-radius:8px;border:1px solid var(--bd);background:transparent">
            <option value="end.asc" ${view.sort==='end.asc'?'selected':''}>到期时间↑(默认)</option>
            <option value="added.desc" ${view.sort==='added.desc'?'selected':''}>加入顺序 新→旧</option>
            <option value="added.asc" ${view.sort==='added.asc'?'selected':''}>加入顺序 旧→新</option>
          </select>
          <button id="act-auth"  class="btn btn-secondary">获取令牌</button>
          <button id="act-check" class="btn btn-primary">全部检测</button>
          <button id="act-export" class="btn btn-secondary">导出</button>
          <button id="act-import" class="btn btn-ghost">导入</button>
          <button id="act-sync" class="btn btn-ghost">☁️ 云同步</button>
          <button id="act-undo" class="btn btn-ghost" ${undo.has()?'':'disabled'}>撤销合并</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;width:100%">
          <div class="stat-item">已选择 <span class="stat-value" id="sel-count">${select.size}</span> 项</div>
          <div>
            <button id="sel-check" class="btn btn-secondary">检测所选</button>
            <button id="sel-del"   class="btn btn-danger">删除所选</button>
            <button id="sel-export"class="btn btn-secondary">导出所选</button>
            <button id="sel-clear" class="btn btn-ghost">清空选择</button>
          </div>
        </div>
      </div>`;
        },
        card(cred, status){
            const cNorm = {
                id: cred.id,
                email: nn(cred.email),
                tenant: nn(cred.tenant),
                token: nn(cred.token),
                subToken: nn(cred.subToken),
                lastBalance: cred.lastBalance,
                lastIncluded: cred.lastIncluded,
                lastEndDate: nn(cred.lastEndDate),
                status: cred.status
            };
            const st = status || cNorm.status || 'UNKNOWN';
            const subURL = cNorm.subToken ? `https://portal.withorb.com/view?token=${cNorm.subToken}` : '';
            const remain = Number(cNorm.lastBalance||0), total = Number(cNorm.lastIncluded||0);
            const ratio = total>0 ? remain/total : 0;
            const color = ratioColor(ratio);

            const isExpired = st === 'EXPIRED';
            const community = !cNorm.lastEndDate && !isExpired;

            const endStr = cNorm.lastEndDate ? `${fmtBJ(cNorm.lastEndDate)}${weekBJ(cNorm.lastEndDate)}` : '';
            const daysText = cNorm.lastEndDate ? daysLeftBJ(cNorm.lastEndDate) : '';

            const showOrDash = v => (v && String(v).trim()) ? v : '—';

            return `<div class="card ${statusClass(st)}" data-id="${cNorm.id}">
        <div class="card-header">
          <div style="display:flex;align-items:center">
            <input type="checkbox" class="selbox" data-id="${cNorm.id}" ${select.has(cNorm.id)?'checked':''}/>
            <h4 class="card-title" title="${cNorm.email||cNorm.id}">${cNorm.email || `ID:${cNorm.id}`}</h4>
          </div>
          <span class="status ${statusBadge(st)}">${statusText(st)}</span>
        </div>

        <div class="meta">
          ${total?`<span class="chip" style="background:${color.bg};color:${color.fg};border-color:${color.bd}">${remain} / ${total}</span>`:''}
          ${community?`<span class="chip">社区计划（每月）</span>`:''}
          ${endStr?`<span class="chip">${endStr}</span>`:''}
          ${daysText?`<span class="chip">${daysText}</span>`:''}
        </div>
        ${total?`<div class="balbar"><div style="width:${Math.max(0,Math.min(100,Math.round(ratio*100)))}%; background:${color.bd}"></div></div>`:''}

        <div class="row" style="margin-top:6px">
          <div class="line copy" data-copy="${cNorm.tenant}" title="点击复制租户">
            <span>🔗</span><span class="v">${showOrDash(cNorm.tenant)}</span>
          </div>
        </div>
        <div class="row" style="margin-top:6px">
          <div class="line copy" data-copy="${cNorm.token}" title="点击复制令牌">
            <span>🔑</span><span class="v">${showOrDash(cNorm.token)}</span>
          </div>
        </div>
        <div class="row" style="margin-top:6px">
          <div class="line copy" data-copy="${subURL}" title="点击复制订阅链接">
            <span>📊</span><span class="v">${showOrDash(subURL)}</span>
          </div>
        </div>

        <div class="actions">
          <div></div>
          <div>
            <button class="btn btn-secondary" data-check="${cNorm.id}">检测</button>
            ${subURL?`<a class="btn btn-secondary" href="${subURL}" target="_blank">订阅</a>`:''}
            <button class="btn btn-danger" data-del="${cNorm.id}">删除</button>
          </div>
        </div>
        <span class="check-badge">✔ 已更新</span>
      </div>`;
        },
        pager(cur, pages){
            const btn = (id, dis, txt) => `<button class="btn btn-ghost" id="${id}"${dis?' disabled':''}>${txt}</button>`;
            return `<div class="pager">${btn('pg-prev', cur<=1, '上一页')}<span style="color:var(--muted)">第 ${cur} / ${pages} 页</span>${btn('pg-next', cur>=pages, '下一页')}</div>`;
        },
        section(title, content, collapsible = false, collapsed = false, extraButton = ''){
            const titleClass = collapsible ? 'section-title collapsible' + (collapsed ? ' collapsed' : '') : 'section-title';
            const contentClass = collapsible ? 'section-content' + (collapsed ? ' collapsed' : '') : '';
            const toggleIcon = collapsible ? `<span class="toggle-icon">${collapsed ? '▶' : '▼'}</span>` : '';

            return `
        <div class="section">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div class="${titleClass}" ${collapsible ? 'data-collapsible="true"' : ''}>${toggleIcon}${title}</div>
            ${extraButton ? `<div>${extraButton}</div>` : ''}
          </div>
          <div class="${contentClass}">
            ${content}
          </div>
        </div>
      `;
        }
    };

    function parseCSV(text){
        const lines=text.replace(/\r/g,'').split('\n').filter(Boolean);
        if(!lines.length) return [];
        const headers = splitCSVLine(lines[0]);
        return lines.slice(1).map(l=>{
            const c=splitCSVLine(l), o={}; headers.forEach((h,i)=>o[h.trim()]=c[i]??''); return o;
        });
    }
    function splitCSVLine(line){
        const res=[]; let cur='',q=false;
        for(let i=0;i<line.length;i++){
            const ch=line[i];
            if(ch==='"'){ if(q&&line[i+1]==='"'){cur+='"';i++;} else q=!q; }
            else if(ch===','&&!q){ res.push(cur); cur=''; }
            else cur+=ch;
        } res.push(cur); return res.map(s=>s.trim());
    }

    const importers = {
        open(){
            const html = `
        <div style="padding:12px">
          <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:8px">
            <div style="font-weight:700">导入（二选一）</div>
            <div>
              <button id="dlg-close" class="btn btn-ghost">关闭</button>
            </div>
          </div>

          <div class="tabs">
            <div class="tab active" data-tab="paste">粘贴导入(JSON/JSONL/CSV)</div>
            <div class="tab" data-tab="manual">手动填写导入(可选填)</div>
          </div>

          <div class="tab-panel active" id="panel-paste">
            <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-bottom:8px">
              <select id="dedup" class="btn-ghost" style="padding:6px 10px;border:1px solid var(--bd);border-radius:8px;background:transparent">
                <option value="fullEmail">去重：完整邮箱</option>
                <option value="nameKey">去重：邮箱本地名</option>
                <option value="subToken">去重：subToken</option>
              </select>
              <select id="merge" class="btn-ghost" style="padding:6px 10px;border:1px solid var(--bd);border-radius:8px;background:transparent">
                <option value="overwrite">合并：覆盖全部字段</option>
                <option value="onlyEmpty">合并：仅空字段</option>
                <option value="newer">合并：时间较新</option>
              </select>
              <button id="dlg-next" class="btn btn-primary">预览合并</button>
            </div>
            <textarea id="dlg-text" style="width:100%;height:44vh;padding:10px;border:1px solid var(--bd);border-radius:10px;background:var(--panel);font-family:ui-monospace,monospace" placeholder='[ { "email":"a@x.com","tenant":"https://...","token":"...","subToken":"..." }, ... ] 或 JSONL/CSV'></textarea>
            <div id="dlg-err" style="margin-top:6px;color:#991b1b;font-size:12px"></div>
          </div>

          <div class="tab-panel" id="panel-manual">
            <div class="form-grid">
              <label>Email</label><input id="mi-email" class="ipt" placeholder="可留空，例如 a@example.com">
              <label>Tenant</label><input id="mi-tenant" class="ipt" placeholder="可留空，例如 https://app.augmentcode.com/">
              <label>Token</label><input id="mi-token" class="ipt" placeholder="可留空，API/访问令牌">
              <label>subToken</label><input id="mi-sub" class="ipt" placeholder="可留空，Orb订阅token">
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
              <button id="mi-add" class="btn btn-secondary">添加一条并继续</button>
              <button id="mi-done" class="btn btn-primary">添加并完成</button>
            </div>
            <div id="mi-msg" style="margin-top:6px;color:#166534;font-size:12px"></div>
          </div>
        </div>`;
            const el = ui.show(html); const ov=$('#aug-overlay');
            const exit=()=>{ try{el.remove();}catch{} try{ov.remove();}catch{} actions.manage(false); };
            $('#dlg-close').onclick=exit;

            // tabs
            el.querySelectorAll('.tab').forEach(tab=>{
                tab.onclick=()=>{
                    el.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
                    el.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
                    tab.classList.add('active');
                    const id = tab.dataset.tab==='paste' ? '#panel-paste' : '#panel-manual';
                    el.querySelector(id).classList.add('active');
                };
            });

            // 粘贴 -> 预览
            $('#dlg-next').onclick=()=>{
                const text=$('#dlg-text').value.trim(); const de=$('#dedup').value; const mg=$('#merge').value;
                let arr=[]; try{
                    if(text.startsWith('[')) arr=JSON.parse(text);
                    else if(text.includes('\n') && text.split('\n').every(l=>!l.trim()||l.trim().startsWith('{'))) arr=text.split('\n').filter(Boolean).map(x=>JSON.parse(x));
                    else arr=parseCSV(text);
                    if(!Array.isArray(arr)) throw new Error('不是数组');
                }catch(e){ $('#dlg-err').textContent='解析失败：'+(e.message||e); return; }
                exit(); const plan=buildMergePlanAdvanced(arr,{dedup:de,merge:mg}); showMergePreviewAdvanced(plan,{dedup:de,merge:mg});
            };

            // 手动填写
            function collectManual(){
                const email = ($('#mi-email').value||'').trim();
                const tenant= ($('#mi-tenant').value||'').trim();
                const token = ($('#mi-token').value||'').trim();
                const sub   = ($('#mi-sub').value||'').trim();
                if(!email && !tenant && !token && !sub) return null; // 至少填一项
                const base = { email, tenant, token, subToken: sub };
                // 给一个初始状态：若无 subToken 则 NO_TOKEN，否则 UNKNOWN；其余字段留空
                base.status = sub ? 'UNKNOWN' : 'NO_TOKEN';
                return base;
            }
            function addOnce(showMsg=true){
                const data = collectManual();
                if(!data){ ui.toast('请至少填写一项'); return false; }
                store.add(data);
                if(showMsg){ $('#mi-msg').textContent='已添加，您可继续填写下一条…'; setTimeout(()=>$('#mi-msg').textContent='', 1500); }
                $('#mi-email').value=''; $('#mi-tenant').value=''; $('#mi-token').value=''; $('#mi-sub').value='';
                return true;
            }
            $('#mi-add').onclick=()=>addOnce(true);
            $('#mi-done').onclick=()=>{ if(addOnce(false)) exit(); };
        }
    };

    const exporters = {
        open(list){
            const text = JSON.stringify(list, null, 2);
            const html = `
        <div style="padding:12px">
          <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:8px">
            <div style="font-weight:700">导出内容（可编辑 JSON 数组）</div>
            <div>
              <button id="dlg-copy" class="btn btn-secondary">复制</button>
              <button id="dlg-save" class="btn btn-primary">保存更改</button>
              <button id="dlg-close" class="btn btn-ghost">关闭</button>
            </div>
          </div>
          <textarea id="dlg-text" style="width:100%;height:60vh;padding:10px;border:1px solid var(--bd);border-radius:10px;background:var(--panel);font-family:ui-monospace,monospace"></textarea>
        </div>`;
            const el = ui.show(html); const ov=$('#aug-overlay'); const ta=el.querySelector('#dlg-text'); ta.value=text;
            const exit=()=>{ try{el.remove();}catch{} try{ov.remove();}catch{} actions.manage(false); };
            $('#dlg-copy').onclick=()=>{ copy(ta.value); const b=$('#dlg-copy'); if(b){ b.textContent='已复制'; setTimeout(()=>{ b.textContent='复制'; },800); } };
            $('#dlg-save').onclick=()=>{ const parsed=json(ta.value); if(!Array.isArray(parsed)) return; store.set(parsed); exit(); };
            $('#dlg-close').onclick=exit; ta.focus();
        }
    };

    const emailNameKey = (email) => { if(!email||typeof email!=='string') return ''; const t=email.trim().toLowerCase(); const i=t.indexOf('@'); return i>0?t.slice(0,i):t; };
    const dedupKeyOf = (mode, item) => mode==='subToken' ? (item.subToken||'').trim() : mode==='fullEmail' ? (item.email||'').trim().toLowerCase() : emailNameKey(item.email||'');
    function buildMergePlanAdvanced(importListRaw, opt){
        const dedup=opt?.dedup||'fullEmail'; const merge=opt?.merge||'overwrite';
        const importList=Array.isArray(importListRaw)?importListRaw:[]; const current=store.get();
        const curMap=new Map(); current.forEach(c=>{ const k=dedupKeyOf(dedup,c); if(k) curMap.set(k,c); });
        const cleaned=new Map(); for(const imp of importList){ const k=dedupKeyOf(dedup,imp); if(k) cleaned.set(k,imp); }
        const updates=[], adds=[], fieldTally={};
        for(const [k,imp] of cleaned.entries()){
            const old=curMap.get(k);
            if(old){ const ch=diffByStrategy(old,imp,merge); ch.forEach(f=>fieldTally[f]=(fieldTally[f]||0)+1); updates.push({id:old.id, old, imp, changes:ch}); }
            else adds.push({imp});
        }
        return { updates, adds, fieldTally };
    }
    function diffByStrategy(oldObj={}, impObj={}, mode='overwrite'){
        const fields=new Set([...Object.keys(oldObj),...Object.keys(impObj)]); const out=[];
        fields.forEach(f=>{ if(f==='id') return; const o=oldObj[f], n=impObj[f];
            if(mode==='onlyEmpty'){ if((o===undefined||o===null||o==='') && n!==undefined && n!==o) out.push(f); }
            else if(mode==='newer'){ if(Number(impObj.updatedAt||0) > Number(oldObj.updatedAt||0) && n!==undefined && n!==o) out.push(f); }
            else { if(n!==undefined && n!==o) out.push(f); }
        }); return out;
    }
    function applyMergePlanAdvanced(plan, opt){
        const merge=opt?.merge||'overwrite'; const list=store.get(); undo.push(list);
        const byId=new Map(list.map(x=>[x.id,x]));
        for(const u of plan.updates){
            const old=byId.get(u.id); if(!old) continue; let patch={};
            if(merge==='onlyEmpty'){ for(const k of Object.keys(u.imp)) if(old[k]==null||old[k]==='') patch[k]=u.imp[k]; }
            else if(merge==='newer'){ if(Number(u.imp.updatedAt||0) > Number(old.updatedAt||0)) patch={...u.imp}; }
            else patch={...u.imp};
            byId.set(u.id,{...old,...patch,id:old.id,updatedAt:now()});
        }
        for(const a of plan.adds){ const id=Date.now()+Math.floor(Math.random()*1000); byId.set(id,{id,updatedAt:now(),...a.imp}); }
        store.set(Array.from(byId.values()));
    }
    function showMergePreviewAdvanced(plan, opt){
        const items=[
            ...plan.updates.map(u=>`<div class="pv-row" style="display:flex;gap:8px;padding:8px 10px;border-bottom:1px solid var(--bd);font-size:12px"><span style="background:#dbeafe;color:#1e40af;border-radius:999px;padding:2px 8px">覆盖</span><span style="min-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.imp.email || u.old.email || '(无邮箱)'}</span><div>${u.changes.map(f=>`<span style="background:var(--panel);border:1px solid var(--bd);border-radius:6px;padding:2px 6px">${f}</span>`).join('')||'<span style="background:var(--panel);border:1px solid var(--bd);border-radius:6px;padding:2px 6px">无差异</span>'}</div></div>`),
            ...plan.adds.map(a=>`<div class="pv-row" style="display:flex;gap:8px;padding:8px 10px;border-bottom:1px solid var(--bd);font-size:12px"><span style="background:#dcfce7;color:#166534;border-radius:999px;padding:2px 8px">新增</span><span style="min-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.imp.email || '(无邮箱)'}</span><div><span style="background:var(--panel);border:1px solid var(--bd);border-radius:6px;padding:2px 6px">新增条目</span></div></div>`)
        ].join('');
        const html = `
      <div style="padding:12px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-weight:700">合并预览（策略：${opt.merge}，去重：${opt.dedup}）</div>
          <div><button id="dlg-cancel" class="btn btn-ghost">取消</button><button id="dlg-apply" class="btn btn-primary">应用合并</button></div>
        </div>
        <div style="max-height:60vh;overflow:auto;border:1px solid var(--bd);border-radius:10px;background:var(--bg)">${items || '<div class="empty-state" style="padding:20px;color:var(--muted)">无可合并内容</div>'}</div>
      </div>`;
        const el=ui.show(html); const ov=$('#aug-overlay'); const close=()=>{ try{el.remove();}catch{} try{ov.remove();}catch{} actions.manage(false); };
        $('#dlg-cancel').onclick=close; $('#dlg-apply').onclick=()=>{ applyMergePlanAdvanced(plan,opt); close(); };
    }

    const oauth = {
        async start(){
            const email = await (function(){
                return new Promise((resolve)=>{
                    const html = `
            <div style="padding:10px 6px">
              <div style="display:flex;gap:8px;align-items:center">
                <input id="dlg-name" style="flex:1;padding:8px 10px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--fg)" placeholder="邮箱本地名 或 完整邮箱"/>
                <select id="dlg-domain" style="padding:8px 10px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--fg)">
                  <option value="@outlook.com">@outlook.com</option>
                  <option value="@gmail.com">@gmail.com</option>
                  <option value="@hotmail.com">@hotmail.com</option>
                </select>
              </div>
              <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
                <button id="dlg-cancel" class="btn btn-secondary">取消</button>
                <button id="dlg-ok" class="btn btn-primary">确定</button>
              </div>
            </div>`;
                    const el=ui.show(html); const ov=$('#aug-overlay');
                    const name=$('#dlg-name'), domain=$('#dlg-domain');
                    const close=()=>{ try{el.remove();}catch{} try{ov.remove();}catch{} };
                    const submit=()=>{ let v=(name.value||'').trim(); if(!v) return; if(v.includes('@')){ close(); resolve(v); } else { close(); resolve(v+(domain.value||'@outlook.com')); } };
                    $('#dlg-ok').onclick=submit; $('#dlg-cancel').onclick=()=>{ close(); resolve(''); };
                    el.addEventListener('keydown',e=>{ if(e.key==='Enter') submit(); }); name.focus();
                });
            })();
            if (!email || !email.includes('@')) return;
            const verifier = rand(64), challenge = b64url(await sha256(verifier)), state = rand(16);
            GM_setValue('oauth', JSON.stringify({ verifier, challenge, state, email }));
            const qs = new URLSearchParams({ response_type:'code', client_id: CFG.clientID, code_challenge: challenge, code_challenge_method: 'S256', state, prompt:'login' });
            window.open(`${CFG.authURL}?${qs}`);
        },
        async token(tenant, code){
            const { verifier } = json(GM_getValue('oauth','{}')) || {};
            if (!verifier) throw '认证状态丢失';
            const url = tenant.endsWith('/') ? `${tenant}token` : `${tenant}/token`;
            const res = await http(url, { method:'POST', headers:{'Content-Type':'application/json'}, data:{ grant_type:'authorization_code', client_id:CFG.clientID, code_verifier:verifier, redirect_uri:'', code } });
            return res.access_token || (()=>{ throw '获取令牌失败'; })();
        }
    };

    const balance = {
        async getBanStatus(tenant, token){
            if (!tenant || !token) return 'ERROR';
            const url = tenant.endsWith('/') ? `${tenant}api/v1/me` : `${tenant}/api/v1/me`;
            try { await http(url, { headers:{ 'Authorization': `Bearer ${token}` } }); return 'OK'; }
            catch (status){ if(status===404) return 'OK'; if(status===403) return 'BANNED'; if(status===402) return 'EXPIRED'; return 'ERROR'; }
        },
        async info(token){
            const sub = await http(`${CFG.orbAPI}/subscriptions_from_link?token=${token}`);
            const item = sub.data?.[0]; const customer=item?.customer; if(!customer) throw '订阅信息错误';
            const bal = await http(`${CFG.orbAPI}/customers/${customer.id}/ledger_summary?pricing_unit_id=${CFG.pricingUnit}&token=${token}`);
            let included; try{ const pi=(item.price_intervals||[]).find(x=>x.allocation && x.allocation.pricing_unit?.id===CFG.pricingUnit); included=pi?.allocation?.amount; }catch{}
            return { email: customer.email, balance: bal.credits_balance, endDate: item.end_date, included };
        },
        async check(cred){
            try{
                if (cred.token && cred.tenant) {
                    const s = await this.getBanStatus(cred.tenant, cred.token);
                    if (s==='BANNED' || s==='EXPIRED'){
                        store.update(cred.id,{
                            status: s,
                            lastBalance: null,
                            lastIncluded: null
                        });
                        hist.push(cred.id,{status:s});
                        return s;
                    }
                }
                if (!cred.subToken){
                    store.update(cred.id,{status:'NO_TOKEN'});
                    hist.push(cred.id,{status:'NO_TOKEN'});
                    return 'NO_TOKEN';
                }
                const info=await this.info(cred.subToken);
                const expired = info.endDate && Date.now()>new Date(info.endDate);
                const status = expired?'EXPIRED': info.balance<=0?'NO_BALANCE':'ACTIVE';
                store.update(cred.id,{
                    status,
                    lastBalance:info.balance,
                    lastEndDate:info.endDate,
                    lastIncluded:info.included
                });
                hist.push(cred.id,{status,balance:info.balance});
                return status;
            } catch {
                store.update(cred.id,{status:'ERROR'});
                hist.push(cred.id,{status:'ERROR'});
                return 'ERROR';
            }
        }
    };

    const cardLoading = {
        on(id){
            const card=$(`.card[data-id="${id}"]`); if(!card) return;
            let tag=card.querySelector('.card-loading');
            if(!tag){ tag=document.createElement('span'); tag.className='card-loading'; tag.innerHTML='<span class="spin"></span><span>检测中…</span>'; card.appendChild(tag); }
            const btn = card.querySelector(`[data-check="${id}"]`); if(btn){ btn.disabled=true; btn.dataset.t=btn.textContent; btn.textContent='检测中…'; }
            card.querySelector('.check-badge')?.classList.remove('show');
        },
        off(id){
            const card=$(`.card[data-id="${id}"]`); if(!card) return;
            card.querySelector('.card-loading')?.remove();
            const btn = card.querySelector(`[data-check="${id}"]`); if(btn){ btn.disabled=false; btn.textContent=btn.dataset.t||'检测'; }
            const chk=card.querySelector('.check-badge'); if(chk){ chk.classList.add('show'); setTimeout(()=>chk.classList.remove('show'),1200); }
        }
    };
    async function runPool(tasks, limit=CFG.CONCURRENCY){return new Promise(resolve=>{let i=0,r=0,d=0;const next=()=>{while(r<limit&&i<tasks.length){const idx=i++;r++;tasks[idx]().finally(()=>{r--;d++;next();});} if(d===tasks.length) resolve();}; next();});}

    const actions = {
        auth: () => oauth.start(),
        async manage(force=false){
            const creds=store.get();
            if(!creds.length){
                const html=`<div class="header-stats"><div class="stat-item">🔑 <span>凭证管理</span></div><div style="margin-left:auto"><button id="act-auth" class="btn btn-secondary">获取令牌</button><button id="act-import" class="btn btn-ghost">导入</button><button id="act-sync" class="btn btn-ghost">☁️ 云同步</button></div></div><div class="empty-state" style="padding:20px;color:var(--muted)">暂无凭证</div>`;
                ui.show(html); $('#act-auth').onclick=()=>actions.auth(); $('#act-import').onclick=()=>importers.open(); $('#act-sync').onclick=()=>actions.sync(); return;
            }
            const statuses={}; if(force) await Promise.all(creds.map(async c=>statuses[c.id]=await balance.check(c)));
            const updated=store.get(); if(!force) updated.forEach(c=>statuses[c.id]=c.status);

            // 排序 key
            const endKey = (c) => {
                if (!c.lastEndDate) return Infinity;
                const t = new Date(c.lastEndDate).getTime();
                return isNaN(t) ? Infinity : t;
            };

            // 分组：正常/失效
            const sorted = updated.slice();
            if (view.sort==='end.asc') sorted.sort((a,b)=> endKey(a) - endKey(b));
            else if (view.sort==='added.desc') sorted.sort((a,b)=>Number(b.id)-Number(a.id));
            else if (view.sort==='added.asc') sorted.sort((a,b)=>Number(a.id)-Number(b.id));

            const normalList = sorted.filter(c => !isInvalid(statuses[c.id]||c.status));
            const invalidList = sorted.filter(c =>  isInvalid(statuses[c.id]||c.status));

            // 统计
            const active = sorted.filter(c => (statuses[c.id]||c.status)==='ACTIVE').length;
            const abnormal = sorted.filter(c => ['EXPIRED','NO_BALANCE','ERROR','BANNED'].includes(statuses[c.id]||c.status)).length;
            const noToken = sorted.filter(c => (statuses[c.id]||c.status)==='NO_TOKEN').length;
            const total = sorted.reduce((s,c)=>s+(Number(c.lastIncluded)||0),0);
            const used  = sorted.reduce((s,c)=>s+(Number(c.lastIncluded||0)-Number(c.lastBalance||0) || 0),0);

            // 分页仅作用于“正常区”
            const size=view.size, pages=Math.max(1,Math.ceil(normalList.length/size)); view.page=Math.min(Math.max(1,view.page),pages);
            const slice = normalList.slice((view.page-1)*size, (view.page-1)*size+size);

            const head = ui.header(sorted,{active,abnormal,noToken,total,used});
            const normalCards = slice.map(c=>ui.card(c, statuses[c.id])).join('') || '<div class="empty-state" style="padding:12px;color:var(--muted)">本页无记录</div>';
            const invalidCards = invalidList.map(c=>ui.card(c, statuses[c.id])).join('') || '<div class="empty-state" style="padding:12px;color:var(--muted)">暂无失效</div>';

            const bodyHTML = [
                ui.section('✅ 正常 / 可用（分页）', `<div class="cards">${normalCards}</div>${ui.pager(view.page, pages)}`, false, false, normalList.length > 0 ? `<button id="check-normal" class="btn btn-primary" style="margin-left: 8px;">一键检测</button>` : ''),
                ui.section('🔒 失效（点击展开）', `<div class="cards">${invalidCards}</div>`, true, true)
            ].join('');

            const el = ui.show(head + bodyHTML);

            // 顶部按钮
            $('#act-auth').onclick=()=>actions.auth();
            $('#act-check').onclick=()=>actions.batch();
            $('#act-import').onclick=()=>importers.open();
            $('#act-export').onclick=()=>exporters.open(updated);
            $('#act-sync').onclick=()=>actions.sync();
            $('#act-undo').onclick=()=>{ const s=undo.pop(); if(s){ store.set(s); actions.manage(false);} };
            $('#sortsel').onchange=e=>{ view.sort=e.target.value; actions.manage(false); };

            // 选择/批量
            $('#sel-clear').onclick=()=>{ select.clear(); $('#sel-count').textContent=0; };
            $('#sel-del').onclick=()=>{ if(!select.size) return; if(!confirm(`删除 ${select.size} 条？`)) return; store.set(store.get().filter(x=>!select.has(x.id))); select.clear(); actions.manage(false); };
            $('#sel-export').onclick=()=>{ if(!select.size) return; exporters.open(store.get().filter(x=>select.has(x.id))); };
            $('#sel-check').onclick=()=>{ if(!select.size) return; actions.batch([...select]); };

            // 检测所有正常凭证按钮
            $('#check-normal')?.addEventListener('click', () => {
                const normalIds = normalList.map(c => c.id);
                if (normalIds.length > 0) {
                    actions.batch(normalIds);
                }
            });

            // 事件绑定（全局，因为两栏都有卡片）
            $$('.selbox').forEach(cb=>cb.onchange=e=>{ const id=Number(e.target.dataset.id); if(e.target.checked) select.add(id); else select.delete(id); $('#sel-count').textContent=select.size; });
            $$('[data-del]').forEach(x=>x.onclick=()=>confirm('确定删除？')&&(store.del(+x.dataset.del), actions.manage(false)));
            $$('[data-check]').forEach(x=>x.onclick=()=>actions.check(+x.dataset.check));
            $$('.line.copy').forEach(line=>{
                line.addEventListener('click', ()=>{
                    const val = line.dataset.copy ?? line.querySelector('.v')?.textContent ?? '';
                    copy(val);
                    line.classList.add('copied'); setTimeout(()=>line.classList.remove('copied'), 700);
                });
            });

            // 分页
            $('#pg-prev')?.addEventListener('click',()=>{ if(view.page>1){ view.page--; actions.manage(false);} });
            $('#pg-next')?.addEventListener('click',()=>{ if(view.page<pages){ view.page++; actions.manage(false);} });

            // 折叠功能
            $$('.section-title[data-collapsible="true"]').forEach(title => {
                title.addEventListener('click', () => {
                    const section = title.parentElement;
                    const content = section.querySelector('.section-content');
                    const icon = title.querySelector('.toggle-icon');

                    if (title.classList.contains('collapsed')) {
                        // 展开
                        title.classList.remove('collapsed');
                        content.classList.remove('collapsed');
                        icon.textContent = '▼';
                        // 更新标题文字
                        const titleText = title.textContent.replace('（点击展开）', '（点击关闭）');
                        title.innerHTML = `<span class="toggle-icon">▼</span>${titleText}`;
                    } else {
                        // 收起
                        title.classList.add('collapsed');
                        content.classList.add('collapsed');
                        icon.textContent = '▶';
                        // 更新标题文字
                        const titleText = title.textContent.replace('（点击关闭）', '（点击展开）');
                        title.innerHTML = `<span class="toggle-icon">▶</span>${titleText}`;
                    }
                });
            });
        },
        async check(id){
            const cred=store.get().find(x=>x.id===id); if(!cred) return;
            try{ cardLoading.on(id); await balance.check(cred); } finally { cardLoading.off(id); actions.manage(false); }
        },
        async batch(ids){
            const creds=store.get();
            const list = Array.isArray(ids)&&ids.length ? creds.filter(c=>ids.includes(c.id)) : creds;
            if(!list.length) return;
            list.forEach(c=>cardLoading.on(c.id));
            const tasks=list.map(c=>async()=>{ try{ await balance.check(c); } catch {} });
            await runPool(tasks, CFG.CONCURRENCY);
            list.forEach(c=>cardLoading.off(c.id));
            actions.manage(false);
        },
        sync() {
            showSyncDialog();
        }
    };

    function getEmailFromPage() {
        const el = document.querySelector('.base-header-email');
        if (el?.textContent) return el.textContent.trim();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
        let t; while (t = walker.nextNode()) { const m = re.exec(t.textContent || ''); if (m) return m[0]; }
        return '';
    }
    function extractTokenFromURL(href){
        try { const u = new URL(href, location.origin); const tk = u.searchParams.get('token'); return tk || ''; } catch { return ''; }
    }
    function scanSubTokenOnce(){
        for (const a of document.querySelectorAll('a[href]')) {
            const href = a.getAttribute('href') || '';
            if (/token=/.test(href) || /withorb\.com/.test(href)) {
                const tk = extractTokenFromURL(a.href || href);
                if (tk) return tk;
                const m = href.match(/[?&]token=([A-Za-z0-9._~-]+)/) || href.match(/([A-Za-z0-9._~-]{16,})/);
                if (m && m[1]) return m[1];
            }
        }
        for (const s of document.querySelectorAll('script')) {
            const t = s.textContent || '';
            const m = t.match(/token=([A-Za-z0-9._~-]+)/);
            if (m && m[1]) return m[1];
        }
        try {
            const dump = JSON.stringify(window.__NEXT_DATA__ || window.__APP_DATA__ || {});
            const m = dump.match(/token%3D([A-Za-z0-9._~-]+)/) || dump.match(/token=([A-Za-z0-9._~-]+)/);
            if (m && m[1]) return m[1];
        } catch {}
        return '';
    }
    async function waitForToken(maxMs=15000){
        let tk = scanSubTokenOnce();
        if (tk) return tk;
        let resolveFn;
        const p = new Promise(res => (resolveFn = res));
        const obs = new MutationObserver((ml) => {
            for(const m of ml){
                if (m.addedNodes?.length) {
                    tk = scanSubTokenOnce();
                    if (tk) { cleanup(); resolveFn(tk); return; }
                }
            }
        });
        function cleanup(){ try{obs.disconnect();}catch{} clearInterval(timer); clearTimeout(timeout); }
        try { obs.observe(document.body, { childList:true, subtree:true }); } catch {}
        const timer = setInterval(() => { const t = scanSubTokenOnce(); if (t) { cleanup(); resolveFn(t); } }, 800);
        const timeout = setTimeout(() => { cleanup(); resolveFn(''); }, maxMs);
        return p;
    }
    async function saveSubTokenToStore(email, subToken){
        const creds = store.get();
        let target = creds.find(c => c.email === email);
        if (!target) target = creds.filter(c => !c.subToken).sort((a,b)=>b.id-a.id)[0];
        if (target) { store.update(target.id, { subToken }); return true; }
        return false;
    }

    const pages = {
        async loginIdentifier(){
            const { email } = json(GM_getValue('oauth','{}')) || {}; if(!email) return;
            let input; for(let i=0;i<40;i++){ input=document.querySelector('#username'); if(input) break; await sleep(500); }
            if(!input) return; input.value=email; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); input.readOnly=true; input.setAttribute('aria-readonly','true');
        },
        async terms(){
            const { email } = json(GM_getValue('oauth','{}')) || {}; if(!email) return;
            let code, tenant; for (const s of document.scripts){ const t=s.textContent; if(t.includes('code:')&&t.includes('tenant_url:')){ code=t.match(/code:\s*["']([^"']+)["']/)?.[1]; tenant=t.match(/tenant_url:\s*["']([^"']+)["']/)?.[1]; if(code&&tenant) break; } }
            if(!code||!tenant) return;
            try{ const token=await oauth.token(tenant, code); store.add({ tenant, token, email }); GM_setValue('oauth',''); setTimeout(()=>location.href='https://app.augmentcode.com/account/subscription', 800); } catch {}
        },
        async subscription(){
            const email = getEmailFromPage() || (json(GM_getValue('oauth','{}'))||{}).email || '';
            const subToken = await waitForToken(15000);
            if (subToken) {
                const ok = await saveSubTokenToStore(email, subToken);
                actions.manage(false);
                ui.toast(ok ? '✅ 凭证已添加并绑定订阅' : '⚠️ 已获取订阅令牌，但未找到匹配凭证');
            } else {
                ui.toast('⚠️ 未检测到订阅令牌');
            }
        }
    };

    GM_registerMenuCommand('🚀 获取令牌', () => actions.auth());
    // 云同步对话框
    function showSyncDialog() {
        const config = gistSync.getConfig();

        const html = `
        <div style="padding:16px">
          <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:16px">
            <div style="font-weight:700">☁️ GitHub Gist 云同步</div>
            <button id="sync-close" class="btn btn-ghost">✕</button>
          </div>

          <div style="display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:center;margin-bottom:16px">
            <label style="color:var(--fg);font-weight:500">GitHub Token:</label>
            <input id="sync-token" type="password" placeholder="ghp_xxxxxxxxxxxx" value="${config.token}"
                   style="width:100%;padding:8px 12px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--fg);font-family:ui-monospace,monospace;font-size:12px" />

            <label style="color:var(--fg);font-weight:500">Gist ID:</label>
            <input id="sync-gist-id" placeholder="自动生成或手动输入" value="${config.gistId}"
                   style="width:100%;padding:8px 12px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--fg);font-family:ui-monospace,monospace;font-size:12px" />

            <label style="color:var(--fg);font-weight:500">自动同步:</label>
            <label style="display:flex;align-items:center;gap:8px;color:var(--muted)">
              <input id="sync-auto" type="checkbox" ${config.autoSync ? 'checked' : ''} />
              数据变更时自动上传到云端
            </label>
          </div>

          <div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px">
            <button id="sync-test" class="btn btn-primary">🔗 测试连接</button>
            <button id="sync-save" class="btn btn-secondary">💾 保存配置</button>
            <button id="sync-clear" class="btn btn-ghost">🗑️ 清除配置</button>
          </div>

          <div style="border-top:1px solid var(--bd);padding-top:16px">
            <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px">
              <button id="sync-upload" class="btn btn-primary">⬆️ 上传到云端</button>
              <button id="sync-preview" class="btn btn-secondary">👁️ 预览云端</button>
              <button id="sync-download" class="btn btn-secondary">⬇️ 下载覆盖</button>
            </div>
            <div id="sync-status" style="text-align:center;font-size:12px;color:var(--muted);min-height:20px"></div>
          </div>
        </div>`;

        ui.show(html);

        const showStatus = (msg, type = 'info') => {
            const el = $('#sync-status');
            if (!el) return;
            el.textContent = msg;
            el.style.color = type === 'error' ? '#ef4444' : type === 'success' ? '#16a34a' : 'var(--muted)';
        };

        // 绑定事件
        $('#sync-close').onclick = () => $('#aug-overlay').remove();

        $('#sync-test').onclick = async () => {
            const token = $('#sync-token').value.trim();
            if (!token) {
                showStatus('请先输入 GitHub Token', 'error');
                return;
            }

            showStatus('正在测试连接...', 'info');

            try {
                const result = await gistSync.testConnection(token);
                showStatus(result.message, result.success ? 'success' : 'error');
            } catch (error) {
                showStatus(`测试失败: ${error.message}`, 'error');
            }
        };

        $('#sync-save').onclick = () => {
            const newConfig = {
                token: $('#sync-token').value.trim(),
                gistId: $('#sync-gist-id').value.trim(),
                autoSync: $('#sync-auto').checked
            };

            if (gistSync.setConfig(newConfig)) {
                showStatus('配置已保存', 'success');
            } else {
                showStatus('保存配置失败', 'error');
            }
        };

        $('#sync-clear').onclick = () => {
            if (confirm('确定要清除所有同步配置吗？')) {
                gistSync.setConfig({ token: '', gistId: '', autoSync: false });
                $('#sync-token').value = '';
                $('#sync-gist-id').value = '';
                $('#sync-auto').checked = false;
                showStatus('配置已清除', 'success');
            }
        };

        $('#sync-upload').onclick = async () => {
            const token = $('#sync-token').value.trim();
            if (!token) {
                showStatus('请先输入 GitHub Token', 'error');
                return;
            }

            showStatus('正在上传到云端...', 'info');

            try {
                const newConfig = {
                    token: token,
                    gistId: $('#sync-gist-id').value.trim(),
                    autoSync: $('#sync-auto').checked
                };
                gistSync.setConfig(newConfig);

                const result = await gistSync.sync('upload');
                $('#sync-gist-id').value = result.gistId;

                showStatus(`✅ 上传成功！已同步 ${result.count} 个凭证`, 'success');
            } catch (error) {
                showStatus(`❌ 上传失败: ${error.message}`, 'error');
            }
        };

        $('#sync-preview').onclick = async () => {
            const token = $('#sync-token').value.trim();
            const gistId = $('#sync-gist-id').value.trim();

            if (!token || !gistId) {
                showStatus('请先输入 GitHub Token 和 Gist ID', 'error');
                return;
            }

            showStatus('正在获取云端数据...', 'info');

            try {
                const cloudData = await gistSync.download(token, gistId);
                $('#aug-overlay').remove();
                showCloudDataPreview(cloudData);
            } catch (error) {
                showStatus(`❌ 获取失败: ${error.message}`, 'error');
            }
        };

        $('#sync-download').onclick = async () => {
            const token = $('#sync-token').value.trim();
            const gistId = $('#sync-gist-id').value.trim();

            if (!token || !gistId) {
                showStatus('请先输入 GitHub Token 和 Gist ID', 'error');
                return;
            }

            if (!confirm('下载将覆盖本地数据，确定继续吗？')) {
                return;
            }

            showStatus('正在从云端下载...', 'info');

            try {
                const newConfig = {
                    token: token,
                    gistId: gistId,
                    autoSync: $('#sync-auto').checked
                };
                gistSync.setConfig(newConfig);

                const result = await gistSync.sync('download');

                showStatus(`✅ 下载成功！已同步 ${result.count} 个凭证`, 'success');

                setTimeout(() => {
                    $('#aug-overlay').remove();
                    actions.manage(false);
                }, 1500);
            } catch (error) {
                showStatus(`❌ 下载失败: ${error.message}`, 'error');
            }
        };
    }

    // 云端数据预览对话框
    function showCloudDataPreview(cloudData) {
        const { data, lastSync } = cloudData;
        const localData = store.get();

        const html = `
        <div style="padding:16px">
          <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:16px">
            <div style="font-weight:700">☁️ 云端数据预览</div>
            <button id="preview-close" class="btn btn-ghost">✕</button>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <div style="background:var(--panel);border:1px solid var(--bd);border-radius:8px;padding:12px">
              <h4 style="margin:0 0 8px 0;color:var(--fg)">📱 本地数据</h4>
              <div style="color:var(--muted);font-size:12px">总计: ${localData.length} 个凭证</div>
            </div>
            <div style="background:var(--panel);border:1px solid var(--bd);border-radius:8px;padding:12px">
              <h4 style="margin:0 0 8px 0;color:var(--fg)">☁️ 云端数据</h4>
              <div style="color:var(--muted);font-size:12px">
                总计: ${data.length} 个凭证<br>
                最后同步: ${lastSync ? new Date(lastSync).toLocaleString() : '未知'}
              </div>
            </div>
          </div>

          <div style="background:var(--panel);border:1px solid var(--bd);border-radius:8px;padding:12px;margin-bottom:16px">
            <h4 style="margin:0 0 8px 0;color:var(--fg)">📋 云端凭证预览 ${data.length > 5 ? `(显示前5个，共${data.length}个)` : `(共${data.length}个)`}</h4>
            <div style="max-height:200px;overflow-y:auto">
              ${data.length > 0 ? data.slice(0, 5).map(cred => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin:2px 0;border-radius:4px;background:var(--chip)">
                  <div>
                    <strong>${cred.email || `ID:${cred.id}`}</strong>
                    <div style="font-size:10px;color:var(--muted)">状态: ${cred.status || '未知'}</div>
                  </div>
                </div>
              `).join('') : '<div style="text-align:center;color:var(--muted);padding:20px">云端暂无凭证数据</div>'}
            </div>
          </div>

          <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px">
            <button id="preview-download" class="btn btn-primary">⬇️ 确认下载并覆盖本地</button>
            <button id="preview-merge" class="btn btn-secondary">🔄 智能合并（推荐）</button>
            <button id="preview-cancel" class="btn btn-ghost">❌ 取消</button>
          </div>

          <div style="background:var(--chip);border-radius:6px;padding:8px;font-size:11px;color:var(--muted)">
            <strong>💡 操作说明：</strong><br>
            • <strong>确认下载：</strong>完全覆盖本地数据<br>
            • <strong>智能合并：</strong>保留本地数据，仅添加云端新增的凭证<br>
            • <strong>取消：</strong>关闭预览，不进行任何操作
          </div>
        </div>`;

        ui.show(html);

        $('#preview-close').onclick = () => $('#aug-overlay').remove();
        $('#preview-cancel').onclick = () => $('#aug-overlay').remove();

        $('#preview-download').onclick = async () => {
            try {
                store.set(data);
                $('#aug-overlay').remove();
                actions.manage(false);
            } catch (error) {
                console.error('下载失败:', error);
            }
        };

        $('#preview-merge').onclick = async () => {
            try {
                const mergedData = [...localData];
                let addedCount = 0;
                let updatedCount = 0;

                data.forEach(cloudCred => {
                    const existingIndex = mergedData.findIndex(c => c.id === cloudCred.id);
                    if (existingIndex >= 0) {
                        if ((cloudCred.updatedAt || 0) >= (mergedData[existingIndex].updatedAt || 0)) {
                            mergedData[existingIndex] = cloudCred;
                            updatedCount++;
                        }
                    } else {
                        mergedData.push(cloudCred);
                        addedCount++;
                    }
                });

                store.set(mergedData);
                $('#aug-overlay').remove();
                actions.manage(false);
            } catch (error) {
                console.error('合并失败:', error);
            }
        };
    }

    GM_registerMenuCommand('🔑 管理凭证', () => actions.manage(false));

    if (location.href.includes('login.augmentcode.com/u/login/identifier')) setTimeout(pages.loginIdentifier, 500);
    if (location.pathname.includes('terms-accept')) setTimeout(pages.terms, 1000);
    if (location.href.includes('app.augmentcode.com/account/subscription')) setTimeout(pages.subscription, 600);

    document.addEventListener('keydown', e => {
        if (['INPUT','TEXTAREA'].includes((e.target.tagName||'').toUpperCase())) return;
        if (e.key.toLowerCase() === 'g') actions.manage(false);
    });
})();
