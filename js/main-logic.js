/* js/main-logic.js — 풀 기능 버전 */

let _currentUser = null;
let _currentProfile = null;
let _followingIds = new Set();
let _currentTab = '최신';

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

    const user = await getCurrentUser();
    if (user) {
        await loadFollowingIds(user.id);
        checkNotiBadge(user.id);
        checkMsgBadge(user.id);
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        _currentProfile = p;
    }

    fetchPosts('최신');
    fetchTrendingQueries();

    const tabs = document.querySelectorAll('.pam-tabs .pam-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            _currentTab = tab.dataset.tab;
            document.getElementById('main-feed').innerHTML = `
                <div class="feed-loader">
                    <span class="material-symbols-rounded animation-spin">sync</span>
                    가든 연결 중입니다...
                </div>`;
            fetchPosts(_currentTab);
        });
    });

    setupRealtime();
    setupReportModal();
    setupMiniProfile();
});

async function loadFollowingIds(userId) {
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', userId);
    _followingIds = new Set((data || []).map(f => f.following_id));
}

async function fetchPosts(tab = '최신') {
    const feedContainer = document.getElementById('main-feed');

    try {
        const user = await getCurrentUser();
        let query = supabase.from('posts').select('*, profiles(id, username, avatar_url)').order('created_at', { ascending: false });

        if (tab === '팔로잉') {
            if (!user || _followingIds.size === 0) {
                feedContainer.innerHTML = `
                    <div class="feed-empty">
                        <span class="material-symbols-rounded" style="font-size:48px;color:var(--text-3);display:block;margin-bottom:16px;">group</span>
                        <p>팔로잉하는 사람이 없어요.<br>누군가를 팔로우해보세요!</p>
                    </div>`;
                return;
            }
            query = query.in('user_id', [..._followingIds]);
        }

        const { data: posts, error } = await query;
        if (error) throw error;
        feedContainer.innerHTML = '';

        if (!posts || posts.length === 0) {
            feedContainer.innerHTML = `
                <div class="feed-empty">
                    <span class="material-symbols-rounded" style="font-size:48px;color:var(--text-3);display:block;margin-bottom:16px;">eco</span>
                    <p>가든에 아직 아무도 없네요.<br>첫 번째 씨앗을 심어보세요.</p>
                </div>`;
            return;
        }

        let likedSet = new Set();
        if (user) {
            const { data: likes } = await supabase.from('likes').select('post_id').eq('user_id', user.id);
            if (likes) likes.forEach(l => likedSet.add(l.post_id));
        }

        const postIds = posts.map(p => p.id);
        const { data: likesCounts } = await supabase.from('likes').select('post_id').in('post_id', postIds);
        const likesCountMap = {};
        (likesCounts || []).forEach(l => { likesCountMap[l.post_id] = (likesCountMap[l.post_id] || 0) + 1; });

        for (const post of posts) {
            const { data: comments } = await supabase.from('comments').select('*').eq('post_id', post.id).order('created_at', { ascending: false });
            const rawComments = comments || [];
            const commentUserIds = [...new Set(rawComments.map(c => c.user_id).filter(Boolean))];
            let profileMap = {};
            if (commentUserIds.length > 0) {
                const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', commentUserIds);
                (profiles || []).forEach(p => { profileMap[p.id] = p; });
            }
            const recentComments = rawComments.map(c => ({ ...c, profiles: profileMap[c.user_id] || null }));
            post.likes_count = likesCountMap[post.id] || 0;
            feedContainer.appendChild(createPostCard(post, likedSet.has(post.id), user, recentComments));
        }

    } catch (err) {
        console.error('Fetch Error:', err);
        feedContainer.innerHTML = `
            <div class="feed-error">
                <span class="material-symbols-rounded">error</span>
                데이터를 불러오지 못했습니다.<br><small>${err.message}</small>
            </div>`;
    }
}

function setupRealtime() {
    // 기존 채널 정리 후 재등록 (새로고침 시 중복 방지)
    ['realtime-posts', 'realtime-posts-delete', 'realtime-comments', 'realtime-likes'].forEach(name => {
        const ch = supabase.getChannels().find(c => c.topic === `realtime:${name}` || c.subTopic === name);
        if (ch) supabase.removeChannel(ch);
    });

    supabase.channel('realtime-posts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, async (payload) => {
            if (_currentTab !== '최신') return;
            const newPost = payload.new;
            const { data: profile } = await supabase.from('profiles').select('id, username, avatar_url').eq('id', newPost.user_id).single();
            newPost.profiles = profile || null;
            newPost.likes_count = 0;
            const user = await getCurrentUser();
            const feedContainer = document.getElementById('main-feed');
            if (!feedContainer) return;
            feedContainer.querySelector('.feed-empty')?.remove();
            const card = createPostCard(newPost, false, user, []);
            card.style.animation = 'slideInTop 0.4s ease';
            feedContainer.prepend(card);
        })
        .subscribe((status, err) => {
            if (err) console.warn('realtime-posts 구독 오류:', err);
        });

    supabase.channel('realtime-posts-delete')
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, (payload) => {
            const deletedId = payload.old?.id;
            if (!deletedId) return;
            const card = document.querySelector(`.post-card[data-post-id="${deletedId}"]`);
            if (card) { card.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => card.remove(), 300); }
        })
        .subscribe((status, err) => {
            if (err) console.warn('realtime-posts-delete 구독 오류:', err);
        });

    supabase.channel('realtime-comments')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, async (payload) => {
            const c = payload.new;
            const listEl = document.getElementById(`comment-list-${c.post_id}`);
            if (!listEl) return;
            const user = await getCurrentUser();
            if (user && c.user_id === user.id) return;
            const { data: profile } = await supabase.from('profiles').select('id, username, avatar_url').eq('id', c.user_id).single();
            listEl.querySelectorAll('[id^="temp-comment-"]').forEach(t => t.remove());
            listEl.prepend(createCommentEl({ ...c, profiles: profile || null }));
            const countLabel = document.querySelector(`.comment-toggle-btn[data-post-id="${c.post_id}"] .comment-count-label`);
            if (countLabel) countLabel.textContent = (parseInt(countLabel.textContent) || 0) + 1;
        })
        .subscribe((status, err) => {
            if (err) console.warn('realtime-comments 구독 오류:', err);
        });

    supabase.channel('realtime-likes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, async (payload) => {
            const postId = payload.new?.post_id || payload.old?.post_id;
            if (!postId) return;
            const { count } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId);
            const countEl = document.querySelector(`.like-btn[data-post-id="${postId}"] .like-count`);
            if (countEl && count !== null) countEl.textContent = count;
        })
        .subscribe((status, err) => {
            if (err) console.warn('realtime-likes 구독 오류:', err);
        });
}

async function checkNotiBadge(userId) {
    const badge = document.getElementById('nav-noti-badge');
    if (!badge) return;
    const updateBadge = async () => {
        const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false);
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    };
    await updateBadge();
    supabase.channel('realtime-noti')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, updateBadge)
        .subscribe();
}

function createPostCard(post, isLiked = false, currentUser = null, recentComments = []) {
    const article = document.createElement('article');
    article.className = 'post-card';
    article.dataset.postId = post.id;

    const avatar    = post.profiles?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${post.user_id}`;
    const username  = post.profiles?.username || post.user_id?.slice(0, 8) || 'anonymous';
    const profileId = post.profiles?.id || post.user_id;
    const timeAgo   = formatTime(new Date(post.created_at));
    const tagsHtml  = (post.tags || []).map(t => `<span class="post-tag">#${t}</span>`).join('');
    const likeCount = post.likes_count || 0;
    const userSeed  = currentUser ? currentUser.id : 'guest';
    const isOwner   = currentUser && currentUser.id === post.user_id;
    const renderedFull = window.marked ? marked.parse(post.content || '') : (post.content || '');
    const commentsHtml = buildCommentsHtml(recentComments);

    article.innerHTML = `
        <div class="post-card-inner">
            <div class="post-card-header">
                <img class="post-avatar" src="${avatar}" alt="${username}" data-user-id="${profileId}" style="cursor:pointer;">
                <div class="post-meta">
                    <span class="post-username" data-user-id="${profileId}" style="cursor:pointer;">@${username}</span>
                    <span class="post-time">${timeAgo}</span>
                </div>
                <div class="post-more-wrap" style="margin-left:auto;position:relative;">
                    <button class="action-btn post-more-btn"><span class="material-symbols-rounded">more_horiz</span></button>
                    <div class="post-more-menu" style="display:none;">
                        ${isOwner ? `
                        <button class="more-menu-item edit-post-btn"><span class="material-symbols-rounded">edit</span>수정</button>
                        <button class="more-menu-item delete-post-btn" style="color:var(--error);"><span class="material-symbols-rounded">delete</span>삭제</button>
                        ` : ''}
                        <button class="more-menu-item report-post-btn"><span class="material-symbols-rounded">flag</span>신고</button>
                    </div>
                </div>
            </div>

            ${post.title ? `<h2 class="post-title">${escapeHtml(post.title)}</h2>` : ''}
            ${(() => {
                const imgs = (post.image_urls && post.image_urls.length > 0) ? post.image_urls : (post.image_url ? [post.image_url] : []);
                if (imgs.length === 0) return '';
                if (imgs.length === 1) return `<div class="post-image-wrap"><img src="${imgs[0]}" alt="첨부 이미지" class="post-image" loading="lazy"></div>`;
                const dots = imgs.map((_, i) => `<span class="carousel-dot${i===0?' active':''}" data-index="${i}"></span>`).join('');
                const slides = imgs.map((url, i) => `<div class="carousel-slide${i===0?' active':''}"><img src="${url}" alt="이미지 ${i+1}" loading="lazy"></div>`).join('');
                return `<div class="post-carousel" data-post-id="${post.id}" data-current="0" data-total="${imgs.length}">
                    <div class="carousel-slides">${slides}</div>
                    <button class="carousel-btn carousel-prev"><span class="material-symbols-rounded">chevron_left</span></button>
                    <button class="carousel-btn carousel-next"><span class="material-symbols-rounded">chevron_right</span></button>
                    <div class="carousel-dots">${dots}</div>
                    <div class="carousel-counter">1 / ${imgs.length}</div>
                </div>`;
            })()}

            <div class="post-body markdown-rendered post-body-collapsed" id="body-${post.id}">${renderedFull}</div>
            <button class="expand-btn" id="expand-${post.id}" data-expanded="false">
                더 보기 <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;">expand_more</span>
            </button>

            ${tagsHtml ? `<div class="post-tags">${tagsHtml}</div>` : ''}

            <div class="post-actions">
                <button class="action-btn like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}" data-liked="${isLiked}">
                    <span class="material-symbols-rounded like-icon" style="font-variation-settings:'FILL' ${isLiked ? 1 : 0}">favorite</span>
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

            <div class="comment-section collapsed" id="comments-${post.id}">
                <div class="comment-list" id="comment-list-${post.id}">${commentsHtml}</div>
                <div class="comment-input-row">
                    <img class="comment-avatar-sm" src="https://api.dicebear.com/7.x/identicon/svg?seed=${userSeed}" alt="">
                    <input type="text" class="comment-input" placeholder="댓글 달기..." data-post-id="${post.id}">
                    <button class="comment-send-btn"><span class="material-symbols-rounded">send</span></button>
                </div>
            </div>
        </div>
    `;

    const bodyEl = article.querySelector(`#body-${post.id}`);
    const expandBtn = article.querySelector(`#expand-${post.id}`);
    requestAnimationFrame(() => { if (bodyEl.scrollHeight <= bodyEl.clientHeight + 2) expandBtn.style.display = 'none'; });
    expandBtn.addEventListener('click', () => {
        const expanded = expandBtn.dataset.expanded === 'true';
        bodyEl.classList.toggle('post-body-collapsed', expanded);
        expandBtn.innerHTML = expanded
            ? `더 보기 <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;">expand_more</span>`
            : `접기 <span class="material-symbols-rounded" style="font-size:16px;vertical-align:-3px;">expand_less</span>`;
        expandBtn.dataset.expanded = expanded ? 'false' : 'true';
    });

    article.querySelector('.like-btn').addEventListener('click', function () { handleLike(post.id, this); });

    const commentSection = article.querySelector(`#comments-${post.id}`);
    article.querySelector('.comment-toggle-btn').addEventListener('click', () => {
        const isOpen = !commentSection.classList.contains('collapsed');
        commentSection.classList.toggle('collapsed', isOpen);
        if (!isOpen) loadComments(post.id);
    });

    const commentInput = article.querySelector('.comment-input');
    const sendComment = () => submitComment(post.id, commentInput, currentUser);
    article.querySelector('.comment-send-btn').addEventListener('click', sendComment);
    commentInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } });

    article.querySelector('.share-btn').addEventListener('click', () => {
        const url = `${window.location.origin}${window.location.pathname}?post=${post.id}`;
        navigator.clipboard?.writeText(url).then(() => showToast('링크가 복사됐어요!'));
    });

    const moreBtn = article.querySelector('.post-more-btn');
    const moreMenu = article.querySelector('.post-more-menu');
    moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.post-more-menu').forEach(m => { if (m !== moreMenu) m.style.display = 'none'; });
        moreMenu.style.display = moreMenu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { moreMenu.style.display = 'none'; }, { once: false });

    article.querySelector('.edit-post-btn')?.addEventListener('click', () => {
        moreMenu.style.display = 'none';
        window.location.href = `./write/index.html?edit=${post.id}`;
    });
    article.querySelector('.delete-post-btn')?.addEventListener('click', async () => {
        moreMenu.style.display = 'none';
        const ok = await ugConfirm('이 게시물을 삭제할까요?', { title: '게시물 삭제', icon: 'delete', confirmText: '삭제', danger: true });
        if (!ok) return;
        const { error } = await supabase.from('posts').delete().eq('id', post.id);
        if (error) { showToast('삭제 실패: ' + error.message); return; }
        article.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => article.remove(), 300);
        showToast('게시물이 삭제됐어요.');
    });
    article.querySelector('.report-post-btn').addEventListener('click', () => {
        moreMenu.style.display = 'none';
        openReportModal(post.id);
    });

    article.querySelector('.post-username').addEventListener('click', () => {
        window.location.href = `./profile/index.html?id=${profileId}`;
    });
    article.querySelector('.post-avatar').addEventListener('click', (e) => {
        e.stopPropagation();
        openMiniProfile(profileId);
    });

    // 댓글 3점 메뉴 이벤트 위임 (buildCommentsHtml로 렌더된 정적 댓글용)
    const commentList = article.querySelector(`#comment-list-${post.id}`);
    commentList.addEventListener('click', async (e) => {
        const moreBtn = e.target.closest('.comment-more-btn');
        if (moreBtn) {
            e.stopPropagation();
            const wrap = moreBtn.closest('.comment-more-wrap');
            const menu = wrap.querySelector('.comment-more-menu');
            document.querySelectorAll('.comment-more-menu').forEach(m => { if (m !== menu) m.style.display = 'none'; });
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
            return;
        }
        const editBtn = e.target.closest('.comment-edit-btn');
        if (editBtn) {
            const item = editBtn.closest('.comment-item');
            const menu = item.querySelector('.comment-more-menu');
            menu.style.display = 'none';
            const commentId = item.dataset.commentId;
            const textEl = item.querySelector('.comment-text');
            const original = textEl.textContent;
            const input = document.createElement('input');
            input.type = 'text'; input.value = original; input.className = 'comment-input comment-edit-input';
            textEl.replaceWith(input); input.focus();
            const save = async () => {
                const newText = input.value.trim();
                if (!newText || newText === original) { input.replaceWith(textEl); return; }
                const { error } = await supabase.from('comments').update({ content: newText }).eq('id', commentId);
                if (error) { showToast('수정 실패: ' + error.message); input.replaceWith(textEl); return; }
                textEl.textContent = newText; input.replaceWith(textEl);
                showToast('댓글이 수정됐어요.');
            };
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') input.replaceWith(textEl); });
            input.addEventListener('blur', save);
            return;
        }
        const deleteBtn = e.target.closest('.comment-delete-btn');
        if (deleteBtn) {
            const item = deleteBtn.closest('.comment-item');
            item.querySelector('.comment-more-menu').style.display = 'none';
            const ok = await ugConfirm('이 댓글을 삭제할까요?', { title: '댓글 삭제', icon: 'delete', confirmText: '삭제', danger: true });
            if (!ok) return;
            const { error } = await supabase.from('comments').delete().eq('id', item.dataset.commentId);
            if (error) { showToast('삭제 실패: ' + error.message); return; }
            item.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => item.remove(), 300);
            showToast('댓글이 삭제됐어요.');
            return;
        }
        const reportBtn = e.target.closest('.comment-report-btn');
        if (reportBtn) {
            const item = reportBtn.closest('.comment-item');
            item.querySelector('.comment-more-menu').style.display = 'none';
            openReportModal(item.dataset.postId || post.id, 'comment', item.dataset.commentId);
        }
    });

    return article;
}

function createCommentEl(c) {
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.dataset.commentId = c.id;
    div.dataset.userId = c.user_id;
    const displayName = c.profiles?.username || c.user_id?.slice(0, 8) || 'anonymous';
    const avatarSrc   = c.profiles?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${c.user_id}`;
    const isOwner = _currentUser && _currentUser.id === c.user_id;
    div.innerHTML = `
        <img class="comment-avatar-sm" src="${avatarSrc}" alt="">
        <div class="comment-bubble">
            <span class="comment-user">@${displayName}</span>
            <p class="comment-text">${escapeHtml(c.content || '')}</p>
            <span class="comment-time">${formatTime(new Date(c.created_at))}</span>
        </div>
        <div class="comment-more-wrap">
            <button class="comment-more-btn"><span class="material-symbols-rounded">more_horiz</span></button>
            <div class="comment-more-menu" style="display:none;">
                ${isOwner ? `
                <button class="comment-menu-item comment-edit-btn"><span class="material-symbols-rounded">edit</span>수정</button>
                <button class="comment-menu-item comment-delete-btn" style="color:var(--error);"><span class="material-symbols-rounded">delete</span>삭제</button>
                ` : ''}
                <button class="comment-menu-item comment-report-btn"><span class="material-symbols-rounded">flag</span>신고</button>
            </div>
        </div>`;

    // 점 3개 메뉴 토글
    const moreBtn = div.querySelector('.comment-more-btn');
    const moreMenu = div.querySelector('.comment-more-menu');
    moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.comment-more-menu').forEach(m => { if (m !== moreMenu) m.style.display = 'none'; });
        moreMenu.style.display = moreMenu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { moreMenu.style.display = 'none'; });

    // 수정
    div.querySelector('.comment-edit-btn')?.addEventListener('click', async () => {
        moreMenu.style.display = 'none';
        const textEl = div.querySelector('.comment-text');
        const original = c.content || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = original;
        input.className = 'comment-input comment-edit-input';
        textEl.replaceWith(input);
        input.focus();
        const save = async () => {
            const newText = input.value.trim();
            if (!newText || newText === original) { input.replaceWith(textEl); return; }
            const { error } = await supabase.from('comments').update({ content: newText }).eq('id', c.id);
            if (error) { showToast('수정 실패: ' + error.message); input.replaceWith(textEl); return; }
            c.content = newText;
            textEl.textContent = newText;
            input.replaceWith(textEl);
            showToast('댓글이 수정됐어요.');
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { input.replaceWith(textEl); } });
        input.addEventListener('blur', save);
    });

    // 삭제
    div.querySelector('.comment-delete-btn')?.addEventListener('click', async () => {
        moreMenu.style.display = 'none';
        const ok = await ugConfirm('이 댓글을 삭제할까요?', { title: '댓글 삭제', icon: 'delete', confirmText: '삭제', danger: true });
        if (!ok) return;
        const { error } = await supabase.from('comments').delete().eq('id', c.id);
        if (error) { showToast('삭제 실패: ' + error.message); return; }
        div.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => div.remove(), 300);
        showToast('댓글이 삭제됐어요.');
    });

    // 신고
    div.querySelector('.comment-report-btn')?.addEventListener('click', () => {
        moreMenu.style.display = 'none';
        openReportModal(c.post_id, 'comment', c.id);
    });

    return div;
}

function buildCommentsHtml(comments) {
    if (!comments || comments.length === 0) return '<p class="no-comments">아직 댓글이 없어요.</p>';
    return comments.map(c => {
        const displayName = c.profiles?.username || c.user_id?.slice(0, 8) || 'anonymous';
        const avatarSrc   = c.profiles?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${c.user_id}`;
        const isOwner = _currentUser && _currentUser.id === c.user_id;
        return `
            <div class="comment-item" data-comment-id="${c.id}" data-user-id="${c.user_id}" data-post-id="${c.post_id || ''}">
                <img class="comment-avatar-sm" src="${avatarSrc}" alt="">
                <div class="comment-bubble">
                    <span class="comment-user">@${displayName}</span>
                    <p class="comment-text">${escapeHtml(c.content || '')}</p>
                    <span class="comment-time">${formatTime(new Date(c.created_at))}</span>
                </div>
                <div class="comment-more-wrap">
                    <button class="comment-more-btn"><span class="material-symbols-rounded">more_horiz</span></button>
                    <div class="comment-more-menu" style="display:none;">
                        ${isOwner ? `
                        <button class="comment-menu-item comment-edit-btn"><span class="material-symbols-rounded">edit</span>수정</button>
                        <button class="comment-menu-item comment-delete-btn" style="color:var(--error);"><span class="material-symbols-rounded">delete</span>삭제</button>
                        ` : ''}
                        <button class="comment-menu-item comment-report-btn"><span class="material-symbols-rounded">flag</span>신고</button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

function setupMiniProfile() {
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('mini-profile-panel');
        if (panel && !panel.contains(e.target) && !e.target.closest('.post-avatar')) closeMiniProfile();
    });
}

async function openMiniProfile(userId) {
    let panel = document.getElementById('mini-profile-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'mini-profile-panel';
        document.body.appendChild(panel);
    }
    panel.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-3);"><span class="material-symbols-rounded animation-spin">sync</span></div>`;
    panel.classList.add('open');

    const [{ data: profile }, currentUser] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        getCurrentUser()
    ]);
    const isMe = currentUser && currentUser.id === userId;
    const isFollowing = _followingIds.has(userId);
    const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${userId}`;
    const username = profile?.username || userId.slice(0, 8);

    panel.innerHTML = `
        <div class="mini-profile-inner">
            <button class="mini-close-btn"><span class="material-symbols-rounded">close</span></button>
            <img src="${avatar}" class="mini-avatar">
            <div class="mini-username">@${username}</div>
            ${profile?.description ? `<p class="mini-desc">${escapeHtml(profile.description)}</p>` : ''}
            <div class="mini-stats">
                <div><strong>${profile?.post_count || 0}</strong><span>게시물</span></div>
                <div><strong>${profile?.follower_count || 0}</strong><span>팔로워</span></div>
                <div><strong>${profile?.following_count || 0}</strong><span>팔로잉</span></div>
            </div>
            ${!isMe ? `<button class="mini-follow-btn ${isFollowing ? 'following' : ''}" data-user-id="${userId}">${isFollowing ? '팔로잉' : '팔로우'}</button>` : ''}
            <a href="./profile/index.html?id=${userId}" class="mini-profile-link">프로필 보기</a>
        </div>
    `;

    panel.querySelector('.mini-close-btn').addEventListener('click', closeMiniProfile);
    panel.querySelector('.mini-follow-btn')?.addEventListener('click', async (e) => {
        if (!currentUser) { showToast('로그인이 필요합니다.'); return; }
        const btn = e.currentTarget;
        btn.disabled = true;
        await toggleFollow(userId, btn);
        btn.disabled = false;
        const { data: updatedProfile } = await supabase.from('profiles').select('follower_count, following_count').eq('id', userId).single();
        const statsEls = panel.querySelectorAll('.mini-stats div strong');
        if (statsEls[1] && updatedProfile) statsEls[1].textContent = updatedProfile.follower_count || 0;
    });
}

function closeMiniProfile() {
    document.getElementById('mini-profile-panel')?.classList.remove('open');
}

async function toggleFollow(targetUserId, btn) {
    const user = await getCurrentUser();
    if (!user) return;
    const isFollowing = _followingIds.has(targetUserId);

    if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetUserId);
        _followingIds.delete(targetUserId);
        if (btn) { btn.textContent = '팔로우'; btn.classList.remove('following'); }
        const { data: tProfile } = await supabase.from('profiles').select('follower_count').eq('id', targetUserId).single();
        await supabase.from('profiles').update({ follower_count: Math.max(0, (tProfile?.follower_count || 1) - 1) }).eq('id', targetUserId);
        const { data: myProfile2 } = await supabase.from('profiles').select('following_count').eq('id', user.id).single();
        await supabase.from('profiles').update({ following_count: Math.max(0, (myProfile2?.following_count || 1) - 1) }).eq('id', user.id);
    } else {
        await supabase.from('follows').insert({ follower_id: user.id, following_id: targetUserId });
        _followingIds.add(targetUserId);
        if (btn) { btn.textContent = '팔로잉'; btn.classList.add('following'); }
        const { data: tProfile } = await supabase.from('profiles').select('follower_count').eq('id', targetUserId).single();
        await supabase.from('profiles').update({ follower_count: (tProfile?.follower_count || 0) + 1 }).eq('id', targetUserId);
        const { data: myProfileCnt } = await supabase.from('profiles').select('following_count').eq('id', user.id).single();
        await supabase.from('profiles').update({ following_count: (myProfileCnt?.following_count || 0) + 1 }).eq('id', user.id);
        const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
        await supabase.from('notifications').insert({
            user_id: targetUserId, type: 'follow', actor_id: user.id,
            message: `@${myProfile?.username || '누군가'}님이 팔로우했어요.`
        });
    }
}

const REPORT_REASONS = ['욕설 / 혐오 표현', '성적으로 부적절한 내용', '비하 / 차별', '스팸 / 광고', '개인정보 침해', '허위 정보', '기타'];

function setupReportModal() {
    const overlay = document.createElement('div');
    overlay.id = 'report-overlay';
    overlay.innerHTML = `
        <div id="report-modal">
            <div class="report-handle"></div>
            <h3 class="report-title">신고하기</h3>
            <p class="report-sub">신고 이유를 선택해주세요 (복수 선택 가능)</p>
            <div class="report-reasons">
                ${REPORT_REASONS.map(r => `
                    <label class="report-reason-item">
                        <input type="checkbox" value="${r}">
                        <span>${r}</span>
                    </label>`).join('')}
            </div>
            <div id="report-etc-wrap" style="display:none;margin-bottom:12px;">
                <textarea id="report-etc-input" placeholder="기타 신고 내용을 입력해주세요..." style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-2);color:var(--text-0);font-family:inherit;font-size:0.88rem;resize:none;height:80px;outline:none;"></textarea>
            </div>
            <button id="report-submit-btn">신고 제출</button>
            <button id="report-cancel-btn">취소</button>
        </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeReportModal(); });
    document.getElementById('report-cancel-btn').addEventListener('click', closeReportModal);
    document.getElementById('report-submit-btn').addEventListener('click', submitReport);
    overlay.addEventListener('change', (e) => {
        if (e.target.value === '기타') {
            document.getElementById('report-etc-wrap').style.display = e.target.checked ? 'block' : 'none';
        }
    });
}

let _reportingPostId = null;
let _reportingCommentId = null;
let _reportingType = 'post';
function openReportModal(postId, type = 'post', commentId = null) {
    _reportingPostId = postId;
    _reportingType = type;
    _reportingCommentId = commentId;
    document.querySelectorAll('#report-modal input[type=checkbox]').forEach(cb => cb.checked = false);
    document.getElementById('report-overlay').classList.add('open');
    document.getElementById('report-modal').classList.add('slide-up');
}
function closeReportModal() {
    document.getElementById('report-overlay').classList.remove('open');
    document.getElementById('report-modal').classList.remove('slide-up');
    _reportingPostId = null;
    _reportingCommentId = null;
    _reportingType = 'post';
}
async function submitReport() {
    const user = await getCurrentUser();
    if (!user) { showToast('로그인이 필요합니다.'); return; }
    const checked = [...document.querySelectorAll('#report-modal input[type=checkbox]:checked')].map(cb => {
        if (cb.value === '기타') {
            const etcText = document.getElementById('report-etc-input')?.value.trim();
            return etcText ? `기타: ${etcText}` : '기타';
        }
        return cb.value;
    });
    if (checked.length === 0) { showToast('신고 이유를 하나 이상 선택해주세요.'); return; }
    const btn = document.getElementById('report-submit-btn');
    btn.disabled = true; btn.textContent = '제출 중...';
    const insertData = { reporter_id: user.id, reasons: checked };
    if (_reportingType === 'comment' && _reportingCommentId) {
        insertData.comment_id = _reportingCommentId;
    } else {
        insertData.post_id = _reportingPostId;
    }
    const { error } = await supabase.from('reports').insert(insertData);
    btn.disabled = false; btn.textContent = '신고 제출';
    if (error) { showToast('신고 실패: ' + error.message); return; }
    closeReportModal();
    showToast('신고가 접수됐어요. 검토 후 조치할게요.');
}

async function handleLike(postId, btn) {
    const user = await getCurrentUser();
    if (!user) { showToast('로그인이 필요합니다.'); return; }
    const isLiked = btn.dataset.liked === 'true';
    const countEl = btn.querySelector('.like-count');
    const iconEl  = btn.querySelector('.like-icon');
    let count = parseInt(countEl.textContent) || 0;

    if (isLiked) {
        btn.dataset.liked = 'false'; btn.classList.remove('liked'); countEl.textContent = Math.max(0, count - 1);
        iconEl.style.fontVariationSettings = "'FILL' 0";
    } else {
        btn.dataset.liked = 'true'; btn.classList.add('liked'); countEl.textContent = count + 1;
        iconEl.style.fontVariationSettings = "'FILL' 1";
        btn.classList.add('like-pop'); setTimeout(() => btn.classList.remove('like-pop'), 400);
    }

    try {
        if (isLiked) {
            const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: user.id });
            if (error && error.code !== '23505' && error.status !== 409) throw error;
            const { data: post } = await supabase.from('posts').select('user_id').eq('id', postId).single();
            if (post && post.user_id !== user.id) {
                const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
                await supabase.from('notifications').insert({
                    user_id: post.user_id, type: 'like', actor_id: user.id, post_id: postId,
                    message: `@${myProfile?.username || '누군가'}님이 회원님의 게시물을 좋아해요.`
                });
            }
        }
        const { count: realCount } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId);
        if (realCount !== null) countEl.textContent = realCount;
    } catch (err) {
        if (isLiked) { btn.dataset.liked = 'true'; btn.classList.add('liked'); iconEl.style.fontVariationSettings = "'FILL' 1"; }
        else { btn.dataset.liked = 'false'; btn.classList.remove('liked'); iconEl.style.fontVariationSettings = "'FILL' 0"; }
        countEl.textContent = count;
        showToast('오류가 발생했습니다.');
    }
}

async function loadComments(postId) {
    const listEl = document.getElementById(`comment-list-${postId}`);
    if (!listEl) return;
    try {
        const { data: comments, error } = await supabase.from('comments').select('*').eq('post_id', postId).order('created_at', { ascending: false });
        if (error) throw error;
        const rawComments = comments || [];
        const ids = [...new Set(rawComments.map(c => c.user_id).filter(Boolean))];
        let profileMap = {};
        if (ids.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
            (profiles || []).forEach(p => { profileMap[p.id] = p; });
        }
        listEl.innerHTML = buildCommentsHtml(rawComments.map(c => ({ ...c, profiles: profileMap[c.user_id] || null })));
    } catch {
        listEl.innerHTML = `<p class="no-comments" style="color:var(--error)">댓글을 불러오지 못했어요.</p>`;
    }
}

async function submitComment(postId, inputEl, currentUser) {
    const text = inputEl.value.trim();
    if (!text) return;
    const user = currentUser || await getCurrentUser();
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    inputEl.value = '';
    inputEl.disabled = true;

    const listEl = document.getElementById(`comment-list-${postId}`);
    const tempId = `temp-comment-${Date.now()}`;

    if (listEl) {
        // "아직 댓글이 없어요" 메시지 제거
        listEl.querySelector('.no-comments')?.remove();

        // 임시 댓글 DOM에 추가 (화면 점프 없이)
        const tempEl = document.createElement('div');
        tempEl.className = 'comment-item';
        tempEl.id = tempId;
        const displayName = _currentProfile?.username || user.email?.split('@')[0] || user.id.slice(0, 8);
        const avatarSrc = _currentProfile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
        tempEl.innerHTML = `
            <img class="comment-avatar-sm" src="${avatarSrc}" alt="">
            <div class="comment-bubble">
                <span class="comment-user">@${displayName}</span>
                <p class="comment-text">${escapeHtml(text)}</p>
                <span class="comment-time">방금 전</span>
            </div>`;

        // DB 정렬(최신순 위)과 동일하게 prepend
        listEl.prepend(tempEl);

        // 댓글 리스트 스크롤을 맨 위로 부드럽게 이동
        requestAnimationFrame(() => {
            listEl.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // 댓글 수 카운트 업데이트
    const countLabel = document.querySelector(`.comment-toggle-btn[data-post-id="${postId}"] .comment-count-label`);
    if (countLabel) countLabel.textContent = (parseInt(countLabel.textContent) || 0) + 1;

    try {
        const { data: inserted, error } = await supabase
            .from('comments')
            .insert({ post_id: postId, user_id: user.id, content: text, created_at: new Date() })
            .select()
            .single();
        if (error) throw error;

        // 임시 댓글을 실제 댓글로 교체 (DOM 재렌더링 없이 id만 바꿔서 깜빡임/점프 방지)
        const tempEl = document.getElementById(tempId);
        if (tempEl) tempEl.removeAttribute('id');

        // 알림 발송
        const { data: post } = await supabase.from('posts').select('user_id').eq('id', postId).single();
        if (post && post.user_id !== user.id) {
            const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
            await supabase.from('notifications').insert({
                user_id: post.user_id, type: 'comment', actor_id: user.id, post_id: postId,
                message: `@${myProfile?.username || '누군가'}님이 댓글을 달았어요: "${text.slice(0, 30)}${text.length > 30 ? '...' : ''}"`
            });
        }
    } catch (err) {
        showToast('댓글 전송 실패: ' + err.message);
        // 실패 시 임시 댓글 제거 및 입력값 복원
        document.getElementById(tempId)?.remove();
        inputEl.value = text;
        if (countLabel) countLabel.textContent = Math.max(0, (parseInt(countLabel.textContent) || 1) - 1);
    } finally {
        inputEl.disabled = false;
        inputEl.focus();
    }
}

async function fetchTrendingQueries() {
    const trendingList = document.getElementById('trending-queries');
    if (!trendingList) return;
    try {
        const { data, error } = await supabase.from('search_logs').select('query');
        if (error) throw error;
        const counts = (data || []).reduce((acc, c) => { acc[c.query] = (acc[c.query] || 0) + 1; return acc; }, {});
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        trendingList.innerHTML = sorted.length === 0
            ? '<li style="color:var(--text-3);font-size:0.9rem;">검색 데이터가 없습니다.</li>'
            : sorted.map(([q, cnt], i) => `
                <li>
                    <a href="/search.html?q=${encodeURIComponent(q)}">${i + 1}. ${q}</a>
                    <span class="count">${cnt > 10 ? '🔥' : cnt}</span>
                </li>`).join('');
    } catch {
        trendingList.innerHTML = '<li style="color:var(--text-3)">불러오기 실패</li>';
    }
}

function formatTime(date) {
    const diff = (Date.now() - date) / 1000;
    if (diff < 60)     return '방금 전';
    if (diff < 3600)   return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'ug-toast'; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}

document.addEventListener('click', (e) => {
    const prevBtn = e.target.closest('.carousel-prev');
    const nextBtn = e.target.closest('.carousel-next');
    const dot = e.target.closest('.carousel-dot');

    if (prevBtn || nextBtn || dot) {
        const carousel = (prevBtn || nextBtn || dot).closest('.post-carousel');
        if (!carousel) return;
        const total = parseInt(carousel.dataset.total);
        let current = parseInt(carousel.dataset.current);

        if (prevBtn) current = (current - 1 + total) % total;
        else if (nextBtn) current = (current + 1) % total;
        else if (dot) current = parseInt(dot.dataset.index);

        carousel.dataset.current = current;
        carousel.querySelectorAll('.carousel-slide').forEach((s, i) => s.classList.toggle('active', i === current));
        carousel.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === current));
        const counter = carousel.querySelector('.carousel-counter');
        if (counter) counter.textContent = `${current + 1} / ${total}`;
    }
});

async function checkMsgBadge(userId) {
    const badge = document.getElementById('nav-msg-badge');
    if (!badge) return;

    const updateMsgBadge = async () => {
        // last_read_at + created_at 한 번에 가져오기 (중복 쿼리 제거)
        const { data: memberships } = await supabase
            .from('room_members')
            .select('room_id, last_read_at')
            .eq('user_id', userId);
        if (!memberships || memberships.length === 0) { badge.style.display = 'none'; return; }

        let unread = 0;
        for (const m of memberships) {
            const since = m.last_read_at || (() => {
                const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString();
            })();
            const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('room_id', m.room_id)
                .neq('user_id', userId)
                .gt('created_at', since);
            unread += count || 0;
        }
        badge.textContent = unread > 9 ? '9+' : unread;
        badge.style.display = unread > 0 ? 'flex' : 'none';
    };

    await updateMsgBadge();
    supabase.channel('realtime-msg-badge')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, updateMsgBadge)
        .subscribe();
}
