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

    checkNotiBadge && checkNotiBadge(user.id);
    checkMsgBadge && checkMsgBadge(user.id);

    // 기본 화면 데이터 로드
    await loadTrendingPams();
    await loadTrendingPosts();

    bindEvents();
});

/* ─── 이벤트 바인딩 ─── */
function bindEvents() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear');

    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearBtn.style.display = q ? 'flex' : 'none';

        clearTimeout(_searchTimer);
        if (!q) {
            showDefault();
            return;
        }
        _searchTimer = setTimeout(() => doSearch(q), 350);
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        showDefault();
        input.focus();
    });

    // 필터 탭
    document.querySelectorAll('.filter-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _currentFilter = btn.dataset.filter;
            applyFilter(_currentFilter);
        });
    });

    // 더 보기 버튼
    document.getElementById('user-more-btn').addEventListener('click', () => {
        renderAllUsers();
        document.getElementById('user-more-btn').style.display = 'none';
    });
}

/* ─── 기본/결과 화면 전환 ─── */
function showDefault() {
    document.getElementById('search-default').style.display = 'block';
    document.getElementById('search-results').style.display = 'none';
}

function showResults() {
    document.getElementById('search-default').style.display = 'none';
    document.getElementById('search-results').style.display = 'flex';
    document.getElementById('search-results').style.flexDirection = 'column';
}

/* ─── 검색 실행 ─── */
async function doSearch(q) {
    _lastQuery = q;
    showResults();

    // 필터 초기화
    _currentFilter = 'all';
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-tab[data-filter="all"]').classList.add('active');

    // 유저 검색
    const { data: users } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, bio')
        .ilike('username', `%${q}%`)
        .limit(20);

    _allUserResults = users || [];

    // 팸 검색
    const { data: pams } = await supabase
        .from('pams')
        .select('*')
        .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(10);

    // 게시물 검색
    const { data: posts } = await supabase
        .from('posts')
        .select('id, content, image_url, like_count, comment_count')
        .ilike('content', `%${q}%`)
        .limit(30);

    // 렌더
    renderUserResults(_allUserResults.slice(0, 8));
    renderPamResults(pams || []);
    renderPostResults(posts || []);

    // 더보기 버튼 표시
    const moreBtn = document.getElementById('user-more-btn');
    moreBtn.style.display = _allUserResults.length > 8 ? 'flex' : 'none';

    // 결과 없음
    const hasAny = _allUserResults.length > 0 || (pams && pams.length > 0) || (posts && posts.length > 0);
    document.getElementById('no-results').style.display = hasAny ? 'none' : 'block';

    applyFilter('all');
}

/* ─── 유저 렌더 ─── */
function renderUserResults(users) {
    const container = document.getElementById('result-users');
    if (!users.length) {
        container.innerHTML = '';
        document.getElementById('result-users-section').style.display = 'none';
        return;
    }
    document.getElementById('result-users-section').style.display = 'block';
    container.innerHTML = users.map(u => buildUserItem(u)).join('');
}

function renderAllUsers() {
    const container = document.getElementById('result-users');
    container.innerHTML = _allUserResults.map(u => buildUserItem(u)).join('');
}

function buildUserItem(u) {
    const avatar = u.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${u.id}`;
    const bio = u.bio ? escHtml(u.bio).substring(0, 30) + (u.bio.length > 30 ? '...' : '') : 'Deep Web Resident';
    return `
        <a href="./profile/index.html?id=${u.id}" class="user-item">
            <img src="${avatar}" class="user-item-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${u.id}'">
            <div class="user-item-info">
                <div class="user-item-name">${escHtml(u.username || '익명')}</div>
                <div class="user-item-sub">${bio}</div>
            </div>
        </a>
    `;
}

/* ─── 팸 렌더 ─── */
function renderPamResults(pams) {
    const container = document.getElementById('result-pams');
    const section = document.getElementById('result-pams-section');
    if (!pams.length) { section.style.display = 'none'; container.innerHTML = ''; return; }
    section.style.display = 'block';
    container.innerHTML = pams.map(p => buildPamCard(p)).join('');
}

function buildPamCard(p) {
    const imgHtml = p.cover_url
        ? `<img src="${p.cover_url}" alt="${escHtml(p.name)}" onerror="this.parentElement.innerHTML='<div class=pam-card-img-placeholder>🌿</div>'">`
        : `<div class="pam-card-img-placeholder">🌿</div>`;
    return `
        <a href="./pam.html?id=${p.id}" class="pam-card">
            <div class="pam-card-img">
                ${imgHtml}
                <div class="pam-card-badge">
                    <span class="material-symbols-rounded">group</span>
                    ${p.member_count || 0}
                </div>
            </div>
            <div class="pam-card-info">
                <div class="pam-card-name">${escHtml(p.name)}</div>
                <div class="pam-card-desc">${escHtml(p.description || '')}</div>
            </div>
        </a>
    `;
}

/* ─── 게시물 렌더 ─── */
function renderPostResults(posts) {
    const container = document.getElementById('result-posts');
    const section = document.getElementById('result-posts-section');
    if (!posts.length) { section.style.display = 'none'; container.innerHTML = ''; return; }
    section.style.display = 'block';
    container.innerHTML = posts.map(p => buildPostGridItem(p)).join('');
}

function buildPostGridItem(p) {
    const likes = p.like_count || 0;
    const comments = p.comment_count || 0;
    if (p.image_url) {
        return `
            <div class="post-grid-item" onclick="location.href='./post.html?id=${p.id}'">
                <img src="${p.image_url}" alt="게시물" loading="lazy">
                <div class="post-grid-item-overlay">
                    <div class="post-grid-stat">
                        <span class="material-symbols-rounded">favorite</span>${likes}
                    </div>
                    <div class="post-grid-stat">
                        <span class="material-symbols-rounded">chat_bubble</span>${comments}
                    </div>
                </div>
            </div>
        `;
    }
    const text = (p.content || '').substring(0, 80);
    return `
        <div class="post-grid-item" onclick="location.href='./post.html?id=${p.id}'">
            <div class="post-grid-text">${escHtml(text)}</div>
            <div class="post-grid-item-overlay">
                <div class="post-grid-stat">
                    <span class="material-symbols-rounded">favorite</span>${likes}
                </div>
                <div class="post-grid-stat">
                    <span class="material-symbols-rounded">chat_bubble</span>${comments}
                </div>
            </div>
        </div>
    `;
}

/* ─── 필터 적용 ─── */
function applyFilter(filter) {
    const us = document.getElementById('result-users-section');
    const ps = document.getElementById('result-pams-section');
    const po = document.getElementById('result-posts-section');

    us.style.display = (filter === 'all' || filter === 'user') ? 'block' : 'none';
    ps.style.display = (filter === 'all' || filter === 'pam') ? 'block' : 'none';
    po.style.display = (filter === 'all' || filter === 'post') ? 'block' : 'none';
}

/* ─── 기본 화면: 인기 팸 ─── */
async function loadTrendingPams() {
    const container = document.getElementById('trending-pams');
    const { data: pams } = await supabase
        .from('pams')
        .select('*')
        .order('member_count', { ascending: false })
        .limit(8);

    if (!pams || !pams.length) {
        container.innerHTML = '<div style="color:var(--text-3);font-size:0.85rem;padding:20px;">팸이 없어요</div>';
        return;
    }
    container.innerHTML = pams.map(p => buildPamCard(p)).join('');
}

/* ─── 기본 화면: 인기 게시물 ─── */
async function loadTrendingPosts() {
    const container = document.getElementById('trending-posts');
    const { data: posts } = await supabase
        .from('posts')
        .select('id, content, image_url, like_count, comment_count')
        .order('like_count', { ascending: false })
        .limit(12);

    if (!posts || !posts.length) {
        container.innerHTML = '<div style="color:var(--text-3);font-size:0.85rem;padding:20px;grid-column:1/-1;">게시물이 없어요</div>';
        return;
    }
    container.innerHTML = posts.map(p => buildPostGridItem(p)).join('');
}

/* ─── 유틸 ─── */
function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
