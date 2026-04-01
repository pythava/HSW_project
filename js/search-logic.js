/* js/search-logic.js */

let _me = null;
let _searchTimer = null;
let _currentFilter = 'all';
let _lastQuery = '';
let _allUserResults = [];

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = './login.html'; return; }
    _me = user;

    if (typeof checkNotiBadge === 'function') checkNotiBadge(user.id);
    if (typeof checkMsgBadge  === 'function') checkMsgBadge(user.id);

    await loadTrendingPams();
    await loadTrendingPosts();
    bindEvents();
});

function bindEvents() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear');
    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearBtn.style.display = q ? 'flex' : 'none';
        clearTimeout(_searchTimer);
        if (!q) { showDefault(); return; }
        _searchTimer = setTimeout(() => doSearch(q), 350);
    });
    clearBtn.addEventListener('click', () => {
        input.value = ''; clearBtn.style.display = 'none'; showDefault(); input.focus();
    });
    document.querySelectorAll('.filter-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _currentFilter = btn.dataset.filter;
            applyFilter(_currentFilter);
        });
    });
    document.getElementById('user-more-btn').addEventListener('click', () => {
        renderAllUsers();
        document.getElementById('user-more-btn').style.display = 'none';
    });
}

function showDefault() {
    document.getElementById('search-default').style.display = 'block';
    document.getElementById('search-results').style.display = 'none';
}
function showResults() {
    document.getElementById('search-default').style.display = 'none';
    document.getElementById('search-results').style.display = 'flex';
    document.getElementById('search-results').style.flexDirection = 'column';
}

async function doSearch(q) {
    _lastQuery = q;
    showResults();
    _currentFilter = 'all';
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-tab[data-filter="all"]').classList.add('active');

    const { data: users } = await supabase.from('profiles').select('id, username, avatar_url, bio').ilike('username', `%${q}%`).limit(20);
    _allUserResults = users || [];

    const { data: pams } = await supabase.from('pams').select('*').or(`name.ilike.%${q}%,description.ilike.%${q}%`).limit(10);

    const { data: posts } = await supabase.from('posts')
        .select('id, content, image_url, image_urls, title, tags, created_at, likes(count), comments(count)')
        .ilike('content', `%${q}%`).limit(30);

    renderUserResults(_allUserResults.slice(0, 8));
    renderPamResults(pams || []);
    renderPostResults(posts || []);

    document.getElementById('user-more-btn').style.display = _allUserResults.length > 8 ? 'flex' : 'none';
    const hasAny = _allUserResults.length > 0 || (pams && pams.length > 0) || (posts && posts.length > 0);
    document.getElementById('no-results').style.display = hasAny ? 'none' : 'block';
    applyFilter('all');
}

/* ─── 유저 ─── */
function renderUserResults(users) {
    const container = document.getElementById('result-users');
    if (!users.length) { container.innerHTML = ''; document.getElementById('result-users-section').style.display = 'none'; return; }
    document.getElementById('result-users-section').style.display = 'block';
    container.innerHTML = users.map(u => buildUserItem(u)).join('');
}
function renderAllUsers() {
    document.getElementById('result-users').innerHTML = _allUserResults.map(u => buildUserItem(u)).join('');
}
function buildUserItem(u) {
    const avatar = u.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${u.id}`;
    const bio = u.bio ? escHtml(u.bio).substring(0, 30) + (u.bio.length > 30 ? '...' : '') : 'Deep Web Resident';
    return `<a href="./profile/index.html?id=${u.id}" class="user-item">
        <img src="${avatar}" class="user-item-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${u.id}'">
        <div class="user-item-info">
            <div class="user-item-name">${escHtml(u.username || '익명')}</div>
            <div class="user-item-sub">${bio}</div>
        </div></a>`;
}

/* ─── 팸 ─── */
function renderPamResults(pams) {
    const container = document.getElementById('result-pams');
    const section = document.getElementById('result-pams-section');
    if (!pams.length) { section.style.display = 'none'; container.innerHTML = ''; return; }
    section.style.display = 'block';
    container.innerHTML = pams.map(p => buildPamCard(p)).join('');
    container.querySelectorAll('.pam-card').forEach((el, i) => {
        el.addEventListener('click', e => { e.preventDefault(); openPamModal(pams[i]); });
    });
}
function buildPamCard(p) {
    const imgHtml = p.image_url
        ? `<img src="${p.image_url}" alt="${escHtml(p.name)}" onerror="this.parentElement.innerHTML='<div class=pam-card-img-placeholder>🌿</div>'">`
        : `<div class="pam-card-img-placeholder">🌿</div>`;
    return `<a href="#" class="pam-card">
        <div class="pam-card-img">${imgHtml}
            <div class="pam-card-badge"><span class="material-symbols-rounded">group</span>${p.member_count || 0}</div>
        </div>
        <div class="pam-card-info">
            <div class="pam-card-name">${escHtml(p.name)}</div>
            <div class="pam-card-desc">${escHtml(p.description || '')}</div>
        </div></a>`;
}

/* ─── 게시물 ─── */
function renderPostResults(posts) {
    const container = document.getElementById('result-posts');
    const section = document.getElementById('result-posts-section');
    if (!posts.length) { section.style.display = 'none'; container.innerHTML = ''; return; }
    section.style.display = 'block';
    container.innerHTML = posts.map(p => buildPostGridItem(p)).join('');
    container.querySelectorAll('.post-grid-item').forEach((el, i) => {
        el.addEventListener('click', () => openPostModal(posts[i]));
    });
}
function buildPostGridItem(p) {
    const likes    = p.likes?.[0]?.count ?? 0;
    const comments = p.comments?.[0]?.count ?? 0;
    if (p.image_url) {
        return `<div class="post-grid-item" style="cursor:pointer;">
            <img src="${p.image_url}" alt="게시물" loading="lazy">
            <div class="post-grid-item-overlay">
                <div class="post-grid-stat"><span class="material-symbols-rounded">favorite</span>${likes}</div>
                <div class="post-grid-stat"><span class="material-symbols-rounded">chat_bubble</span>${comments}</div>
            </div></div>`;
    }
    return `<div class="post-grid-item" style="cursor:pointer;">
        <div class="post-grid-text">${escHtml((p.content||'').substring(0,80))}</div>
        <div class="post-grid-item-overlay">
            <div class="post-grid-stat"><span class="material-symbols-rounded">favorite</span>${likes}</div>
            <div class="post-grid-stat"><span class="material-symbols-rounded">chat_bubble</span>${comments}</div>
        </div></div>`;
}

function applyFilter(filter) {
    document.getElementById('result-users-section').style.display = (filter==='all'||filter==='user') ? 'block' : 'none';
    document.getElementById('result-pams-section').style.display  = (filter==='all'||filter==='pam')  ? 'block' : 'none';
    document.getElementById('result-posts-section').style.display = (filter==='all'||filter==='post') ? 'block' : 'none';
}

/* ─── 기본 화면 ─── */
async function loadTrendingPams() {
    const container = document.getElementById('trending-pams');
    const { data: pams } = await supabase.from('pams').select('*').order('member_count', { ascending: false }).limit(8);
    if (!pams || !pams.length) { container.innerHTML = '<div style="color:var(--text-3);font-size:0.85rem;padding:20px;">팸이 없어요</div>'; return; }
    container.innerHTML = pams.map(p => buildPamCard(p)).join('');
    container.querySelectorAll('.pam-card').forEach((el, i) => {
        el.addEventListener('click', e => { e.preventDefault(); openPamModal(pams[i]); });
    });
}
async function loadTrendingPosts() {
    const container = document.getElementById('trending-posts');
    const { data: posts } = await supabase.from('posts')
        .select('id, content, image_url, image_urls, title, tags, created_at, likes(count), comments(count)')
        .order('created_at', { ascending: false }).limit(12);
    if (!posts || !posts.length) { container.innerHTML = '<div style="color:var(--text-3);font-size:0.85rem;padding:20px;grid-column:1/-1;">게시물이 없어요</div>'; return; }
    container.innerHTML = posts.map(p => buildPostGridItem(p)).join('');
    container.querySelectorAll('.post-grid-item').forEach((el, i) => {
        el.addEventListener('click', () => openPostModal(posts[i]));
    });
}

/* ═══════════════════════════════════════
   게시물 모달 (인스타 스타일)
═══════════════════════════════════════ */
async function openPostModal(post) {
    const { data: full } = await supabase
        .from('posts')
        .select('*, profiles(id, username, avatar_url), likes(count), comments(count)')
        .eq('id', post.id).single();
    const p = full || post;

    const imgs         = (p.image_urls && p.image_urls.length > 0) ? p.image_urls : (p.image_url ? [p.image_url] : []);
    const likeCount    = p.likes?.[0]?.count ?? 0;
    const commentCount = p.comments?.[0]?.count ?? 0;
    const author       = p.profiles;
    const avatar       = author?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${p.user_id}`;
    const username     = author?.username || '익명';
    const plainContent = (p.content || '').replace(/[#*`>~_\[\]]/g, '').trim();
    const tagsHtml     = (p.tags || []).map(t => `<span style="display:inline-block;padding:2px 10px;background:var(--bg-2);border-radius:20px;font-size:0.78rem;color:var(--primary);font-weight:600;">#${escHtml(t)}</span>`).join('');
    const timeStr      = formatTime(new Date(p.created_at));
    const hasImg       = imgs.length > 0;

    let mediaHtml = '';
    if (imgs.length > 1) {
        mediaHtml = `<div style="position:relative;background:#000;flex:1;display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden;">
            <div id="srch-modal-slides" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
                ${imgs.map((u,i) => `<img src="${u}" style="max-width:100%;max-height:100%;object-fit:contain;display:${i===0?'block':'none'};">`).join('')}
            </div>
            <button onclick="srchModalCarousel(-1)" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.55);color:#fff;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;z-index:2;">&#8249;</button>
            <button onclick="srchModalCarousel(1)"  style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.55);color:#fff;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;z-index:2;">&#8250;</button>
            <div style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:5px;" id="srch-modal-dots">
                ${imgs.map((_, i) => `<div style="width:6px;height:6px;border-radius:50%;background:${i===0?'#fff':'rgba(255,255,255,0.4)'};transition:background 0.2s;"></div>`).join('')}
            </div></div>`;
    } else if (imgs.length === 1) {
        mediaHtml = `<div style="background:#000;flex:1;display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden;">
            <img src="${imgs[0]}" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`;
    }

    let overlay = document.getElementById('srch-post-modal-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'srch-post-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
    <style>@keyframes srchModalIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}</style>
    <div style="display:flex;flex-direction:${hasImg?'row':'column'};width:${hasImg?'min(900px,94vw)':'min(520px,94vw)'};max-height:90vh;background:var(--bg-1);border-radius:16px;overflow:hidden;border:1px solid var(--border);animation:srchModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1);">
        ${hasImg ? mediaHtml : ''}
        <div style="width:${hasImg?'340px':'100%'};min-width:${hasImg?'280px':'unset'};flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-1);">
            <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);flex-shrink:0;">
                <img src="${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${p.user_id}'">
                <div>
                    <div style="font-weight:700;font-size:0.88rem;color:var(--text-0);">@${escHtml(username)}</div>
                    <div style="font-size:0.72rem;color:var(--text-3);">${timeStr}</div>
                </div>
                <button onclick="document.getElementById('srch-post-modal-overlay').remove()" style="margin-left:auto;width:30px;height:30px;background:var(--bg-2);border:none;border-radius:50%;color:var(--text-2);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>
            <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:0;">
                ${p.title ? `<div style="font-size:1.05rem;font-weight:800;color:var(--text-0);line-height:1.3;">${escHtml(p.title)}</div>` : ''}
                ${plainContent ? `<p style="font-size:0.88rem;color:var(--text-1);line-height:1.75;white-space:pre-wrap;margin:0;">${escHtml(plainContent)}</p>` : ''}
                ${tagsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${tagsHtml}</div>` : ''}
            </div>
            <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:18px;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:5px;color:var(--text-2);font-size:0.85rem;">
                    <span class="material-symbols-rounded" style="font-size:18px;color:#f43f5e;">favorite</span>
                    <span style="font-weight:600;">${likeCount}</span>
                </div>
                <div style="display:flex;align-items:center;gap:5px;color:var(--text-2);font-size:0.85rem;">
                    <span class="material-symbols-rounded" style="font-size:18px;">chat_bubble</span>
                    <span style="font-weight:600;">${commentCount}</span>
                </div>
            </div>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    window._srchCarouselIdx  = 0;
    window._srchCarouselImgs = imgs;
}

window.srchModalCarousel = function(dir) {
    const imgs = window._srchCarouselImgs || [];
    if (imgs.length < 2) return;
    window._srchCarouselIdx = (window._srchCarouselIdx + dir + imgs.length) % imgs.length;
    const idx = window._srchCarouselIdx;
    document.querySelectorAll('#srch-modal-slides img').forEach((s, i) => s.style.display = i === idx ? 'block' : 'none');
    document.querySelectorAll('#srch-modal-dots div').forEach((d, i) => {
        d.style.background = i === idx ? '#fff' : 'rgba(255,255,255,0.4)';
    });
};

/* ═══════════════════════════════════════
   팸 모달
═══════════════════════════════════════ */
async function openPamModal(pam) {
    const { data: p } = await supabase.from('pams').select('*, profiles(username, avatar_url)').eq('id', pam.id).single();
    const data = p || pam;
    const imgSrc    = data.image_url || '';
    const ownerName = data.profiles?.username || '';

    let overlay = document.getElementById('srch-pam-modal-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'srch-pam-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
    <style>@keyframes srchModalIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}</style>
    <div style="width:min(460px,94vw);background:var(--bg-1);border-radius:20px;overflow:hidden;border:1px solid var(--border);animation:srchModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1);">
        <div style="width:100%;height:200px;background:var(--bg-2);position:relative;overflow:hidden;">
            ${imgSrc ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:64px;">🌿</div>`}
            <button onclick="document.getElementById('srch-pam-modal-overlay').remove()" style="position:absolute;top:12px;right:12px;width:32px;height:32px;background:rgba(0,0,0,0.5);border:none;border-radius:50%;color:#fff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>
        <div style="padding:20px 22px 24px;">
            <div style="font-size:1.25rem;font-weight:800;color:var(--text-0);margin-bottom:6px;">${escHtml(data.name||'')}</div>
            ${data.description ? `<p style="font-size:0.88rem;color:var(--text-1);line-height:1.7;margin:0 0 14px;">${escHtml(data.description)}</p>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;">
                <div style="display:flex;align-items:center;gap:5px;font-size:0.82rem;color:var(--text-2);">
                    <span class="material-symbols-rounded" style="font-size:16px;">group</span>
                    <b style="color:var(--text-0);">${data.member_count||0}</b>명
                </div>
                ${data.region ? `<div style="display:flex;align-items:center;gap:5px;font-size:0.82rem;color:var(--text-2);"><span class="material-symbols-rounded" style="font-size:16px;">location_on</span>${escHtml(data.region)}</div>` : ''}
                ${ownerName ? `<div style="display:flex;align-items:center;gap:5px;font-size:0.82rem;color:var(--text-2);"><span class="material-symbols-rounded" style="font-size:16px;">person</span>@${escHtml(ownerName)}</div>` : ''}
            </div>
            <a href="./pam.html?id=${data.id}" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px;background:var(--primary);color:#fff;border-radius:12px;font-weight:700;font-size:0.9rem;text-decoration:none;">
                <span class="material-symbols-rounded" style="font-size:18px;">groups</span>팸 페이지로 이동
            </a>
        </div>
    </div>`;

    document.body.appendChild(overlay);
}

/* ─── 유틸 ─── */
function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatTime(date) {
    const diff = (Date.now() - date) / 1000;
    if (diff < 60)     return '방금 전';
    if (diff < 3600)   return `${Math.floor(diff/60)}분 전`;
    if (diff < 86400)  return `${Math.floor(diff/3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff/86400)}일 전`;
    return `${date.getMonth()+1}월 ${date.getDate()}일`;
}
