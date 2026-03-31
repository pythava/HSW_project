/* js/common-ui.js — 커스텀 Alert / Confirm UI */

function ugAlert(message, options = {}) {
    return new Promise((resolve) => {
        const { title = '알림', icon = 'info' } = options;
        const iconMap = {
            info:    { symbol: 'info',          color: 'var(--primary)' },
            success: { symbol: 'check_circle',  color: '#22c55e' },
            error:   { symbol: 'error',          color: 'var(--error)' },
            warning: { symbol: 'warning',        color: '#f59e0b' },
        };
        const ic = iconMap[icon] || iconMap.info;
        const overlay = document.createElement('div');
        overlay.className = 'ug-alert-overlay';
        overlay.innerHTML = `
            <div class="ug-alert-box" role="dialog" aria-modal="true">
                <span class="material-symbols-rounded ug-alert-icon" style="color:${ic.color};">${ic.symbol}</span>
                <div class="ug-alert-title">${_escHtml(title)}</div>
                ${message ? `<div class="ug-alert-msg">${_escHtml(message)}</div>` : ''}
                <div class="ug-alert-btns">
                    <button class="ug-alert-btn primary" id="ug-alert-ok">확인</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const ok = () => { overlay.remove(); resolve(true); };
        overlay.querySelector('#ug-alert-ok').addEventListener('click', ok);
        overlay.addEventListener('click', e => { if (e.target === overlay) ok(); });
    });
}

function ugConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const { title = '확인', icon = 'help', confirmText = '확인', cancelText = '취소', danger = false } = options;
        const iconMap = {
            help:    { symbol: 'help',          color: 'var(--primary)' },
            warning: { symbol: 'warning',        color: '#f59e0b' },
            delete:  { symbol: 'delete_forever', color: 'var(--error)' },
            error:   { symbol: 'error',          color: 'var(--error)' },
        };
        const ic = iconMap[icon] || iconMap.help;
        const overlay = document.createElement('div');
        overlay.className = 'ug-alert-overlay';
        overlay.innerHTML = `
            <div class="ug-alert-box" role="dialog" aria-modal="true">
                <span class="material-symbols-rounded ug-alert-icon" style="color:${ic.color};">${ic.symbol}</span>
                <div class="ug-alert-title">${_escHtml(title)}</div>
                ${message ? `<div class="ug-alert-msg">${_escHtml(message)}</div>` : ''}
                <div class="ug-alert-btns">
                    <button class="ug-alert-btn secondary" id="ug-cancel">${_escHtml(cancelText)}</button>
                    <button class="ug-alert-btn ${danger ? 'danger' : 'primary'}" id="ug-ok">${_escHtml(confirmText)}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const ok     = () => { overlay.remove(); resolve(true); };
        const cancel = () => { overlay.remove(); resolve(false); };
        overlay.querySelector('#ug-ok').addEventListener('click', ok);
        overlay.querySelector('#ug-cancel').addEventListener('click', cancel);
        overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
    });
}

function _escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
