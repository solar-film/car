(function () {
    'use strict';
    const SIGNAL_KEY = 'carCrmAuthChanged';
    const listeners = new Set();
    let authenticated = false;
    let generation = 0;
    function signal() {
        try { window.localStorage.setItem(SIGNAL_KEY, String(Date.now()) + ':' + Math.random()); } catch (_) {}
    }
    async function request(action, input) {
        if (!/^https?:$/.test(window.location.protocol)) throw new Error('กรุณาเปิด CAR_CRM ผ่านเซิร์ฟเวอร์ ไม่ใช่เปิดไฟล์ HTML โดยตรง');
        const response = await fetch(new URL('api/crm-auth/' + action, window.location.href), {
            method: input ? 'POST' : 'GET', credentials:'same-origin', cache:'no-store',
            headers: input ? {'Content-Type':'application/json'} : {},
            body: input ? JSON.stringify(input) : undefined, signal:AbortSignal.timeout(10000)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'ตรวจสิทธิ์ CAR_CRM ไม่สำเร็จ');
        return result;
    }
    async function refresh() {
        const current = ++generation;
        try {
            const result = await request('session');
            if (current !== generation) return authenticated;
            const wasAuthenticated = authenticated;
            authenticated = result.authenticated === true;
            if (authenticated && !wasAuthenticated) listeners.forEach(callback => callback());
            if (!authenticated && wasAuthenticated) window.location.reload();
        } catch (_) {
            if (current === generation) {
                const wasAuthenticated = authenticated;
                authenticated = false;
                if (wasAuthenticated) window.location.reload();
            }
        }
        return authenticated;
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
    window.addEventListener('storage',event => { if (event.key === SIGNAL_KEY || event.key === 'carCrmLoggedIn') refresh(); });
    window.addEventListener('focus',refresh);
    try { window.localStorage.removeItem('carCrmLoggedIn'); } catch (_) {}
    window.CarCrmAuth = Object.freeze({isLoggedIn:() => authenticated,login,logout,onLogin,refresh,request});
    refresh();
})();
