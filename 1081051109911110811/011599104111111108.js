/* admin/admin-logic.js */
'use strict';

const ADMIN_EMAIL = 'pythava1103@gmail.com';

/* ─── 초기화 ─── */
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
    setupLiveSearch();
    setupContextMenus();
}

/* ─── 네비게이션 ─── */
function setupNav() {
    document.querySelectorAll('.admin-nav-btn[data-section]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.dataset.section;
            document.getElementById('section-' + target).classList.add('active');
            if (target === 'banners') loadBanners();
            if (target === 'reports') loadReports();
            if (target === 'banlist') loadBanList();
        });
    });
}

/* ─── 대시보드 ─── */
async function loadDashboard() {
    const [
        { count: uc }, { count: pc }, { count: rc }, { count: bc }
    ] = await Promise.all([
        window.supabase.from('profiles').select('*', { count: 'exact', head: true }),
        window.supabase.from('posts').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
        window.supabase.from('reports').select('*', { count: 'exact', head: true }).eq('is_resolved', false),
        window.supabase.from('bans').select('*', { count: 'exact', head: true }),
    ]);
    document.getElementById('stat-users').textContent   = uc ?? '—';
    document.getElementById('stat-posts').textContent   = pc ?? '—';
    document.getElementById('stat-reports').textContent = rc ?? '—';
    document.getElementById('stat-bans').textContent    = bc ?? '—';
}

/* ─────────────────────────────────────────
   실시간 검색
───────────────────────────────────────── */
function setupLiveSearch() {
    let userTimer, postTimer, pamTimer;

    document.getElementById('user-search-input').addEventListener('input', e => {
        clearTimeout(userTimer);
        userTimer = setTimeout(() => searchUsers(e.target.value.trim()), 250);
    });
    document.getElementById('post-search-input').addEventListener('input', e => {
        clearTimeout(postTimer);
        postTimer = setTimeout(() => searchPosts(e.target.value.trim()), 250);
    });
    document.getElementById('pam-search-input').addEventListener('input', e => {
        clearTimeout(pamTimer);
        pamTimer = setTimeout(() => searchPams(e.target.value.trim()), 250);
    });
}

/* 유저 검색 */
async function searchUsers(q) {
    const container = document.getElementById('user-results');
    if (!q) { container.innerHTML = '<div class="empty-state">검색어를 입력하세요.</div>'; return; }
    container.innerHTML = '<div class="empty-state">검색 중...</div>';

    const { data, error } = await window.supabase
        .from('profiles')
        .select('id, username, email, avatar_url, follower_count, post_count')
        .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(30);

    if (error || !data?.length) {
        container.innerHTML = `<div class="empty-state">결과 없음</div>`; return;
    }

    // 밴 여부 확인
    const ids = data.map(u => u.id);
    const { data: bans } = await window.supabase.from('bans').select('user_id').in('user_id', ids);
    const bannedSet = new Set((bans || []).map(b => b.user_id));

    container.innerHTML = data.map(u => `
        <div class="user-card" data-uid="${u.id}" data-uname="${escHtml(u.username || '')}">
            ${bannedSet.has(u.id) ? '<span class="ban-badge">BAN</span>' : ''}
            <img class="user-card-avatar"
                 src="${u.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${u.id}`}"
                 onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${u.id}'">
            <div class="user-card-info">
                <div class="user-card-name">${escHtml(u.username || '(이름 없음)')}${bannedSet.has(u.id) ? ' <span style="color:var(--error);font-size:0.75rem;">[BAN]</span>' : ''}</div>
                <div class="user-card-email">${escHtml(u.email || '')}</div>
            </div>
            <div class="user-card-meta">
                팔로워 ${u.follower_count ?? 0} · 게시물 ${u.post_count ?? 0}
                ${warnCount[u.id] ? `<br><span class="warning-count-badge">⚠️ 경고 ${warnCount[u.id]}회</span>` : ''}
            </div>
    `).join('');
    // 경고 횟수 확인
    const { data: warnData } = await window.supabase
        .from('warnings').select('user_id').in('user_id', ids);
    const warnCount = {};
    (warnData || []).forEach(w => {
        warnCount[w.user_id] = (warnCount[w.user_id] || 0) + 1;
    });
}

/* 게시물 검색 */
async function searchPosts(q) {
    const container = document.getElementById('post-results');
    if (!q) { container.innerHTML = '<div class="empty-state">검색어를 입력하세요.</div>'; return; }
    container.innerHTML = '<div class="empty-state">검색 중...</div>';

    const { data, error } = await window.supabase
        .from('posts')
        .select('id, title, content, created_at, user_id')
        .ilike('title', `%${q}%`)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(30);

    if (error || !data?.length) {
        container.innerHTML = '<div class="empty-state">결과 없음</div>'; return;
    }

    container.innerHTML = data.map(p => `
        <div class="post-card" data-pid="${p.id}" data-uid="${p.user_id}">
            <div class="post-card-title">${escHtml(p.title || '(제목 없음)')}</div>
            <div class="post-card-body">${escHtml(p.content || '')}</div>
            <div class="post-card-meta">📅 ${fmtDateFull(p.created_at)}</div>
            <button class="more-btn" onclick="openPostCtx(event, '${p.id}', '${p.user_id}')">
                <span class="material-symbols-rounded">more_vert</span>
            </button>
        </div>
    `).join('');
}

/* 팸 검색 */
async function searchPams(q) {
    const container = document.getElementById('pam-results');
    if (!q) { container.innerHTML = '<div class="empty-state">검색어를 입력하세요.</div>'; return; }
    container.innerHTML = '<div class="empty-state">검색 중...</div>';

    const { data, error } = await window.supabase
        .from('pams')
        .select('id, name, description, region, age_group, gender, member_count, image_url, created_at')
        .ilike('name', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(30);

    if (error || !data?.length) {
        container.innerHTML = '<div class="empty-state">결과 없음</div>'; return;
    }

    container.innerHTML = data.map(p => `
        <div class="pam-card">
            <img class="pam-card-img"
                 src="${p.image_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${p.id}`}"
                 onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${p.id}'">
            <div class="pam-card-info">
                <div class="pam-card-name">${escHtml(p.name || '')}</div>
                <div class="pam-card-desc">${escHtml(p.description || '')}</div>
                <div class="pam-card-meta" style="margin-top:4px;">
                    ${[p.region, p.age_group, p.gender].filter(Boolean).map(t => `<span style="background:var(--bg-2);border-radius:6px;padding:2px 8px;font-size:0.72rem;">${escHtml(t)}</span>`).join(' ')}
                </div>
            </div>
            <div class="pam-card-meta">
                👥 ${p.member_count ?? 0}명<br>
                <span style="font-size:0.72rem;">${fmtDate(p.created_at)}</span>
            </div>
        </div>
    `).join('');
}

/* ─────────────────────────────────────────
   컨텍스트 메뉴
───────────────────────────────────────── */
let ctxTargetUserId   = null;
let ctxTargetUserName = null;
let ctxTargetPostId   = null;
let ctxTargetAuthorId = null;

function setupContextMenus() {
    // 유저 컨텍스트
    document.getElementById('ctx-warn').addEventListener('click', () => {
        closeCtxMenus();
        openWarningModal(ctxTargetUserId, ctxTargetUserName);
    });
    document.getElementById('ctx-banner').addEventListener('click', () => {
        closeCtxMenus();
        openBannerGrantModal(ctxTargetUserId, ctxTargetUserName);
    });
    document.getElementById('ctx-ban').addEventListener('click', () => {
        closeCtxMenus();
        banUser(ctxTargetUserId, ctxTargetUserName);
    });

    // 신고/게시물 컨텍스트
    document.getElementById('rctx-warn').addEventListener('click', () => {
        closeCtxMenus();
        openWarningModal(ctxTargetAuthorId, '게시물 작성자');
    });
    document.getElementById('rctx-delete').addEventListener('click', () => {
        closeCtxMenus();
        forceDeletePost(ctxTargetPostId);
    });

    // 외부 클릭 시 닫기
    document.addEventListener('click', e => {
        if (!e.target.closest('.context-menu') && !e.target.closest('.more-btn')) {
            closeCtxMenus();
        }
    });
}

function openUserCtx(e, uid, uname) {
    e.stopPropagation();
    ctxTargetUserId   = uid;
    ctxTargetUserName = uname;
    showMenu('context-menu', e);
}

function openPostCtx(e, pid, uid) {
    e.stopPropagation();
    ctxTargetPostId   = pid;
    ctxTargetAuthorId = uid;
    showMenu('report-context-menu', e);
}

function showMenu(menuId, e) {
    closeCtxMenus();
    const menu = document.getElementById(menuId);
    menu.style.display = 'block';
    const x = Math.min(e.clientX, window.innerWidth  - 180);
    const y = Math.min(e.clientY, window.innerHeight - 120);
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
}

function closeCtxMenus() {
    document.getElementById('context-menu').style.display        = 'none';
    document.getElementById('report-context-menu').style.display = 'none';
}

/* ─────────────────────────────────────────
   경고 모달
───────────────────────────────────────── */
let warningTargetId = null;

function openWarningModal(uid, uname) {
    warningTargetId = uid;
    document.getElementById('warning-target-name').textContent = uname || uid;
    document.getElementById('warning-message-input').value = '';
    document.getElementById('warning-modal').style.display = 'flex';
}
function closeWarningModal() {
    document.getElementById('warning-modal').style.display = 'none';
    warningTargetId = null;
}

async function sendWarning() {
    const msg = document.getElementById('warning-message-input').value.trim();
    if (!msg) { alert('경고 메시지를 입력하세요.'); return; }

    const { error } = await window.supabase.from('warnings').insert({
        user_id: warningTargetId,
        message: msg,
        is_read: false,
    });

    if (error) { alert('경고 발송 실패: ' + error.message); return; }
    closeWarningModal();
    showToast('경고가 발송되었습니다.');
}

/* ─────────────────────────────────────────
   밴
───────────────────────────────────────── */
async function banUser(uid, uname) {
    const reason = prompt(`"${uname}" 유저를 밴하는 이유를 입력하세요:`);
    if (reason === null) return;

    const { error } = await window.supabase.from('bans').insert({
        user_id:   uid,
        reason:    reason || '사유 없음',
        banned_by: (await window.supabase.auth.getUser()).data.user?.id,
    });
    if (error) { alert('밴 실패: ' + error.message); return; }
    showToast(`${uname} 유저가 밴되었습니다.`);
    loadDashboard();
}

async function unbanUser(uid) {
    if (!confirm('밴을 해제하시겠습니까?')) return;
    const { error } = await window.supabase.from('bans').delete().eq('user_id', uid);
    if (error) { alert('밴 해제 실패: ' + error.message); return; }
    showToast('밴이 해제되었습니다.');
    loadBanList();
    loadDashboard();
}

async function loadBanList() {
    const container = document.getElementById('ban-list');
    container.innerHTML = '<div class="empty-state">불러오는 중...</div>';

    const { data: bans, error } = await window.supabase
        .from('bans')
        .select('id, user_id, reason, created_at')
        .order('created_at', { ascending: false });

    if (error || !bans?.length) {
        container.innerHTML = '<div class="empty-state">밴된 유저가 없습니다.</div>'; return;
    }

    const uids = bans.map(b => b.user_id);

    // 프로필 + 경고 횟수 병렬 조회
    const [{ data: profiles }, { data: warnings }] = await Promise.all([
        window.supabase.from('profiles').select('id, username, email, avatar_url').in('id', uids),
        window.supabase.from('warnings').select('user_id').in('user_id', uids),
    ]);

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    // 유저별 경고 횟수 집계
    const warningCount = {};
    (warnings || []).forEach(w => {
        warningCount[w.user_id] = (warningCount[w.user_id] || 0) + 1;
    });

    container.innerHTML = bans.map(b => {
        const p = profileMap[b.user_id] || {};
        const wCount = warningCount[b.user_id] || 0;
        return `
        <div class="ban-card">
            <img class="user-card-avatar"
                 src="${p.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${b.user_id}`}"
                 onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${b.user_id}'">
            <div class="ban-card-info">
                <div class="ban-card-name">${escHtml(p.username || '알 수 없음')}</div>
                <div class="ban-card-reason">사유: ${escHtml(b.reason || '없음')}</div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:5px;">
                    <span class="ban-card-date">${fmtDateFull(b.created_at)}</span>
                    <span class="warning-count-badge" title="누적 경고 횟수">
                        ⚠️ 경고 ${wCount}회
                    </span>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
                <button class="btn-ghost" style="font-size:0.82rem;white-space:nowrap;"
                        onclick="unbanUser('${b.user_id}')">
                    <span class="material-symbols-rounded" style="font-size:1rem;">lock_open</span>밴 해제
                </button>
                <button class="btn-ghost" style="font-size:0.82rem;white-space:nowrap;color:var(--text-3);"
                        onclick="openWarningModal('${b.user_id}', '${escHtml(p.username || '')}')">
                    <span class="material-symbols-rounded" style="font-size:1rem;">warning</span>경고 추가
                </button>
            </div>
        </div>`;
    }).join('');
}

/* ─────────────────────────────────────────
   게시물 강제 삭제
───────────────────────────────────────── */
async function forceDeletePost(pid) {
    if (!confirm('게시물을 강제 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
    const { error } = await window.supabase
        .from('posts').update({ is_deleted: true }).eq('id', pid);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    showToast('게시물이 삭제되었습니다.');
    // 신고 목록에서도 해당 카드 제거
    allReports = allReports.filter(r => r.post_id !== pid);
    renderReports();
}

/* ─────────────────────────────────────────
   신고 목록
───────────────────────────────────────── */
let currentReportFilter = 'all';
let allReports = [];

async function loadReports() {
    const container = document.getElementById('report-list');
    container.innerHTML = '<div class="empty-state">불러오는 중...</div>';

    const { data: reports, error } = await window.supabase
        .from('reports').select('*').order('created_at', { ascending: false }).limit(100);

    if (error || !reports?.length) {
        container.innerHTML = '<div class="empty-state">신고가 없습니다.</div>'; return;
    }

    const reporterIds = [...new Set(reports.map(r => r.reporter_id).filter(Boolean))];
    const postIds     = [...new Set(reports.map(r => r.post_id).filter(Boolean))];

    const [{ data: profiles }, { data: posts }] = await Promise.all([
        window.supabase.from('profiles').select('id, username, email, avatar_url').in('id', reporterIds),
        window.supabase.from('posts').select('id, title, content, user_id').in('id', postIds),
    ]);

    const authorIds = [...new Set((posts || []).map(p => p.user_id).filter(Boolean))];
    const { data: authors } = await window.supabase
        .from('profiles').select('id, username, email, avatar_url').in('id', authorIds);

    const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    const postMap    = Object.fromEntries((posts    || []).map(p => [p.id, p]));
    const authorMap  = Object.fromEntries((authors  || []).map(p => [p.id, p]));

    allReports = reports.map(r => ({
        ...r,
        reporter: profileMap[r.reporter_id] || null,
        post: postMap[r.post_id]
            ? { ...postMap[r.post_id], author: authorMap[postMap[r.post_id]?.user_id] || null }
            : null,
    }));

    renderReports();
    setupReportFilters();
}

function renderReports() {
    const container = document.getElementById('report-list');
    let filtered = allReports;
    if (currentReportFilter === 'pending')  filtered = allReports.filter(r => !r.is_resolved);
    if (currentReportFilter === 'resolved') filtered = allReports.filter(r =>  r.is_resolved);

    if (!filtered.length) {
        container.innerHTML = '<div class="empty-state">해당하는 신고가 없습니다.</div>'; return;
    }

    container.innerHTML = filtered.map(r => {
        const reporter = r.reporter;
        const post     = r.post;
        const author   = post?.author;
        const resolved = !!r.is_resolved;
        const reasons  = Array.isArray(r.reasons) ? r.reasons : [];

        return `
        <div class="report-card ${resolved ? 'resolved' : ''}">
            <div class="report-card-header">
                <span class="report-card-time">🕐 ${fmtDateFull(r.created_at)}</span>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="report-status-badge ${resolved ? 'resolved' : 'pending'}">
                        ${resolved ? '✅ 처리완료' : '🔴 미처리'}
                    </span>
                    <button class="more-btn" style="position:static;display:flex;"
                            onclick="openPostCtx(event, '${r.post_id}', '${post?.user_id || ''}')">
                        <span class="material-symbols-rounded">more_vert</span>
                    </button>
                </div>
            </div>
            <div class="report-card-body">
                <div class="report-user-block">
                    <span class="report-user-label">신고자</span>
                    <div class="report-user-row">
                        <img class="report-avatar"
                             src="${reporter?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${r.reporter_id}`}"
                             onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${r.reporter_id}'">
                        <div>
                            <div class="report-username">${escHtml(reporter?.username || '알 수 없음')}</div>
                            <div class="report-user-email">${escHtml(reporter?.email || '')}</div>
                        </div>
                    </div>
                </div>
                <div class="report-user-block">
                    <span class="report-user-label">피신고자</span>
                    <div class="report-user-row">
                        <img class="report-avatar"
                             src="${author?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${post?.user_id}`}"
                             onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${post?.user_id}'">
                        <div>
                            <div class="report-username">${escHtml(author?.username || '알 수 없음')}</div>
                            <div class="report-user-email">${escHtml(author?.email || '')}</div>
                        </div>
                    </div>
                </div>
            </div>
            ${reasons.length ? `<div class="report-reasons">${reasons.map(rr => `<span class="reason-tag">🚩 ${escHtml(rr)}</span>`).join('')}</div>` : ''}
            <div class="report-card-post">
                <div class="report-post-label">신고된 게시물</div>
                <div class="report-post-title">${escHtml(post?.title || '(삭제되었거나 없음)')}</div>
                <div class="report-post-body">${escHtml(post?.content || '')}</div>
            </div>
            <div class="report-card-actions">
                ${!resolved
                    ? `<button class="btn-primary" style="font-size:0.82rem;padding:8px 14px;" onclick="resolveReport('${r.id}')">
                           <span class="material-symbols-rounded" style="font-size:1rem;">check_circle</span>처리완료
                       </button>`
                    : `<button class="btn-ghost" style="font-size:0.82rem;padding:8px 14px;" onclick="unresolveReport('${r.id}')">
                           <span class="material-symbols-rounded" style="font-size:1rem;">undo</span>미처리로
                       </button>`}
            </div>
        </div>`;
    }).join('');
}

function setupReportFilters() {
    document.querySelectorAll('.report-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.report-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentReportFilter = btn.dataset.filter;
            renderReports();
        });
    });
}

async function resolveReport(id) {
    const { error } = await window.supabase.from('reports').update({ is_resolved: true }).eq('id', id);
    if (error) { alert('처리 실패: ' + error.message); return; }
    allReports = allReports.map(r => r.id === id ? { ...r, is_resolved: true } : r);
    renderReports();
}
async function unresolveReport(id) {
    const { error } = await window.supabase.from('reports').update({ is_resolved: false }).eq('id', id);
    if (error) { alert('처리 실패: ' + error.message); return; }
    allReports = allReports.map(r => r.id === id ? { ...r, is_resolved: false } : r);
    renderReports();
}

/* ─────────────────────────────────────────
   배너 관리 (기존 유지)
───────────────────────────────────────── */
let editingBannerId = null;

async function loadBanners() {
    const container = document.getElementById('banner-list');
    container.innerHTML = '<div class="empty-state">불러오는 중...</div>';
    const { data, error } = await window.supabase.from('banners').select('*').order('created_at', { ascending: false });
    if (error || !data?.length) { container.innerHTML = '<div class="empty-state">등록된 배너가 없습니다.</div>'; return; }
    container.innerHTML = data.map(b => `
        <div class="banner-item">
            <div class="banner-preview-card"
                 style="background:linear-gradient(135deg,${escHtml(b.color1||'#9d4edd')}22 0%,${escHtml(b.color2||'#c77dff')}11 100%);border-bottom:1px solid ${escHtml(b.color1||'#9d4edd')}33;">
                <div class="banner-preview-top">
                    <span class="banner-preview-icon">${escHtml(b.icon||'✦')}</span>
                    <span class="banner-preview-label">${escHtml(b.title||'')}</span>
                    ${!b.is_active?'<span class="banner-inactive-badge">비활성</span>':''}
                </div>
                <p class="banner-preview-desc">${escHtml(b.description||'')}</p>
            </div>
            <div class="banner-item-actions">
                <button class="btn-edit" onclick="openEditBanner('${b.id}')">
                    <span class="material-symbols-rounded" style="font-size:1rem;">edit</span>수정
                </button>
                <button class="btn-danger" onclick="deleteBanner('${b.id}')">
                    <span class="material-symbols-rounded" style="font-size:1rem;">delete</span>삭제
                </button>
            </div>
        </div>`).join('');
}

function setupBannerModal() {
    document.getElementById('banner-add-btn').addEventListener('click', () => openBannerModal(null));
    document.getElementById('modal-close').addEventListener('click', closeBannerModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeBannerModal);
    document.getElementById('modal-save-btn').addEventListener('click', saveBanner);
    document.getElementById('banner-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('banner-modal')) closeBannerModal();
    });
    ['banner-title-input','banner-desc-input','banner-icon-input','banner-color1','banner-color2'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePreview);
    });
}

function openBannerModal(banner) {
    editingBannerId = banner ? banner.id : null;
    document.getElementById('modal-title').textContent = banner ? '배너 수정' : '배너 추가';
    document.getElementById('banner-title-input').value = banner?.title || '';
    document.getElementById('banner-desc-input').value  = banner?.description || '';
    document.getElementById('banner-url-input').value   = banner?.url || '';
    document.getElementById('banner-color1').value      = banner?.color1 || '#9d4edd';
    document.getElementById('banner-color2').value      = banner?.color2 || '#c77dff';
    document.getElementById('banner-icon-input').value  = banner?.icon || '✦';
    document.getElementById('banner-active').checked    = banner?.is_active !== false;
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
    const title = document.getElementById('banner-title-input').value || 'BANNER TITLE';
    const desc  = document.getElementById('banner-desc-input').value  || '부제목';
    const icon  = document.getElementById('banner-icon-input').value  || '✦';
    const c1    = document.getElementById('banner-color1').value;
    const c2    = document.getElementById('banner-color2').value;
    const preview = document.getElementById('banner-preview');
    preview.style.background = `linear-gradient(135deg,${c1}33 0%,${c2}18 100%)`;
    preview.style.borderLeft  = `3px solid ${c1}`;
    preview.innerHTML = `
        <div class="bp-top"><span class="bp-icon">${escHtml(icon)}</span><span class="bp-title">${escHtml(title)}</span></div>
        <span class="bp-desc">${escHtml(desc)}</span>`;
}
async function saveBanner() {
    const payload = {
        title: document.getElementById('banner-title-input').value.trim(),
        description: document.getElementById('banner-desc-input').value.trim(),
        url: document.getElementById('banner-url-input').value.trim() || null,
        color1: document.getElementById('banner-color1').value,
        color2: document.getElementById('banner-color2').value,
        icon: document.getElementById('banner-icon-input').value.trim() || '✦',
        is_active: document.getElementById('banner-active').checked,
    };
    if (!payload.title) { alert('배너 제목을 입력해 주세요.'); return; }
    let error;
    if (editingBannerId) {
        ({ error } = await window.supabase.from('banners').update(payload).eq('id', editingBannerId));
    } else {
        ({ error } = await window.supabase.from('banners').insert(payload));
    }
    if (error) { alert('저장 실패: ' + error.message); return; }
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
   토스트
───────────────────────────────────────── */
function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
        position:'fixed', bottom:'30px', left:'50%', transform:'translateX(-50%)',
        background:'var(--bg-1)', border:'1px solid var(--primary)',
        color:'var(--text-0)', padding:'12px 24px', borderRadius:'12px',
        fontSize:'0.88rem', fontWeight:'700', zIndex:'99999',
        boxShadow:'0 8px 24px rgba(0,0,0,0.4)', animation:'ugSlideUp 0.2s ease',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

/* ─────────────────────────────────────────
   유틸
───────────────────────────────────────── */
function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDateFull(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${fmtDate(iso)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ─────────────────────────────────────────
   프로필 배너 지급 / 회수
───────────────────────────────────────── */
const PROFILE_BANNERS = [
    { id: 'banner_violet',   name: '보라빛 심연',  preview: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' },
    { id: 'banner_rose',     name: '장미빛 새벽',  preview: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)' },
    { id: 'banner_ocean',    name: '심해의 파랑',  preview: 'linear-gradient(135deg, #0284c7 0%, #075985 100%)' },
    { id: 'banner_forest',   name: '어두운 숲',    preview: 'linear-gradient(135deg, #16a34a 0%, #14532d 100%)' },
    { id: 'banner_ember',    name: '잿빛 불꽃',    preview: 'linear-gradient(135deg, #ea580c 0%, #9a3412 100%)' },
    { id: 'banner_midnight', name: '미드나잇',     preview: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' },
];

let _bannerGrantUserId = null;
let _bannerGrantOwned  = new Set();

async function openBannerGrantModal(uid, uname) {
    _bannerGrantUserId = uid;
    document.getElementById('banner-grant-target-name').textContent = uname || uid;

    // 현재 보유 배너 조회
    const { data: owned } = await window.supabase
        .from('user_banners')
        .select('banner_id')
        .eq('user_id', uid);
    _bannerGrantOwned = new Set((owned || []).map(r => r.banner_id));

    renderBannerGrantGrid();
    document.getElementById('banner-grant-modal').style.display = 'flex';
}

function renderBannerGrantGrid() {
    const grid = document.getElementById('banner-grant-grid');
    grid.innerHTML = PROFILE_BANNERS.map(b => {
        const has = _bannerGrantOwned.has(b.id);
        return `
        <div style="border-radius:12px;overflow:hidden;border:2px solid ${has ? 'var(--primary)' : 'var(--border)'};cursor:pointer;transition:all 0.2s;"
             onclick="toggleBannerGrant('${b.id}')">
            <div style="height:60px;background:${b.preview};"></div>
            <div style="padding:8px 10px;background:var(--bg-2);display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.82rem;font-weight:600;color:var(--text-1);">${b.name}</span>
                <span style="font-size:0.75rem;font-weight:700;color:${has ? 'var(--primary)' : 'var(--text-3)'};">
                    ${has ? '보유 ✓' : '미보유'}
                </span>
            </div>
        </div>`;
    }).join('');
}

async function toggleBannerGrant(bannerId) {
    const has = _bannerGrantOwned.has(bannerId);
    if (has) {
        // 회수
        await window.supabase
            .from('user_banners')
            .delete()
            .eq('user_id', _bannerGrantUserId)
            .eq('banner_id', bannerId);
        _bannerGrantOwned.delete(bannerId);
    } else {
        // 지급
        await window.supabase
            .from('user_banners')
            .upsert([{ user_id: _bannerGrantUserId, banner_id: bannerId }]);
        _bannerGrantOwned.add(bannerId);
    }
    renderBannerGrantGrid();
}

function closeBannerGrantModal() {
    document.getElementById('banner-grant-modal').style.display = 'none';
    _bannerGrantUserId = null;
    _bannerGrantOwned  = new Set();
}

/* ─── 실행 ─── */
initAdmin();
