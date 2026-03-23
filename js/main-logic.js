/* css/main-style.css */

/* ───────────────────────────────────────────
   레이아웃
─────────────────────────────────────────── */
.ug-layout {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
}

/* 좌측 사이드바 */
.ug-side-nav {
    width: var(--side-nav-width);
    min-width: var(--side-nav-width);
    background-color: var(--bg-1);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 30px 20px;
    height: 100%;
}

.ug-side-nav .logo {
    font-size: 1.6rem;
    font-weight: 800;
    color: var(--primary);
    letter-spacing: -1px;
    margin-bottom: 50px;
    display: block;
    padding-left: 10px;
}

.ug-side-nav .nav-links { flex: 1; }
.ug-side-nav .nav-links li { margin-bottom: 8px; }

.ug-side-nav .nav-links a,
.ug-side-nav .nav-footer button {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 12px 18px;
    color: var(--text-2);
    font-size: 1.05rem;
    font-weight: 600;
    border-radius: 12px;
    width: 100%;
    text-align: left;
}

.ug-side-nav .nav-links a:not(.write-link):not(.active):hover,
.ug-side-nav .nav-footer button:hover {
    background-color: var(--bg-2);
    color: var(--text-0);
}

.ug-side-nav .nav-links a.active {
    background-color: var(--primary-alpha);
    color: var(--primary);
    font-weight: 700;
}

.ug-side-nav .nav-links a.active span.material-symbols-rounded {
    font-variation-settings: 'FILL' 1;
}

.ug-side-nav .nav-links a.write-link {
    background-color: var(--primary);
    color: white;
    margin-top: 30px;
    justify-content: center;
    font-weight: 700;
    gap: 10px;
}
.ug-side-nav .nav-links a.write-link:hover {
    background-color: var(--primary-hover);
    transform: translateY(-2px);
}

.ug-side-nav span.material-symbols-rounded { font-size: 26px; }

/* 중앙 피드 */
.ug-main-feed {
    flex: 1;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    background-color: var(--bg-0);
    height: 100%;
    min-width: 500px;
}

.ug-main-feed .main-header {
    padding: 24px 30px 0;
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: rgba(5, 5, 5, 0.85);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
}

.ug-main-feed .main-header h1 {
    font-size: 1.4rem;
    font-weight: 800;
    letter-spacing: -0.5px;
    margin-bottom: 20px;
}

.ug-main-feed .feed-tabs { display: flex; }
.ug-main-feed .tab-item {
    padding: 12px 20px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-2);
    position: relative;
    cursor: pointer;
    transition: color 0.2s;
}
.ug-main-feed .tab-item:hover { color: var(--text-0); }
.ug-main-feed .tab-item.active { color: var(--text-0); font-weight: 700; }
.ug-main-feed .tab-item.active::after {
    content: '';
    position: absolute;
    bottom: -1px; left: 0;
    width: 100%; height: 3px;
    background-color: var(--primary);
    border-radius: 3px;
}

/* 스크롤 영역 */
.feed-scroll-area {
    flex: 1;
    overflow-y: scroll;
    padding: 24px 0;
}
.feed-scroll-area::-webkit-scrollbar { width: 6px; }
.feed-scroll-area::-webkit-scrollbar-track { background: transparent; }
.feed-scroll-area::-webkit-scrollbar-thumb { background-color: var(--border); border-radius: 4px; }
.feed-scroll-area::-webkit-scrollbar-thumb:hover { background-color: var(--text-3); }

/* 피드 로더 */
.feed-loader {
    text-align: center;
    padding: 60px 0;
    color: var(--text-3);
    font-size: 0.95rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
}
.feed-empty, .feed-error {
    text-align: center;
    padding: 80px 30px;
    color: var(--text-2);
    line-height: 1.8;
    font-size: 0.95rem;
}

/* 우측 패널 */
.ug-right-panel {
    width: var(--panel-right-width);
    min-width: var(--panel-right-width);
    background-color: var(--bg-1);
    padding: 30px;
    display: flex;
    flex-direction: column;
    gap: 30px;
    height: 100%;
    overflow-y: auto;
}

.trending-topics h2 {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-1);
    margin-bottom: 16px;
    letter-spacing: -0.3px;
    text-transform: uppercase;
    font-size: 0.8rem;
    color: var(--text-3);
}
.trending-topics li {
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.trending-topics li a {
    font-size: 0.92rem;
    color: var(--text-1);
    font-weight: 600;
    transition: color 0.2s;
}
.trending-topics li a:hover { color: var(--primary-hover); }
.trending-topics li .count {
    font-size: 0.8rem;
    color: var(--text-3);
    font-family: monospace;
}

.auth-status-card {
    background-color: var(--bg-2);
    border-radius: 16px;
    padding: 20px;
    border: 1px solid var(--border);
    text-align: center;
}

/* ───────────────────────────────────────────
   게시물 카드
─────────────────────────────────────────── */
.post-card {
    margin: 0 24px 16px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 20px;
    overflow: hidden;
    transition: border-color 0.2s, transform 0.2s;
}

.post-card:hover {
    border-color: rgba(157, 78, 221, 0.35);
    transform: translateY(-1px);
}

.post-card-inner {
    padding: 22px 24px 18px;
}

/* 카드 헤더 */
.post-card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
}

.post-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 2px solid var(--border);
    background: var(--bg-2);
    flex-shrink: 0;
}

.post-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.post-username {
    font-weight: 700;
    font-size: 0.92rem;
    color: var(--text-0);
}

.post-time {
    font-size: 0.78rem;
    color: var(--text-3);
}

/* 제목 */
.post-title {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--text-0);
    margin-bottom: 10px;
    letter-spacing: -0.3px;
    line-height: 1.4;
}

/* 본문 */
.post-body {
    color: var(--text-1);
    font-size: 0.92rem;
    line-height: 1.75;
    margin-bottom: 14px;
}

/* 이미지 */
.post-image-wrap {
    margin: 12px 0;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid var(--border);
}

.post-image {
    width: 100%;
    height: auto;
    max-height: 480px;
    object-fit: cover;
    display: block;
}

/* 태그 */
.post-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 12px 0 4px;
}

.post-tag {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--primary);
    background: var(--primary-alpha);
    padding: 3px 10px;
    border-radius: 20px;
}

/* 액션 버튼 */
.post-actions {
    display: flex;
    gap: 4px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
}

.action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 10px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-2);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
}

.action-btn:hover {
    background: var(--bg-2);
    color: var(--text-0);
}

.action-btn .material-symbols-rounded { font-size: 20px; }

/* 좋아요 활성 */
.like-btn.liked {
    color: #f43f5e;
}
.like-btn.liked:hover {
    background: rgba(244, 63, 94, 0.1);
}

@keyframes likePop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.4); }
    70%  { transform: scale(0.9); }
    100% { transform: scale(1); }
}
.like-pop .like-icon { animation: likePop 0.4s ease; }

/* ───────────────────────────────────────────
   댓글
─────────────────────────────────────────── */
.comment-section {
    margin-top: 16px;
    border-top: 1px solid var(--border);
    padding-top: 16px;
    animation: fadeIn 0.2s ease;
}

@keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

.comment-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 14px;
    max-height: 280px;
    overflow-y: auto;
}

.comment-list::-webkit-scrollbar { width: 4px; }
.comment-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

.comment-loading, .no-comments {
    font-size: 0.82rem;
    color: var(--text-3);
    text-align: center;
    padding: 12px 0;
}

.comment-item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
}

.comment-avatar-sm {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--bg-2);
}

.comment-bubble {
    background: var(--bg-2);
    border-radius: 12px;
    padding: 9px 13px;
    flex: 1;
}

.comment-user {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--primary);
    display: block;
    margin-bottom: 3px;
}

.comment-text {
    font-size: 0.88rem;
    color: var(--text-1);
    line-height: 1.5;
    word-break: break-word;
}

.comment-time {
    font-size: 0.72rem;
    color: var(--text-3);
    margin-top: 4px;
    display: block;
}

/* 댓글 입력창 */
.comment-input-row {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 8px 10px 8px 14px;
    transition: border-color 0.2s;
}

.comment-input-row:focus-within {
    border-color: var(--primary);
}

.comment-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-0);
    font-size: 0.88rem;
    font-family: inherit;
    padding: 4px 0;
}

.comment-input::placeholder { color: var(--text-3); }

.comment-send-btn {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: var(--primary);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.2s, transform 0.1s;
}

.comment-send-btn:hover { background: var(--primary-hover); }
.comment-send-btn:active { transform: scale(0.92); }
.comment-send-btn .material-symbols-rounded { font-size: 18px; }

/* ───────────────────────────────────────────
   마크다운 렌더링 스타일
─────────────────────────────────────────── */
.markdown-rendered h1 { font-size: 1.5rem; font-weight: 800; color: var(--text-0); margin: 1em 0 0.5em; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.markdown-rendered h2 { font-size: 1.25rem; font-weight: 700; color: var(--text-0); margin: 0.9em 0 0.4em; }
.markdown-rendered h3 { font-size: 1.05rem; font-weight: 700; color: var(--text-0); margin: 0.8em 0 0.3em; }
.markdown-rendered h4 { font-size: 0.95rem; font-weight: 700; color: var(--text-1); margin: 0.7em 0 0.3em; }
.markdown-rendered p  { margin: 0.5em 0; }
.markdown-rendered strong { color: var(--text-0); font-weight: 700; }
.markdown-rendered em { color: var(--text-1); font-style: italic; }
.markdown-rendered del { opacity: 0.55; }
.markdown-rendered a  { color: var(--primary); text-decoration: underline; text-underline-offset: 3px; }
.markdown-rendered blockquote {
    border-left: 3px solid var(--primary);
    padding: 4px 14px;
    margin: 10px 0;
    color: var(--text-2);
    background: var(--primary-alpha);
    border-radius: 0 8px 8px 0;
    font-style: italic;
}
.markdown-rendered code {
    background: var(--bg-2);
    padding: 2px 6px;
    border-radius: 5px;
    font-family: 'Courier New', monospace;
    font-size: 0.85em;
    color: #c084fc;
}
.markdown-rendered pre {
    background: var(--bg-2);
    border: 1px solid var(--border);
    padding: 14px 18px;
    border-radius: 12px;
    overflow-x: auto;
    margin: 10px 0;
}
.markdown-rendered pre code { background: transparent; padding: 0; color: var(--text-1); }
.markdown-rendered ul, .markdown-rendered ol { padding-left: 20px; margin: 0.5em 0; }
.markdown-rendered li { margin: 0.25em 0; }
.markdown-rendered hr { border: none; border-top: 1px solid var(--border); margin: 1.2em 0; }
.markdown-rendered img { max-width: 100%; border-radius: 10px; margin: 8px 0; }

/* ───────────────────────────────────────────
   토스트
─────────────────────────────────────────── */
.ug-toast {
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: var(--bg-2);
    border: 1px solid var(--border);
    color: var(--text-0);
    padding: 12px 24px;
    border-radius: 30px;
    font-size: 0.88rem;
    font-weight: 600;
    z-index: 9999;
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(12px);
    pointer-events: none;
    white-space: nowrap;
}

.ug-toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}

/* ───────────────────────────────────────────
   스핀 애니메이션
─────────────────────────────────────────── */
@keyframes spin { to { transform: rotate(360deg); } }
.animation-spin { animation: spin 1s linear infinite; display: inline-block; }
