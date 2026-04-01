/* shop/shop-logic.js */

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = '../login.html'; return; }

    // 루나 잔액 로드
    await loadLunaBalance(user.id);

    // 탭 전환
    document.querySelectorAll('.shop-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.shop-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('pane-' + tab.dataset.tab)?.classList.add('active');
        });
    });

    // 구매 버튼 (기능 미구현 — 토스트만)
    document.querySelectorAll('.shop-buy-btn, .membership-btn:not(.current-tier), .badge-buy').forEach(btn => {
        btn.addEventListener('click', () => {
            showShopToast('🚧 결제 기능은 준비 중이에요!');
        });
    });
});

async function loadLunaBalance(userId) {
    try {
        const { data } = await supabase.from('user_tokens').select('amount').eq('user_id', userId).single();
        const amount = data?.amount ?? 0;
        const el = document.getElementById('my-luna-count');
        if (el) el.textContent = amount.toLocaleString();
        const rightEl = document.getElementById('right-luna-count');
        if (rightEl) rightEl.textContent = amount.toLocaleString();
        const rightPanel = document.getElementById('shop-right-luna');
        if (rightPanel) rightPanel.style.display = 'flex';
    } catch (e) {
        console.warn('루나 잔액 로드 실패:', e);
    }
}

function showShopToast(msg) {
    const t = document.createElement('div');
    t.className = 'ug-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
