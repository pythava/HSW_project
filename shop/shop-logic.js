/* shop/shop-logic.js */

let BANNERS = []; // DB에서 로드
let currentUser = null;
let ownedBanners = [];

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = '../login.html'; return; }
    currentUser = user;

    await loadLunaBalance(user.id);
    await loadShopBanners();      // DB에서 배너 목록 로드
    await loadOwnedBanners(user.id);

    renderBannerShop();

    // 탭 전환
    document.querySelectorAll('.shop-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.shop-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('pane-' + tab.dataset.tab)?.classList.add('active');
        });
    });

    // 루나 구매 버튼
    document.querySelectorAll('.shop-buy-btn').forEach(btn => {
        if (!btn.closest('.banner-shop-grid')) {
            btn.addEventListener('click', () => showShopToast('🚧 결제 기능은 준비 중이에요!'));
        }
    });

    // 멤버십 버튼
    document.querySelectorAll('.membership-btn:not(.current-tier)').forEach(btn => {
        btn.addEventListener('click', () => showShopToast('🚧 멤버십 기능은 준비 중이에요!'));
    });
});

// ─── 상점 배너 목록 로드 (DB) ────────────────────────────────────────────────
async function loadShopBanners() {
    try {
        const { data } = await supabase
            .from('profile_banners')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: true });
        BANNERS = (data || []).map(b => ({
            ...b,
            preview: `linear-gradient(135deg, ${b.color1} 0%, ${b.color2} 100%)`
        }));
    } catch (e) {
        console.warn('배너 목록 로드 실패:', e);
        BANNERS = [];
    }
}

// ─── 루나 잔액 ────────────────────────────────────────────────────────────────
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
        return amount;
    } catch (e) {
        console.warn('루나 잔액 로드 실패:', e);
        return 0;
    }
}

// ─── 보유 배너 로드 ────────────────────────────────────────────────────────────
async function loadOwnedBanners(userId) {
    try {
        const { data, error } = await supabase
            .from('user_banners')
            .select('banner_id')
            .eq('user_id', userId);
        if (error) throw error;
        ownedBanners = (data || []).map(r => r.banner_id);
        renderOwnedBannersPanel();
    } catch (e) {
        console.warn('보유 배너 로드 실패:', e);
    }
}

// ─── 배너 상점 렌더링 ─────────────────────────────────────────────────────────
function renderBannerShop() {
    const grid = document.getElementById('banner-shop-grid');
    if (!grid) return;

    grid.innerHTML = BANNERS.map(banner => {
        const owned = ownedBanners.includes(banner.id);
        return `
        <div class="banner-shop-card" data-id="${banner.id}">
            <div class="banner-preview" style="background: ${banner.preview};"></div>
            <div class="banner-shop-info">
                <div class="banner-shop-name">${banner.name}</div>
                <div class="banner-shop-price">
                    ${owned
                        ? '<span class="banner-owned-label"><span class="material-symbols-rounded">check_circle</span> 보유 중</span>'
                        : `<span class="banner-price-luna">🌙 ${banner.price} Luna</span>`
                    }
                </div>
                <button class="banner-buy-btn ${owned ? 'owned' : ''}" 
                        data-id="${banner.id}"
                        data-price="${banner.price}"
                        ${owned ? 'disabled' : ''}>
                    ${owned ? '보유 중' : '구매하기'}
                </button>
            </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.banner-buy-btn:not(.owned)').forEach(btn => {
        btn.addEventListener('click', () => purchaseBanner(btn.dataset.id, parseInt(btn.dataset.price)));
    });
}

// ─── 배너 구매 ────────────────────────────────────────────────────────────────
async function purchaseBanner(bannerId, price) {
    const banner = BANNERS.find(b => b.id === bannerId);
    if (!banner) return;

    const confirmed = await ugConfirm(
        `"${banner.name}" 배너를 ${price} Luna에 구매하시겠어요?`,
        { title: '배너 구매', icon: 'help', confirmText: '구매', cancelText: '취소' }
    );
    if (!confirmed) return;

    try {
        // 루나 잔액 확인
        const { data: tokenData } = await supabase
            .from('user_tokens')
            .select('amount')
            .eq('user_id', currentUser.id)
            .single();
        const currentLuna = tokenData?.amount ?? 0;

        if (currentLuna < price) {
            await ugAlert('루나가 부족해요!\n루나 충전 탭에서 충전해주세요.', { title: '루나 부족', icon: 'error' });
            return;
        }

        // 트랜잭션: 루나 차감 + 배너 지급
        const { error: tokenErr } = await supabase
            .from('user_tokens')
            .update({ amount: currentLuna - price })
            .eq('user_id', currentUser.id);
        if (tokenErr) throw tokenErr;

        const { error: bannerErr } = await supabase
            .from('user_banners')
            .insert({ user_id: currentUser.id, banner_id: bannerId });
        if (bannerErr) throw bannerErr;

        // 구매 내역 기록
        await supabase.from('shop_purchases').insert({
            user_id: currentUser.id,
            item_type: 'banner',
            item_id: bannerId,
            item_name: banner.name,
            price: price
        });

        ownedBanners.push(bannerId);
        await loadLunaBalance(currentUser.id);
        renderBannerShop();
        renderOwnedBannersPanel();

        showShopToast(`🎨 "${banner.name}" 배너를 획득했어요!`);
    } catch (e) {
        console.error('배너 구매 실패:', e);
        await ugAlert('구매 중 오류가 발생했어요. 다시 시도해주세요.', { title: '오류', icon: 'error' });
    }
}

// ─── 우측 패널: 보유 배너 ─────────────────────────────────────────────────────
function renderOwnedBannersPanel() {
    const panel = document.getElementById('owned-banners-panel');
    if (!panel) return;

    if (ownedBanners.length === 0) {
        panel.innerHTML = '<div class="shop-history-empty">보유한 배너가 없어요.</div>';
        return;
    }

    panel.innerHTML = ownedBanners.map(id => {
        const b = BANNERS.find(x => x.id === id);
        if (!b) return '';
        return `
        <div class="owned-banner-item">
            <div class="owned-banner-swatch" style="background: ${b.preview};"></div>
            <div class="owned-banner-name">${b.name}</div>
        </div>`;
    }).join('');
}

// ─── 토스트 ──────────────────────────────────────────────────────────────────
function showShopToast(msg) {
    const t = document.createElement('div');
    t.className = 'ug-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
