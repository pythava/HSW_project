/* js/main-logic.js */
 
document.addEventListener('DOMContentLoaded', () => {
    fetchPosts();
    fetchTrendingQueries();
 
    // 탭 전환 이벤트 (최신/팔로잉)
    const tabs = document.querySelectorAll('.tab-item');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });
});
 
/**
 * Supabase에서 게시물 데이터를 가져와 화면에 렌더링
 */
async function fetchPosts() {
    const feedContainer = document.getElementById('main-feed');
    const loader = feedContainer.querySelector('.feed-loader');
 
    try {
        const { data: posts, error } = await supabase
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false });
 
        if (error) {
            console.error('Supabase error:', error.code, error.message, error.details);
            throw error;
        }
 
        if (loader) loader.remove();
 
        if (!posts || posts.length === 0) {
            feedContainer.innerHTML = `
                <div class="feed-empty">
                    <p>가든에 아직 아무도 없네요.<br>첫 번째 씨앗을 심어보세요.</p>
                </div>`;
            return;
        }
 
        if (loader) loader.remove();
        posts.forEach(post => {
            feedContainer.appendChild(createPostCard(post));
        });
 
    } catch (err) {
        console.error('Fetch Error:', err);
        if (loader) loader.remove();
        feedContainer.innerHTML = `
            <div class="feed-error" style="padding:40px; text-align:center; color:var(--text-2);">
                데이터를 불러오지 못했습니다.<br>
                <small style="font-size:0.8rem; opacity:0.6;">${err.message}</small>
            </div>`;
    }
}
 
/**
 * 게시물 HTML 카드 생성
 */
function createPostCard(post) {
    const postDiv = document.createElement('article');
    postDiv.className = 'post-item';
 
    const avatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${post.user_id}`;
    const username = post.user_id?.slice(0, 8) || 'Anonymous';
    const timeAgo = formatTime(new Date(post.created_at));
 
    postDiv.innerHTML = `
        <div class="post-wrapper" style="padding: 20px; border-bottom: 1px solid var(--border); transition: var(--transition-fast);">
            <div class="post-header" style="display: flex; gap: 12px; margin-bottom: 12px;">
                <img src="${avatar}" style="width: 44px; height: 44px; border-radius: 50%; background: var(--bg-2);">
                <div class="post-user-info">
                    <div style="font-weight: 700; color: var(--text-0);">${username}</div>
                    <div style="font-size: 0.85rem; color: var(--text-3);">${timeAgo}</div>
                </div>
            </div>
            <div class="post-content" style="font-size: 1.05rem; color: var(--text-1); margin-bottom: 15px; white-space: pre-wrap;">
                ${post.content}
            </div>
            ${post.image_url ? `<img src="${post.image_url}" style="width: 100%; border-radius: 12px; margin-bottom: 15px; border: 1px solid var(--border);">` : ''}
            <div class="post-actions" style="display: flex; gap: 20px; color: var(--text-2);">
                <button class="act-btn" onclick="handleLike('${post.id}')" style="display: flex; align-items: center; gap: 6px; font-size: 0.9rem;">
                    <span class="material-symbols-rounded" style="font-size: 20px;">favorite</span> ${post.likes_count || 0}
                </button>
                <button class="act-btn" style="display: flex; align-items: center; gap: 6px; font-size: 0.9rem;">
                    <span class="material-symbols-rounded" style="font-size: 20px;">chat_bubble</span> 댓글
                </button>
            </div>
        </div>
    `;
 
    postDiv.addEventListener('mouseenter', () => postDiv.style.backgroundColor = 'rgba(255,255,255,0.02)');
    postDiv.addEventListener('mouseleave', () => postDiv.style.backgroundColor = 'transparent');
 
    return postDiv;
}
 
/**
 * 시간 경과 표시
 */
function formatTime(date) {
    const now = new Date();
    const diff = (now - date) / 1000;
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
 
/**
 * 좋아요 핸들러
 */
async function handleLike(postId) {
    console.log('Like requested for:', postId);
}
 
/**
 * 인기 검색어
 */
async function fetchTrendingQueries() {
    const trendingList = document.getElementById('trending-queries');
    if (!trendingList) return; // 요소 없으면 조용히 종료
 
    try {
        const { data, error } = await supabase
            .from('search_logs')
            .select('query');
 
        if (error) throw error;
 
        const counts = data.reduce((acc, curr) => {
            acc[curr.query] = (acc[curr.query] || 0) + 1;
            return acc;
        }, {});
 
        const sorted = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
 
        if (sorted.length === 0) {
            trendingList.innerHTML = '<li style="color:var(--text-3); font-size:0.9rem;">검색 데이터가 없습니다.</li>';
            return;
        }
 
        trendingList.innerHTML = sorted.map(([query, count], index) => `
            <li>
                <a href="/search.html?q=${encodeURIComponent(query)}">${index + 1}. ${query}</a>
                <span class="count">${count > 10 ? 'HOT' : count}</span>
            </li>
        `).join('');
 
    } catch (err) {
        console.error('Trending fetch error:', err);
        if (trendingList) trendingList.innerHTML = '<li style="color:var(--text-3); font-size:0.9rem;">불러오기 실패</li>';
    }
}
 
