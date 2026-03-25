/* js/main-logic.js */

// 전역 유저 캐시
let _currentUser = null;
async function getCurrentUser() {
    if (_currentUser) return _currentUser;
    const { data: { user } } = await supabase.auth.getUser();
    _currentUser = user;
    return user;
}

function loadMarked() {
    return new Promise((resolve) => {
        if (window.marked) return resolve();
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
        s.onload = resolve;
        document.head.appendChild(s);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadMarked();
    marked.setOptions({ breaks: true, gfm: true });

    fetchPosts();
    fetchTrendingQueries();

    const tabs = document.querySelectorAll('.feed-tabs .tab-item');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });
});

/* ─────────────────────────────────────────
   게시물 로드
───────────────────────────────────────── */
async function fetchPosts() {
    const feedContainer = document.getElementById('main-feed');
    const loader = feedContainer.querySelector('.feed-loader');

    try {
        const { data: posts, error } = await supabase
            .from('posts')
            .select('*, profiles(username, avatar_url)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (loader) loader.remove();

        if (!posts || posts.length === 0) {
            feedContainer.innerHTML = `
                <div class="feed-empty">
                    <span class="material-symbols-rounded" style="font-size:48px;color:var(--text-3);display:block;margin-bottom:16px;">eco</span>
                    <p>가든에 아직 아무도 없네요.<br>첫 번째 씨앗을 심어보세요.</p>
                </div>`;
            return;
        }

        const user = await getCurrentUser();
        let likedSet = new Set();
        if (user) {
            const { data: likes } = await supabase
                .from('likes').select('post_id').eq('user_id', user.id);
            if (likes) likes.forEach(l => likedSet.add(l.post_id));
        }

        const postIds = posts.map(p => p.id);
        const { data: likesCounts } = await supabase
            .from('likes')
            .select('post_id')
            .in('post_id', postIds);

        const likesCountMap = {};
        (likesCounts || []).forEach(l => {
            likesCountMap[l.post_id] = (likesCountMap[l.post_id] || 0) + 1;
        });

        for (const post of posts) {
            const { data: comments } = await supabase
                .from('comments')
                .select('*')
                .eq('post_id', post.id)
                .order('created_at', { ascending: false }); // 최신이 위

            const rawComments = comments || [];

            const commentUserIds = [...new Set(rawComments.map(c => c.user_id).filter(Boolean))];
            let profileMap = {};
            if (commentUserIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url')
                    .in('id', commentUserIds);
                (profiles || []).forEach(p => { profileMap[p.id] = p; });
            }
            const recentComments = rawComments.map(c => ({
                ...c,
                profiles: profileMap[c.user_id] || null
            }));

            post.likes_count = likesCountMap[post.id] || 0;
            feedContainer.appendChild(
                createPostCard(post, likedSet.has(post.id), user, recentComments)
            );
        }

    } catch (err) {
        console.error('Fetch Error:', err);
        if (loader) loader.remove();
        feedContainer.innerHTML = `
            <div class="feed-error">
                <span class="material-symbols-rounded">error</span>
                데이터를 불러오지 못했습니다.<br>
                <small>${err.message}</small>
            </div>`;
    }
}

/* ─────────────────────────────────────────
   카드 생성
───────────────────────────────────────── */
function createPostCard(post, isLiked = false, currentUser = null, recentComments = []) {
    const article = document.createElement('article');
    article.className = 'post-card';
    article.dataset.postId = post.id;

    const avatar    = post.profiles?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${post.user_id}`;
    const username  = post.profiles?.username || post.user_id?.slice(0, 8) || 'anonymous';
    const timeAgo   = formatTime(new Date(post.created_at));
    const tagsHtml  = (post.tags || []).map(t => `<span class="post-tag">#${t}</span>`).join('');
    const likeCount = post.likes_count || 0;
    const userSeed  = currentUser ? currentUser.id : 'guest';

    const renderedFull = window.marked ? marked.parse(post.content || '') : (post.content || '');
    const commentsHtml = buildCommentsHtml(recentComments);

    article.innerHTML = `
        <div class="post-card-inner">

            <div class="post-card-header">
                <img class="post-avatar" src="${avatar}" alt="${username}">
                <div class="post-meta">
                    <span class="post-username">@${username}</span>
                    <span class="post-time">${timeAgo}</span>
                </div>
            </div>

            ${post.title ? `<h2 class="post-title">${escapeHtml(post.title)}</h2>` : ''}

            ${post.image_url ? `
                <div class="post-image-wrap">
                    <img src="${post.image_url}" alt="첨부 이미지" class="post-image" loading="lazy">
                </div>` : ''}

            <div class="post-body markdown-rendered post-body-collapsed" id="body-${post.id}">
                ${renderedFull}
            </div>
            <button class="expand-btn" id="expand-${post.id}" data-expanded="false">
                더 보기 <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;">expand_more</span>
            </button>

            ${tagsHtml ? `<div class="post-tags">${tagsHtml}</div>` : ''}

            <div class="post-actions">
                <button class="action-btn like-btn ${isLiked ? 'liked' : ''}"
                    data-post-id="${post.id}" data-liked="${isLiked}">
                    <span class="material-symbols-rounded like-icon"
                        style="font-variation-settings:'FILL' ${isLiked ? 1 : 0}">favorite</span>
                    <span class="like-count">${likeCount}</span>
                </button>
                <button class="action-btn comment-toggle-btn" data-post-id="${post.id}">
                    <span class="material-symbols-rounded">chat_bubble</span>
                    <span class="comment-count-label">${recentComments.length > 0 ? recentComments.length : '댓글'}</span>
                </button>
                <button class="action-btn share-btn">
                    <span class="material-symbols-rounded">ios_share</span>
                </button>
            </div>

            <!-- 댓글 영역 (기본 숨김) -->
            <div class="comment-section collapsed" id="comments-${post.id}">
                <div class="comment-list" id="comment-list-${post.id}">
                    ${commentsHtml}
                </div>
                <div class="comment-input-row">
                    <img class="comment-avatar-sm"
                        src="https://api.dicebear.com/7.x/identicon/svg?seed=${userSeed}" alt="">
                    <input type="text" class="comment-input"
                        placeholder="댓글 달기..." data-post-id="${post.id}">
                    <button class="comment-send-btn">
                        <span class="material-symbols-rounded">send</span>
                    </button>
                </div>
            </div>

        </div>
    `;

    const bodyEl    = article.querySelector(`#body-${post.id}`);
    const expandBtn = article.querySelector(`#expand-${post.id}`);

    requestAnimationFrame(() => {
        if (bodyEl.scrollHeight <= bodyEl.clientHeight + 2) {
            expandBtn.style.display = 'none';
        }
    });

    expandBtn.addEventListener('click', () => {
        const expanded = expandBtn.dataset.expanded === 'true';
        if (expanded) {
            bodyEl.classList.add('post-body-collapsed');
            expandBtn.innerHTML = `더 보기 <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;">expand_more</span>`;
            expandBtn.dataset.expanded = 'false';
        } else {
            bodyEl.classList.remove('post-body-collapsed');
            expandBtn.innerHTML = `접기 <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;">expand_less</span>`;
            expandBtn.dataset.expanded = 'true';
        }
    });

    article.querySelector('.like-btn').addEventListener('click', function () {
        handleLike(post.id, this);
    });

    const commentSection = article.querySelector(`#comments-${post.id}`);
    article.querySelector('.comment-toggle-btn').addEventListener('click', () => {
        const isOpen = !commentSection.classList.contains('collapsed');
        if (isOpen) {
            commentSection.classList.add('collapsed');
        } else {
            commentSection.classList.remove('collapsed');
            loadComments(post.id);
        }
    });

    const commentInput   = article.querySelector('.comment-input');
    const commentSendBtn = article.querySelector('.comment-send-btn');
    const sendComment = () => submitComment(post.id, commentInput, currentUser);
    commentSendBtn.addEventListener('click', sendComment);
    commentInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
    });

    article.querySelector('.share-btn').addEventListener('click', () => {
        const url = `${window.location.origin}${window.location.pathname}?post=${post.id}`;
        navigator.clipboard?.writeText(url).then(() => showToast('링크가 복사됐어요!'));
    });

    return article;
}

/* ─────────────────────────────────────────
   댓글 HTML 빌더
───────────────────────────────────────── */
function buildCommentsHtml(comments) {
    if (!comments || comments.length === 0) {
        return '<p class="no-comments">아직 댓글이 없어요.</p>';
    }
    return comments.map(c => {
        const displayName = c.profiles?.username || c.user_id?.slice(0, 8) || 'anonymous';
        const avatarSrc   = c.profiles?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${c.user_id}`;
        return `
            <div class="comment-item">
                <img class="comment-avatar-sm" src="${avatarSrc}" alt="">
                <div class="comment-bubble">
                    <span class="comment-user">@${displayName}</span>
                    <p class="comment-text">${escapeHtml(c.content || '')}</p>
                    <span class="comment-time">${formatTime(new Date(c.created_at))}</span>
                </div>
            </div>`;
    }).join('');
}

/* ─────────────────────────────────────────
   좋아요 (계정당 1회)
───────────────────────────────────────── */
async function handleLike(postId, btn) {
    const user = await getCurrentUser();
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    const isLiked = btn.dataset.liked === 'true';
    const countEl = btn.querySelector('.like-count');
    const iconEl  = btn.querySelector('.like-icon');
    let count     = parseInt(countEl.textContent) || 0;

    if (isLiked) {
        btn.dataset.liked = 'false';
        btn.classList.remove('liked');
        countEl.textContent = Math.max(0, count - 1);
        iconEl.style.fontVariationSettings = "'FILL' 0";
    } else {
        btn.dataset.liked = 'true';
        btn.classList.add('liked');
        countEl.textContent = count + 1;
        iconEl.style.fontVariationSettings = "'FILL' 1";
        btn.classList.add('like-pop');
        setTimeout(() => btn.classList.remove('like-pop'), 400);
    }

    try {
        if (isLiked) {
            const { error } = await supabase.from('likes').delete()
                .eq('post_id', postId).eq('user_id', user.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('likes')
                .insert({ post_id: postId, user_id: user.id });
            if (error && error.code !== '23505' && error.status !== 409) throw error;
        }

        const { count: realCount } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', postId);

        if (realCount !== null) countEl.textContent = realCount;

    } catch (err) {
        console.error('Like error:', err);
        if (isLiked) {
            btn.dataset.liked = 'true';
            btn.classList.add('liked');
            iconEl.style.fontVariationSettings = "'FILL' 1";
        } else {
            btn.dataset.liked = 'false';
            btn.classList.remove('liked');
            iconEl.style.fontVariationSettings = "'FILL' 0";
        }
        countEl.textContent = count;
        showToast('오류가 발생했습니다.');
    }
}

/* ─────────────────────────────────────────
   댓글 로드 (최신순)
───────────────────────────────────────── */
async function loadComments(postId) {
    const listEl = document.getElementById(`comment-list-${postId}`);
    if (!listEl) return;

    try {
        const { data: comments, error } = await supabase
            .from('comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const rawComments = comments || [];
        const commentUserIds = [...new Set(rawComments.map(c => c.user_id).filter(Boolean))];
        let profileMap = {};
        if (commentUserIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .in('id', commentUserIds);
            (profiles || []).forEach(p => { profileMap[p.id] = p; });
        }

        const enriched = rawComments.map(c => ({
            ...c,
            profiles: profileMap[c.user_id] || null
        }));

        listEl.innerHTML = buildCommentsHtml(enriched);

    } catch {
        listEl.innerHTML = `<p class="no-comments" style="color:var(--error)">댓글을 불러오지 못했어요.</p>`;
    }
}

/* ─────────────────────────────────────────
   댓글 전송 (낙관적 UI)
───────────────────────────────────────── */
async function submitComment(postId, inputEl, currentUser) {
    const text = inputEl.value.trim();
    if (!text) return;

    const user = currentUser || await getCurrentUser();
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    const listEl = document.getElementById(`comment-list-${postId}`);

    if (listEl) {
        const noComment = listEl.querySelector('.no-comments');
        if (noComment) noComment.remove();

        const tempId = `temp-comment-${Date.now()}`;
        const tempComment = document.createElement('div');
        tempComment.className = 'comment-item';
        tempComment.id = tempId;

        const displayName = user.user_metadata?.username || user.email?.split('@')[0] || user.id.slice(0, 8);
        const avatarSrc   = `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
        tempComment.innerHTML = `
            <img class="comment-avatar-sm" src="${avatarSrc}" alt="">
            <div class="comment-bubble">
                <span class="comment-user">@${displayName}</span>
                <p class="comment-text">${escapeHtml(text)}</p>
                <span class="comment-time">방금 전</span>
            </div>`;

        listEl.prepend(tempComment); // 최신이 위
    }

    const countLabel = document.querySelector(`.comment-toggle-btn[data-post-id="${postId}"] .comment-count-label`);
    if (countLabel) {
        const cur = parseInt(countLabel.textContent) || 0;
        countLabel.textContent = cur + 1;
    }

    inputEl.value    = '';
    inputEl.disabled = true;

    try {
        const { error } = await supabase.from('comments').insert({
            post_id: postId, user_id: user.id,
            content: text, created_at: new Date()
        });
        if (error) throw error;

        loadComments(postId);

    } catch (err) {
        showToast('댓글 전송 실패: ' + err.message);
        const tempEl = listEl?.querySelector('[id^="temp-comment-"]');
        if (tempEl) tempEl.remove();
        inputEl.value = text;
    } finally {
        inputEl.disabled = false;
        inputEl.focus();
    }
}

/* ─────────────────────────────────────────
   인기 검색어
───────────────────────────────────────── */
async function fetchTrendingQueries() {
    const trendingList = document.getElementById('trending-queries');
    if (!trendingList) return;

    try {
        const { data, error } = await supabase.from('search_logs').select('query');
        if (error) throw error;

        const counts = (data || []).reduce((acc, c) => {
            acc[c.query] = (acc[c.query] || 0) + 1; return acc;
        }, {});
        const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5);

        trendingList.innerHTML = sorted.length === 0
            ? '<li style="color:var(--text-3);font-size:0.9rem;">검색 데이터가 없습니다.</li>'
            : sorted.map(([q, cnt], i) => `
                <li>
                    <a href="/search.html?q=${encodeURIComponent(q)}">${i+1}. ${q}</a>
                    <span class="count">${cnt > 10 ? '🔥' : cnt}</span>
                </li>`).join('');
    } catch {
        trendingList.innerHTML = '<li style="color:var(--text-3)">불러오기 실패</li>';
    }
}

/* ─────────────────────────────────────────
   유틸
───────────────────────────────────────── */
function formatTime(date) {
    const diff = (Date.now() - date) / 1000;
    if (diff < 60)     return '방금 전';
    if (diff < 3600)   return `${Math.floor(diff/60)}분 전`;
    if (diff < 86400)  return `${Math.floor(diff/3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff/86400)}일 전`;
    return `${date.getMonth()+1}월 ${date.getDate()}일`;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'ug-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
