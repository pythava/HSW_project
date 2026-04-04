/* admin/admin-logic.js */
'use strict';

const ADMIN_EMAIL = 'pythava1103@gmail.com';

/* ─────────────────────────────────────────
   초기화 & 권한 체크
───────────────────────────────────────── */
async function initAdmin() {
    const { data: { session } } = await window.supabase.auth.getSession();

    if (!session || session.user.email !== ADMIN_EMAIL) {
        document.getElementById('access-denied').style.display = 'flex';
        return;
    }

    document.getElementById('admin-app').style.display = 'flex';
    loadDashboard();
    setupNav();
    setupBannerModal();
    setupSearch();
}

/* ─────────────────────────────────────────
   사이드바 네비게이션
───────────────────────────────────────── */
function setupNav() {
    document.querySelectorAll('.admin-nav-btn[data-section]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.section;
            document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('section-' + target).classList.add('active');
            if (target === 'banners') loadBanners();
        });
    });
}

/* ─────────────────────────────────────────
   대시보드
───────────────────────────────────────── */
async function loadDashboard() {
    // 유저 수
    const { count: userCount } = await window.supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
    document.getElementById('stat-users').textContent = userCount ?? '—';

    // 게시물 수
    const { count: postCount } = await window.supabase
        .from('posts')
        .select('*', { count: 'exact', head: true });
    document.getElementById('stat-posts').textContent = postCount ?? '—';

    // 활성 배너 수
    const { count: bannerCount } = await window.supabase
        .from('banners')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
    document.getElementById('stat-banners').textContent = bannerCount ?? '—';
}

/* ─────────────────────────────────────────
   유저 검색
───────────────────────────────────────── */
function setupSearch() {
    // 유저 검색
    document.getElementById('user-search-btn').addEventListener('click', searchUsers);
    document.getElementById('user-search-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') searchUsers();
    });

    // 게시물 검색
    document.getElementById('post-search-btn').addEventListener('click', searchPosts);
    document.getElementById('post-search-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') searchPosts();
    });
}

async function searchUsers() {
    const q = document.getElementById('user-search-input').value.trim();
    const container = document.getElementById('user-results');
    if (!q) { container.innerHTML = '<div class="empty-state">검색어를 입력하세요.</div>'; return; }

    container.innerHTML = '<div class="empty-state">검색 중...</div>';

    // ✅ ilike 단일 컬럼으로 수정 (or 문법 오류 방지)
    const { data, error } = await window.supabase
        .from('profiles')
        .select('id, username, avatar_url, created_at')
        .ilike('username', `%${q}%`)
        .limit(30);

    if (error || !data?.length) {
        container.innerHTML = `<div class="empty-state">결과가 없습니다. ${error ? '(' + error.message + ')' : ''}</div>`;
        return;
    }

    container.innerHTML = data.map(u => `
        <div class="user-card">
            <img class="user-card-avatar"
                 src="${u.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${u.id}`}"
                 onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${u.id}'">
            <div class="user-card-info">
                <div class="user-card-name">${escHtml(u.username || '(이름 없음)')}</div>
                <div class="user-card-email">ID: ${u.id.slice(0, 12)}…</div>
            </div>
            <div class="user-card-meta">가입: ${fmtDate(u.created_at)}</div>
        </div>
    `).join('');
}

async function searchPosts() {
    const q = document.getElementById('post-search-input').value.trim();
    const container = document.getElementById('post-results');
    if (!q) { container.innerHTML = '<div class="empty-state">검색어를 입력하세요.</div>'; return; }

    container.innerHTML = '<div class="empty-state">검색 중...</div>';

    // ✅ title로만 먼저 검색 (posts 테이블 컬럼명 확인 필요)
    const { data, error } = await window.supabase
        .from('posts')
        .select('id, title, content, created_at, user_id')
        .ilike('title', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(30);

    if (error || !data?.length) {
        container.innerHTML = `<div class="empty-state">결과가 없습니다. ${error ? '(' + error.message + ')' : ''}</div>`;
        return;
    }

    container.innerHTML = data.map(p => `
        <div class="post-card">
            <div class="post-card-title">${escHtml(p.title || '(제목 없음)')}</div>
            <div class="post-card-body">${escHtml(p.content || '')}</div>
            <div class="post-card-meta">📅 ${fmtDate(p.created_at)} · ID: ${p.id}</div>
        </div>
    `).join('');
}

/* ─────────────────────────────────────────
   배너 관리
───────────────────────────────────────── */
let editingBannerId = null;

async function loadBanners() {
    const container = document.getElementById('banner-list');
    container.innerHTML = '<div class="empty-state">불러오는 중...</div>';

    const { data, error } = await window.supabase
        .from('banners')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = '<div class="empty-state">배너를 불러오지 못했습니다.</div>';
        return;
    }
    if (!data?.length) {
        container.innerHTML = '<div class="empty-state">등록된 배너가 없습니다.</div>';
        return;
    }

    container.innerHTML = data.map(b => `
        <div class="banner-item">
            <div class="banner-preview-card"
                 style="background: linear-gradient(135deg, ${escHtml(b.color1 || '#9d4edd')}22 0%, ${escHtml(b.color2 || '#c77dff')}11 100%); border-bottom: 1px solid ${escHtml(b.color1 || '#9d4edd')}33;">
                <div class="banner-preview-top">
                    <span class="banner-preview-icon">${escHtml(b.icon || '✦')}</span>
                    <span class="banner-preview-label">${escHtml(b.title || '')}</span>
                    ${!b.is_active ? '<span class="banner-inactive-badge">비활성</span>' : ''}
                </div>
                <p class="banner-preview-desc">${escHtml(b.description || '')}</p>
            </div>
            <div class="banner-item-actions">
                <button class="btn-edit" onclick="openEditBanner('${b.id}')">
                    <span class="material-symbols-rounded" style="font-size:1rem;">edit</span>수정
                </button>
                <button class="btn-danger" onclick="deleteBanner('${b.id}')">
                    <span class="material-symbols-rounded" style="font-size:1rem;">delete</span>삭제
                </button>
            </div>
        </div>
    `).join('');
}

/* 배너 모달 */
function setupBannerModal() {
    document.getElementById('banner-add-btn').addEventListener('click', () => openBannerModal(null));
    document.getElementById('modal-close').addEventListener('click', closeBannerModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeBannerModal);
    document.getElementById('modal-save-btn').addEventListener('click', saveBanner);
    document.getElementById('banner-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('banner-modal')) closeBannerModal();
    });

    // 실시간 미리보기
    ['banner-title-input', 'banner-desc-input', 'banner-icon-input', 'banner-color1', 'banner-color2'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePreview);
    });
}

function openBannerModal(banner) {
    editingBannerId = banner ? banner.id : null;
    document.getElementById('modal-title').textContent = banner ? '배너 수정' : '배너 추가';
    document.getElementById('banner-title-input').value = banner?.title || '';
    document.getElementById('banner-desc-input').value = banner?.description || '';
    document.getElementById('banner-url-input').value = banner?.url || '';
    document.getElementById('banner-color1').value = banner?.color1 || '#9d4edd';
    document.getElementById('banner-color2').value = banner?.color2 || '#c77dff';
    document.getElementById('banner-icon-input').value = banner?.icon || '✦';
    document.getElementById('banner-active').checked = banner?.is_active !== false;
    updatePreview();
    document.getElementById('banner-modal').style.display = 'flex';
}

async function openEditBanner(id) {
    const { data } = await window.supabase.from('banners').select('*').eq('id', id).single();
    if (data) openBannerModal(data);
}

function closeBannerModal() {
    document.getElementById('banner-modal').style.display = 'none';
    editingBannerId = null;
}

function updatePreview() {
    const title  = document.getElementById('banner-title-input').value || 'BANNER TITLE';
    const desc   = document.getElementById('banner-desc-input').value  || '부제목이 여기에 표시됩니다';
    const icon   = document.getElementById('banner-icon-input').value  || '✦';
    const c1     = document.getElementById('banner-color1').value;
    const c2     = document.getElementById('banner-color2').value;

    const preview = document.getElementById('banner-preview');
    preview.style.background = `linear-gradient(135deg, ${c1}33 0%, ${c2}18 100%)`;
    preview.style.borderLeft  = `3px solid ${c1}`;
    preview.innerHTML = `
        <div class="bp-top">
            <span class="bp-icon">${escHtml(icon)}</span>
            <span class="bp-title">${escHtml(title)}</span>
        </div>
        <span class="bp-desc">${escHtml(desc)}</span>
    `;
}

async function saveBanner() {
    const payload = {
        title:       document.getElementById('banner-title-input').value.trim(),
        description: document.getElementById('banner-desc-input').value.trim(),
        url:         document.getElementById('banner-url-input').value.trim() || null,
        color1:      document.getElementById('banner-color1').value,
        color2:      document.getElementById('banner-color2').value,
        icon:        document.getElementById('banner-icon-input').value.trim() || '✦',
        is_active:   document.getElementById('banner-active').checked,
    };

    if (!payload.title) {
        alert('배너 제목을 입력해 주세요.');
        return;
    }

    let error;
    if (editingBannerId) {
        ({ error } = await window.supabase.from('banners').update(payload).eq('id', editingBannerId));
    } else {
        ({ error } = await window.supabase.from('banners').insert(payload));
    }

    if (error) {
        alert('저장에 실패했습니다: ' + error.message);
        return;
    }

    closeBannerModal();
    loadBanners();
    loadDashboard();
}

async function deleteBanner(id) {
    if (!confirm('배너를 삭제하시겠습니까?')) return;
    const { error } = await window.supabase.from('banners').delete().eq('id', id);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    loadBanners();
    loadDashboard();
}

/* ─────────────────────────────────────────
   유틸
───────────────────────────────────────── */
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

/* ─────────────────────────────────────────
   실행
───────────────────────────────────────── */
initAdmin();
