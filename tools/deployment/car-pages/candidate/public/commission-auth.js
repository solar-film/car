(function () {
    const STYLE_ID = 'car-crm-commission-auth-styles';
    const MODAL_ID = 'carCrmCommissionAuthModal';

    const defaults = {
        title: 'คำนวณค่าคอมช่าง',
        message: 'ใส่รหัสผ่านเพื่อเข้าสู่หน้าคำนวณค่าคอมช่าง',
        confirmText: 'เข้าสู่หน้า',
        cancelText: 'ยกเลิก',
        errorText: 'Password ไม่ถูกต้อง'
    };

    let activeRequest = null;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            body.commission-auth-open {
                overflow: hidden;
            }

            .commission-auth-modal {
                position: fixed;
                inset: 0;
                z-index: 10000;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 1.25rem;
                background: rgba(15, 23, 42, 0.52);
                backdrop-filter: blur(14px);
            }

            .commission-auth-dialog {
                width: min(100%, 440px);
                overflow: hidden;
                border: 1px solid rgba(148, 163, 184, 0.32);
                border-radius: 18px;
                background: rgba(255, 255, 255, 0.98);
                box-shadow: 0 28px 72px rgba(15, 23, 42, 0.28);
                transform: translateY(6px) scale(0.98);
                opacity: 0;
                animation: commission-auth-enter 160ms ease-out forwards;
            }

            @keyframes commission-auth-enter {
                to {
                    transform: translateY(0) scale(1);
                    opacity: 1;
                }
            }

            .commission-auth-topline {
                height: 4px;
                background: linear-gradient(90deg, #0f766e, #38bdf8);
            }

            .commission-auth-content {
                padding: 1.35rem;
            }

            .commission-auth-header {
                display: flex;
                gap: 0.9rem;
                align-items: flex-start;
            }

            .commission-auth-icon {
                display: inline-flex;
                width: 46px;
                height: 46px;
                flex: 0 0 auto;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(20, 184, 166, 0.24);
                border-radius: 14px;
                background: #ecfdf5;
                color: #0f766e;
            }

            .commission-auth-kicker {
                margin: 0 0 0.2rem;
                color: #0f766e;
                font-size: 0.75rem;
                font-weight: 800;
                letter-spacing: 0;
            }

            .commission-auth-title {
                margin: 0;
                color: #0f172a;
                font-size: 1.28rem;
                font-weight: 800;
                line-height: 1.25;
            }

            .commission-auth-message {
                margin: 0.35rem 0 0;
                color: #64748b;
                font-size: 0.9rem;
                font-weight: 600;
                line-height: 1.55;
            }

            .commission-auth-form {
                margin-top: 1.15rem;
            }

            .commission-auth-label {
                display: block;
                margin-bottom: 0.45rem;
                color: #334155;
                font-size: 0.83rem;
                font-weight: 800;
            }

            .commission-auth-field {
                position: relative;
            }

            .commission-auth-input {
                width: 100%;
                height: 3rem;
                border: 1px solid #cbd5e1;
                border-radius: 12px;
                background: #f8fafc;
                color: #0f172a;
                font: inherit;
                font-size: 1rem;
                font-weight: 700;
                letter-spacing: 0;
                padding: 0 2.8rem 0 0.95rem;
                transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
            }

            .commission-auth-input:focus {
                outline: none;
                border-color: #0f766e;
                background: #ffffff;
                box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.14);
            }

            .commission-auth-input.is-error {
                border-color: #e11d48;
                box-shadow: 0 0 0 4px rgba(225, 29, 72, 0.12);
            }

            .commission-auth-field-icon {
                position: absolute;
                top: 50%;
                right: 0.85rem;
                width: 1.15rem;
                height: 1.15rem;
                color: #94a3b8;
                transform: translateY(-50%);
                pointer-events: none;
            }

            .commission-auth-error {
                display: none;
                margin: 0.5rem 0 0;
                color: #be123c;
                font-size: 0.83rem;
                font-weight: 800;
            }

            .commission-auth-error.is-visible {
                display: block;
            }

            .commission-auth-actions {
                display: flex;
                justify-content: flex-end;
                gap: 0.65rem;
                margin-top: 1.2rem;
            }

            .commission-auth-button {
                min-width: 7.25rem;
                border: 0;
                border-radius: 12px;
                cursor: pointer;
                font: inherit;
                font-size: 0.9rem;
                font-weight: 800;
                padding: 0.78rem 1rem;
                transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
            }

            .commission-auth-button:hover {
                transform: translateY(-1px);
            }

            .commission-auth-button:focus-visible {
                outline: 3px solid rgba(14, 165, 233, 0.28);
                outline-offset: 2px;
            }

            .commission-auth-cancel {
                background: #e0f2fe;
                color: #075985;
            }

            .commission-auth-submit {
                background: #0f766e;
                color: #ffffff;
                box-shadow: 0 12px 24px rgba(15, 118, 110, 0.24);
            }

            .commission-auth-submit:hover {
                background: #0e6b64;
            }

            @media (max-width: 520px) {
                .commission-auth-content {
                    padding: 1.1rem;
                }

                .commission-auth-actions {
                    flex-direction: column-reverse;
                }

                .commission-auth-button {
                    width: 100%;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureModal() {
        ensureStyles();

        let modal = document.getElementById(MODAL_ID);
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'commission-auth-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'commissionAuthTitle');
        modal.innerHTML = `
            <div class="commission-auth-dialog" role="document">
                <div class="commission-auth-topline"></div>
                <div class="commission-auth-content">
                    <div class="commission-auth-header" style="flex-direction: column; align-items: center; justify-content: center; margin-bottom: 1rem; gap: 0.5rem;">
                        <div class="commission-auth-icon" aria-hidden="true">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="5" y="10" width="14" height="10" rx="2"></rect>
                                <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
                                <path d="M12 14v2"></path>
                            </svg>
                        </div>
                        <div style="text-align: center;">
                            <p style="color: #475569; font-size: 0.95rem; font-weight: 600; margin: 0;">กรุณากรอก password เพื่อเข้าใช้งาน</p>
                        </div>
                        <div style="display: none;">
                            <h2 id="commissionAuthTitle" class="commission-auth-title" data-auth-title></h2>
                            <p class="commission-auth-message" data-auth-message></p>
                        </div>
                    </div>
                    <form class="commission-auth-form" data-auth-form style="margin-top: 0;">
                        <label class="commission-auth-label" for="commissionAuthPassword">Password</label>
                        <div class="commission-auth-field">
                            <input id="commissionAuthPassword" class="commission-auth-input" data-auth-input type="password" autocomplete="off" spellcheck="false">
                            <svg class="commission-auth-field-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 17a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 12 17Z"></path>
                                <path d="M7 10V8a5 5 0 0 1 10 0v2"></path>
                                <rect x="5" y="10" width="14" height="10" rx="2"></rect>
                            </svg>
                        </div>
                        <p class="commission-auth-error" data-auth-error></p>
                        <div class="commission-auth-actions">
                            <button type="button" class="commission-auth-button commission-auth-cancel" data-auth-cancel></button>
                            <button type="submit" class="commission-auth-button commission-auth-submit" data-auth-submit></button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const form = modal.querySelector('[data-auth-form]');
        const cancelButton = modal.querySelector('[data-auth-cancel]');

        form.addEventListener('submit', event => {
            event.preventDefault();
            submitActiveRequest();
        });

        cancelButton.addEventListener('click', () => closeModal(false));

        modal.addEventListener('mousedown', event => {
            if (event.target === modal) closeModal(false);
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && activeRequest) {
                event.preventDefault();
                closeModal(false);
            }
        });

        return modal;
    }

    async function submitActiveRequest() {
        if (!activeRequest) return;

        const modal = ensureModal();
        const input = modal.querySelector('[data-auth-input]');
        const error = modal.querySelector('[data-auth-error]');
        const password = input.value.trim();

        const request = activeRequest;
        if (request.saving) return;
        request.saving = true;
        try {
            await window.CarCrmAuth.request('commission', {password});
            if (activeRequest === request) closeModal(true);
            return;
        } catch (failure) {
            if (activeRequest !== request) return;
            error.textContent = failure.message;
        } finally { request.saving = false; }

        input.classList.add('is-error');
        error.classList.add('is-visible');
        input.select();
    }

    function closeModal(result) {
        if (!activeRequest) return;

        const request = activeRequest;
        activeRequest = null;

        const modal = ensureModal();
        modal.style.removeProperty('display');
        document.body.classList.remove('commission-auth-open');

        request.resolve(result);
    }

    async function requestAccess(options = {}) {
        if (activeRequest) return activeRequest.promise;
        try {
            const session = await window.CarCrmAuth.request('session');
            if (session.authenticated && session.commission) return true;
        } catch (_) {}
        if (activeRequest) return activeRequest.promise;

        const config = { ...defaults, ...options };
        const modal = ensureModal();
        const title = modal.querySelector('[data-auth-title]');
        const message = modal.querySelector('[data-auth-message]');
        const input = modal.querySelector('[data-auth-input]');
        const error = modal.querySelector('[data-auth-error]');
        const cancelButton = modal.querySelector('[data-auth-cancel]');
        const submitButton = modal.querySelector('[data-auth-submit]');

        title.textContent = config.title;
        message.textContent = config.message;
        cancelButton.textContent = config.cancelText;
        submitButton.textContent = config.confirmText;
        input.value = '';
        input.classList.remove('is-error');
        error.textContent = '';
        error.classList.remove('is-visible');

        document.body.classList.add('commission-auth-open');
        modal.style.setProperty('display', 'flex', 'important');

        let resolveRequest;
        const promise = new Promise(resolve => {
            resolveRequest = resolve;
        });

        activeRequest = {
            errorText: config.errorText,
            promise,
            resolve: resolveRequest
        };

        window.setTimeout(() => input.focus(), 50);

        return promise;
    }

    window.CarCrmCommissionAuth = {
        request: requestAccess
    };
})();
