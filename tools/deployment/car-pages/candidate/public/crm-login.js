(async function () {
    'use strict';
    const auth = window.CarCrmAuth;
    const candidate = new URLSearchParams(location.search).get('next') || 'index.html';
    const next = /^[a-zA-Z0-9_-]+\.html(?:\?[^#]*)?(?:#.*)?$/.test(candidate) && !candidate.startsWith('crm-login.html') ? candidate : 'index.html';
    const needsCommission = next.split(/[?#]/)[0] === 'technician-commission.html';
    let commission = false;
    const button = document.getElementById('loginButton');
    function commissionForm() {
        commission = true;
        document.getElementById('userField').hidden = true;
        document.getElementById('loginUser').required = false;
        document.getElementById('loginPass').value = '';
        document.getElementById('loginMessage').textContent = 'ใส่รหัสเข้าหน้าคำนวณค่าคอมช่าง';
    }
    document.getElementById('loginForm').addEventListener('submit',async event => {
        event.preventDefault(); if (button.disabled) return;
        button.disabled = true;
        document.getElementById('loginError').textContent = '';
        try {
            if (commission) {
                await auth.request('commission',{password:document.getElementById('loginPass').value});
            } else {
                if (!await auth.login(document.getElementById('loginUser').value,document.getElementById('loginPass').value)) return;
                if (needsCommission) { commissionForm(); return; }
            }
            location.replace(next);
        } catch (error) { document.getElementById('loginError').textContent = error.message; }
        finally { button.disabled = false; }
    });
    try {
        const session = await auth.request('session');
        if (session.authenticated) {
            if (needsCommission && !session.commission) commissionForm();
            else location.replace(next);
        }
    } catch (error) { document.getElementById('loginError').textContent = error.message; }
})();
