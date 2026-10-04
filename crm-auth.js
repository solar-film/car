(function () {
    'use strict';
    const SIGNAL_KEY = 'carCrmAuthChanged';
    const TOKEN_KEY = 'carCrmSession';
    const CLIENT_KEY = 'carCrmAuthClient';
    const cloud = window.location.hostname === 'solar-film.github.io' || document.currentScript?.dataset.transport === 'apps-script';
    const endpoint = 'https://script.google.com/macros/s/AKfycbwH0Vw5qzVO3YDsibqi_EF8KScpL5e0-wp8mYXxgqSj_3wjqH8QG5CyFOse4-Q18o3Rgg/exec?crmAuth=1';
    const listeners = new Set();
    let authenticated = false;
    let generation = 0;
    let memoryToken = '', memoryClient = '', verifiedUntil = 0;
    let refreshPending = null;
    function stored(key) { try { return window.localStorage.getItem(key) || ''; } catch (_) { return ''; } }
    function rememberToken(token) {
        memoryToken = token;
        try { if (token) window.localStorage.setItem(TOKEN_KEY, token); else window.localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    }
    function clientId() {
        const value = stored(CLIENT_KEY) || memoryClient;
        if (/^[a-f0-9]{32}$/.test(value)) return value;
        memoryClient = Array.from(window.crypto.getRandomValues(new Uint8Array(16)),b => b.toString(16).padStart(2,'0')).join('');
        try { window.localStorage.setItem(CLIENT_KEY,memoryClient); } catch (_) {}
        return memoryClient;
    }
    function signal() {
        try { window.localStorage.setItem(SIGNAL_KEY, String(Date.now()) + ':' + Math.random()); } catch (_) {}
    }
    async function request(action, input) {
        if (!/^https?:$/.test(window.location.protocol)) throw new Error('กรุณาเปิด CAR_CRM ผ่านเซิร์ฟเวอร์ ไม่ใช่เปิดไฟล์ HTML โดยตรง');
        const payload = cloud ? {...input,action,sessionToken:stored(TOKEN_KEY) || memoryToken,clientId:clientId()} : input;
        const response = await fetch(cloud ? endpoint : new URL('api/crm-auth/' + action, window.location.href), {
            method: cloud || input ? 'POST' : 'GET', credentials:cloud ? 'omit' : 'same-origin', cache:'no-store',
            headers: payload ? {'Content-Type':cloud ? 'text/plain;charset=UTF-8' : 'application/json'} : {},
            body: payload ? JSON.stringify(payload) : undefined, signal:AbortSignal.timeout(cloud ? 30000 : 10000)
        });
        const result = await response.json();
        if (!response.ok || result.ok === false) throw new Error(result.error || 'ตรวจสิทธิ์ CAR_CRM ไม่สำเร็จ');
        if (cloud && action === 'login' && result.authenticated && /^[A-Za-z0-9_-]{43}$/.test(result.sessionToken || '')) rememberToken(result.sessionToken);
        if (cloud && result.authenticated) verifiedUntil = Number(result.expiresAt) || 0;
        if (cloud && action === 'logout') rememberToken('');
        return result;
    }
    async function refreshSession() {
        const current = ++generation;
        try {
            const result = await request('session');
            if (current !== generation) return authenticated;
            const wasAuthenticated = authenticated;
            authenticated = result.authenticated === true;
            if (cloud && !authenticated) rememberToken('');
            if (authenticated && !wasAuthenticated) listeners.forEach(callback => callback());
            if (!authenticated && wasAuthenticated) window.location.reload();
        } catch (_) {
            if (current === generation) {
                // A temporary network failure must not reload an already verified page and lose a draft.
                if (authenticated && (!cloud || verifiedUntil > Date.now())) return true;
                const wasAuthenticated = authenticated;
                authenticated = false;
                if (wasAuthenticated) window.location.reload();
            }
        }
        return authenticated;
    }
    function refresh() {
        if (!refreshPending) refreshPending = refreshSession().finally(() => { refreshPending = null; });
        return refreshPending;
    }
    async function login(user, password) {
        ++generation;
        try {
            const result = await request('login',{user,password});
            authenticated = result.authenticated === true;
            if (authenticated) signal();
            return authenticated;
        } catch (error) {
            authenticated = false;
            const label = document.getElementById('loginError');
            if (label) label.textContent = error.message;
            return false;
        }
    }
    async function logout() {
        await request('logout',{});
        ++generation; authenticated = false; signal(); window.location.reload();
    }
    function onLogin(callback) {
        if (typeof callback !== 'function') throw new TypeError('onLogin requires a callback');
        listeners.add(callback);
        return () => listeners.delete(callback);
    }
    window.addEventListener('storage',event => {
        if (cloud && event.key === TOKEN_KEY) memoryToken = event.newValue || '';
        if (event.key === SIGNAL_KEY || event.key === TOKEN_KEY || event.key === 'carCrmLoggedIn') refresh();
    });
    window.addEventListener('focus',refresh);
    try { window.localStorage.removeItem('carCrmLoggedIn'); } catch (_) {}
    window.CarCrmAuth = Object.freeze({isLoggedIn:() => authenticated,login,logout,onLogin,refresh,request});
    refresh();
})();
