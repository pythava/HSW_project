/* js/main-logic.js */

// marked.js 동적 로드
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

/* ───────────────────────────────────────────
   게시물 로드
─────────────────────────────────────────── */
async function fetchPosts() {
    const feedContainer = document.getElementById('main-feed');
    const loader = feedContainer.querySelector('.feed-loader');

    try {
        const { data: posts, error } = await supabase
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (loader) loader.remove();

        if (!posts || posts.length === 0) {
            feedContainer.innerHTML = `
                <div class="feed-empty">
                    <span class="material-symbols-rounded" style="font-size:48px; color:var(--text-3); display:block; margin-bottom:16px;">eco</span>
                    <p>가든에 아직 아무도 없네요.<br>첫 번째 씨앗을 심어보세요.</p>
                </div>`;
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        let likedSet = new Set();
        if (user) {
            const { data: likes } = await supabase
                .from('likes')
                .select('post_id')
                .eq('user_id', user.id);
            if (likes) likes.forEach(l => likedSet.add(l.post_id));
        }

        posts.forEach(post => {
            feedContainer.appendChild(createPostCard(post, likedSet.has(post.id), user));
        });

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

/* ───────────────────────────────────────────
   게시물 카드 생성
─────────────────────────────────────────── */
function createPostCard(post, isLiked = false, currentUser = null) {
    const article = document.createElement('article');
    article.className = 'post-card';
    article.dataset.postId = post.id;

    const avatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${post.user_id}`;
    const username = post.user_id?.slice(0, 8) || 'anonymous';
    const timeAgo = formatTime(new Date(post.created_at));
    const tagsHtml = (post.tags || []).map(t => `<span class="post-tag">#${t}</span>`).join('');
    const renderedContent = window.marked ? marked.parse(post.content || '') : (post.content || '');
    const likeCount = post.likes_count || 0;
    const userSeed = currentUser ? currentUser.id : 'guest';

    article.innerHTML = `
        <div class="post-card-inner">
            <div class="post-card-header">
                <img class="post-avatar" src="${avatar}" alt="${username}">
                <div class="post-meta">
                    <span class="post-username">@${username}</span>
                    <span class="post-time">${timeAgo}</span>
                </div>
            </div>

            ${post.title ? `<h2 class="post-title">${post.title}</h2>` : ''}

            <div class="post-body markdown-rendered">${renderedContent}</div>

            ${post.image_url ? `
                <div class="post-image-wrap">
                    <img src="${post.image_url}" alt="첨부 이미지" class="post-image" loading="lazy">
                </div>` : ''}

            ${tagsHtml ? `<div class="post-tags">${tagsHtml}</div>` : ''}

            <div class="post-actions">
                <button class="action-btn like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}" data-liked="${isLiked}">
                    <span class="material-symbols-rounded like-icon" style="font-variation-settings: 'FILL' ${isLiked ? 1 : 0}"}>favorite</span>
                    <span class="like-count">${likeCount}</span>
                </button>
                <button class="action-btn comment-toggle-btn" data-post-id="${post.id}">
                    <span class="material-symbols-rounded">chat_bubble</span>
                    <span>댓글</span>
                </button>
                <button class="action-btn share-btn">
                    <span class="material-symbols-rounded">ios_share</span>
                </button>
            </div>

            <div class="comment-section" id="comments-${post.id}" style="display:none;">
                <div class="comment-list" id="comment-list-${post.id}">
                    <div class="comment-loading">불러오는 중...</div>
                </div>
                <div class="comment-input-row">
                    <img class="comment-avatar-sm" src="https://api.dicebear.com/7.x/identicon/svg?seed=${userSeed}" alt="">
                    <input type="text" class="comment-input" placeholder="댓글 달기..." data-post-id="${post.id}">
                    <button class="comment-send-btn" data-post-id="${post.id}">
                        <span class="material-symbols-rounded">send</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    // 좋아요
    article.querySelector('.like-btn').addEventListener('click', function() {
        handleLike(post.id, this);
    });

    // 댓글 토글
    const commentSection = article.querySelector(`#comments-${post.id}`);
    article.querySelector('.comment-toggle-btn').addEventListener('click', () => {
        const isOpen = commentSection.style.display !== 'none';
        commentSection.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) loadComments(post.id);
    });

    // 댓글 전송
    const commentInput = article.querySelector('.comment-input');
    const sendComment = () => submitComment(post.id, commentInput);
    article.querySelector('.comment-send-btn').addEventListener('click', sendComment);
    commentInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); }
    });

    // 공유
    article.querySelector('.share-btn').addEventListener('click', () => {
        const url = `${window.location.origin}${window.location.pathname}?post=${post.id}`;
        navigator.clipboard?.writeText(url).then(() => showToast('링크가 복사됐어요!'));
    });

    return article;
}

/* ───────────────────────────────────────────
   좋아요
─────────────────────────────────────────── */
async function handleLike(postId, btn) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    const isLiked = btn.dataset.liked === 'true';
    const countEl = btn.querySelector('.like-count');
    const iconEl = btn.querySelector('.like-icon');
    let count = parseInt(countEl.textContent) || 0;

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
            await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id);
            await supabase.from('posts').update({ likes_count: Math.max(0, count - 1) }).eq('id', postId);
        } else {
            await supabase.from('likes').insert({ post_id: postId, user_id: user.id });
            await supabase.from('posts').update({ likes_count: count + 1 }).eq('id', postId);
        }
    } catch (err) {
        console.error('Like error:', err);
    }
}

/* ───────────────────────────────────────────
   댓글 로드
─────────────────────────────────────────── */
async function loadComments(postId) {
    const listEl = document.getElementById(`comment-list-${postId}`);
    if (!listEl) return;

    try {
        const { data: comments, error } = await supabase
            .from('comments')
            .select('*')
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!comments || comments.length === 0) {
            listEl.innerHTML = '<p class="no-comments">아직 댓글이 없어요. 첫 댓글을 남겨보세요!</p>';
            return;
        }

        listEl.innerHTML = comments.map(c => `
            <div class="comment-item">
                <img class="comment-avatar-sm" src="https://api.dicebear.com/7.x/identicon/svg?seed=${c.user_id}" alt="">
                <div class="comment-bubble">
                    <span class="comment-user">@${c.user_id?.slice(0, 8)}</span>
                    <p class="comment-text">${c.content}</p>
                    <span class="comment-time">${formatTime(new Date(c.created_at))}</span>
                </div>
            </div>
        `).join('');

    } catch (err) {
        listEl.innerHTML = `<p class="no-comments" style="color:var(--error)">댓글을 불러오지 못했어요.</p>`;
    }
}

/* ───────────────────────────────────────────
   댓글 전송
─────────────────────────────────────────── */
async function submitComment(postId, inputEl) {
    const text = inputEl.value.trim();
    if (!text) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    inputEl.value = '';
    inputEl.disabled = true;

    try {
        const { error } = await supabase.from('comments').insert({
            post_id: postId,
            user_id: user.id,
            content: text,
            created_at: new Date()
        });
        if (error) throw error;
        loadComments(postId);
    } catch (err) {
        showToast('댓글 전송 실패: ' + err.message);
        inputEl.value = text;
    } finally {
        inputEl.disabled = false;
        inputEl.focus();
    }
}

/* ───────────────────────────────────────────
   인기 검색어
─────────────────────────────────────────── */
async function fetchTrendingQueries() {
    const trendingList = document.getElementById('trending-queries');
    if (!trendingList) return;

    try {
        const { data, error } = await supabase.from('search_logs').select('query');
        if (error) throw error;

        const counts = (data || []).reduce((acc, curr) => {
            acc[curr.query] = (acc[curr.query] || 0) + 1;
            return acc;
        }, {});

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        if (sorted.length === 0) {
            trendingList.innerHTML = '<li style="color:var(--text-3); font-size:0.9rem;">검색 데이터가 없습니다.</li>';
            return;
        }

        trendingList.innerHTML = sorted.map(([query, count], i) => `
            <li>
                <a href="/search.html?q=${encodeURIComponent(query)}">${i + 1}. ${query}</a>
                <span class="count">${count > 10 ? '🔥' : count}</span>
            </li>
        `).join('');

    } catch (err) {
        trendingList.innerHTML = '<li style="color:var(--text-3)">불러오기 실패</li>';
    }
}

/* ───────────────────────────────────────────
   유틸
─────────────────────────────────────────── */
function formatTime(date) {
    const diff = (Date.now() - date) / 1000;
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'ug-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
