'use strict';
(() => {
    const $ = id => document.getElementById(id);
    let key = '', busy = false;
    const notice = (text, error = false) => { $('notice').textContent = text; $('notice').classList.toggle('error', error); };
    async function api(route, input) {
        const response = await fetch(`/api/${route}`, {
            method: input ? 'POST' : 'GET',
            headers: { 'X-Car-Review-Key': key, ...(input ? { 'Content-Type': 'application/json' } : {}) },
            ...(input ? { body: JSON.stringify(input) } : {}), credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(65000)
        });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'The isolated test could not complete.');
        return value;
    }
    async function refresh() {
        const state = await api('status');
        $('login').hidden = true; $('test').hidden = false;
        $('configured').textContent = state.webhookConfigured ? 'Signed test receiver configured.' : 'Receiver not configured. The app owner must complete the separate deployment setup.';
        $('inbound').textContent = state.testVerified ? `Verified Test received: ${state.receivedAt}` : 'Waiting for a new signed Test from @crazyoilly.';
        $('send-state').textContent = `Reply state: ${state.sendState}${state.replyAllowed ? '' : ' · Sending disabled by the owner.'}`;
        $('thread-state').textContent = `Test thread state: ${state.threadState}`;
        $('expires').textContent = state.expired ? 'Test session expired. Only status and release of this known test thread remain available.' : `Test receiver expires in ${Math.ceil(state.expiresInSeconds / 60)} minutes.`;
        const idle = !state.expired && state.sendState === 'idle';
        $('verify').disabled = !state.testVerified || !idle || busy;
        $('send').disabled = !state.replyAllowed || !state.testVerified || !idle || busy;
        $('take').hidden = !state.threadControlAllowed;
        $('take').disabled = !state.testVerified || !idle || state.threadState !== 'idle' || busy;
        $('release').hidden = !state.threadControlAllowed;
        $('release').disabled = !['controlled', 'unknown'].includes(state.threadState) || busy;
    }
    async function action(work) {
        if (busy) return;
        busy = true;
        document.querySelectorAll('.actions button').forEach(button => { button.disabled = true; });
        try { await work(); }
        catch (error) { notice(error.message, true); }
        finally {
            busy = false;
            if (key) { try { await refresh(); } catch (error) { notice(error.message, true); } }
        }
    }
    $('login-form').addEventListener('submit', event => {
        event.preventDefault(); key = $('review-key').value; $('review-key').value = '';
        void action(async () => { await refresh(); notice('Dedicated reviewer access opened.'); });
    });
    $('signout').addEventListener('click', () => {
        key = ''; $('test').hidden = true; $('login').hidden = false;
        notice('Signed out. No reviewer key is stored in browser storage.');
    });
    $('refresh').addEventListener('click', () => { void action(refresh); });
    for (const [id, route, text] of [
        ['verify', 'verify', 'Signed Test and approved tester verified.'],
        ['take', 'take-test-thread', 'The approved test thread is controlled for this fixed-reply test.'],
        ['send', 'send-fixed-reply', 'Fixed reply sent. Check the @crazyoilly Instagram conversation.'],
        ['release', 'release-test-thread', 'Test thread release checked.']
    ]) $(id).addEventListener('click', () => { void action(async () => { await api(route, { confirm: true }); notice(text); }); });
})();
