/* profile/profile-logic.js */

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const profileUserId = params.get('id');

    if (!profileUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) window.location.href = `/profile/index.html?id=${user.id}`;
        else       window.location.href = '/login.html';
        return;
    }

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const isOwner = currentUser && currentUser.id === profileUserId;

    await loadProfile(profileUserId, isOwner, currentUser);
    await loadUserPams(profileUserId);
    await loadUserPosts(profileUserId);

    document.getElementById('edit-btn')?.addEventListener('click', () => {
        const f = document.getElementById('edit-form');
        f.style.display = f.style.display === 'none' ? 'block' : 'none';
    });
    document.getElementById('cancel-btn')?.addEventListener('click', () => {
        document.getElementById('edit-form').style.display = 'none';
    });
    document.getElementById('save-btn')?.addEventListener('click', () => saveProfile(profileUserId));
    document.getElementById('avatar-file-input')?.addEventListener('change', e => uploadAvatar(e, profileUserId));

    // 팔로워 / 팔로잉 클릭 이벤트
    document.getElementById('stat-followers-wrap')?.addEventListener('click', () => {
        openFollowModal('followers', profileUserId, currentUser);
    });
    document.getElementById('stat-following-wrap')?.addEventListener('click', () => {
        openFollowModal('following', profileUserId, currentUser);
    });
});

/* ─────────────────────────────────────────
   프로필 로드
───────────────────────────────────────── */
async function loadProfile(userId, isOwner, currentUser) {
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error || !profile) { document.getElementById('profile-username').textContent = '알 수 없는 유저'; return; }

    const avatar   = profile.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${userId}`;
    const username = profile.username || userId.slice(0, 8);

    document.getElementById('header-username').textContent  = username;
    document.getElementById('profile-avatar').src           = avatar;
    document.getElementById('profile-username').textContent = username;
    document.getElementById('profile-description').textContent = profile.description || '';
    document.title = `UnderGarden | ${username}`;

    const { count: realPostCount } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId);
    document.getElementById('stat-posts').textContent     = realPostCount || 0;
    document.getElementById('stat-followers').textContent = profile.follower_count || 0;
    document.getElementById('stat-following').textContent = profile.following_count || 0;

    if (isOwner) {
        document.getElementById('edit-btn').style.display           = 'flex';
        document.getElementById('avatar-upload-label').style.display = 'flex';
        document.getElementById('edit-username').value     = profile.username || '';
        document.getElementById('edit-description').value = profile.description || '';
        document.getElementById('edit-location').value    = profile.location || '';
        document.getElementById('edit-organization').value = profile.organization || '';
    } else {
        const followBtn = document.getElementById('follow-btn');
        if (followBtn) {
            followBtn.style.display = 'block';
            if (currentUser) {
                const { data: existingFollow } = await supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', userId).single();
                if (existingFollow) { followBtn.textContent = '팔로잉'; followBtn.classList.add('following'); }
            }
            followBtn.addEventListener('click', () => handleFollowToggle(userId, followBtn, currentUser));
        }
    }
}

/* ─────────────────────────────────────────
   팔로워 / 팔로잉 모달
───────────────────────────────────────── */
async function openFollowModal(type, userId, currentUser) {
    // 데이터 로드
    let users = [];
    if (type === 'followers') {
        const { data } = await supabase.from('follows').select('follower_id, profiles!follows_follower_id_fkey(id, username, avatar_url)').eq('following_id', userId);
        users = (data || []).map(r => r.profiles).filter(Boolean);
    } else {
        const { data } = await supabase.from('follows').select('following_id, profiles!follows_following_id_fkey(id, username, avatar_url)').eq('follower_id', userId);
        users = (data || []).map(r => r.profiles).filter(Boolean);
    }

    const title = type === 'followers' ? '팔로워' : '팔로잉';

    const overlay = document.createElement('div');
    overlay.className = 'ug-follow-overlay';
    overlay.innerHTML = `
        <div class="ug-follow-modal">
            <div class="ug-follow-modal-header">
                <span class="ug-follow-modal-title">${title}</span>
                <button class="ug-follow-modal-close" id="ug-follow-close">
                    <span class="material-symbols-rounded">close</span>
                </button>
            </div>
            <div class="ug-follow-search-wrap">
                <input class="ug-follow-search" id="ug-follow-search" placeholder="검색..." autocomplete="off">
            </div>
            <div class="ug-follow-list" id="ug-follow-list"></div>
        </div>`;
    document.body.appendChild(overlay);

    const listEl   = overlay.querySelector('#ug-follow-list');
    const searchEl = overlay.querySelector('#ug-follow-search');

    function renderList(query = '') {
        const filtered = users.filter(u => (u.username || '').toLowerCase().includes(query.toLowerCase()));
        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="ug-follow-empty">${query ? '검색 결과가 없어요' : `${title}가 없어요`}</div>`;
            return;
        }
        listEl.innerHTML = '';
        filtered.forEach(u => {
            const avatar = u.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${u.id}`;
            const item = document.createElement('div');
            item.className = 'ug-follow-item';
            item.innerHTML = `
                <img src="${avatar}" class="ug-follow-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${u.id}'">
                <div class="ug-follow-info">
                    <div class="ug-follow-name">@${escapeHtml(u.username || u.id.slice(0,8))}</div>
                    <div class="ug-follow-sub">프로필 보기</div>
                </div>`;
            item.addEventListener('click', () => {
                overlay.remove();
                window.location.href = `../profile/index.html?id=${u.id}`;
            });
            listEl.appendChild(item);
        });
    }

    renderList();
    searchEl.addEventListener('input', e => renderList(e.target.value));
    overlay.querySelector('#ug-follow-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    searchEl.focus();
}

/* ─────────────────────────────────────────
   프로필 저장
───────────────────────────────────────── */
async function saveProfile(userId) {
    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true; saveBtn.textContent = '저장 중...';

    const username     = document.getElementById('edit-username').value.trim();
    const description  = document.getElementById('edit-description').value.trim();
    const location     = document.getElementById('edit-location').value.trim();
    const organization = document.getElementById('edit-organization').value.trim();

    if (!username) {
        await ugAlert('닉네임을 입력해주세요.', { icon: 'warning', title: '입력 필요' });
        saveBtn.disabled = false; saveBtn.textContent = '저장하기';
        return;
    }

    try {
        const { error } = await supabase.from('profiles').update({ username, description, location, organization, updated_at: new Date() }).eq('id', userId);
        if (error) throw error;
        document.getElementById('profile-username').textContent  = username;
        document.getElementById('header-username').textContent   = username;
        document.getElementById('profile-description').textContent = description;
        document.getElementById('edit-form').style.display = 'none';
        showToast('프로필이 저장됐어요!');
    } catch (err) {
        await ugAlert('저장 실패: ' + err.message, { icon: 'error', title: '오류' });
    } finally {
        saveBtn.disabled = false; saveBtn.textContent = '저장하기';
    }
}

/* ─────────────────────────────────────────
   아바타 업로드
───────────────────────────────────────── */
async function uploadAvatar(e, userId) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { await ugAlert('3MB 이하 이미지만 가능합니다.', { icon: 'warning', title: '파일 크기 초과' }); return; }
    showToast('업로드 중...');
    try {
        const ext = file.name.split('.').pop();
        const fileName = `${userId}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true, cacheControl: '3600' });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
        const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl, updated_at: new Date() }).eq('id', userId);
        if (updateError) throw updateError;
        document.getElementById('profile-avatar').src = publicUrl + '?t=' + Date.now();
        showToast('프로필 사진이 변경됐어요!');
    } catch (err) {
        await ugAlert('업로드 실패: ' + err.message, { icon: 'error', title: '오류' });
    }
}

/* ─────────────────────────────────────────
   팔로우 토글
───────────────────────────────────────── */
async function handleFollowToggle(targetUserId, btn, currentUser) {
    if (!currentUser) { showToast('로그인이 필요합니다.'); return; }
    btn.disabled = true;
    const isFollowing = btn.classList.contains('following');
    if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', targetUserId);
        btn.textContent = '팔로우'; btn.classList.remove('following');
        const el = document.getElementById('stat-followers');
        if (el) el.textContent = Math.max(0, parseInt(el.textContent) - 1);
        // DB 카운트 업데이트
        const { data: tp } = await supabase.from('profiles').select('follower_count').eq('id', targetUserId).single();
        await supabase.from('profiles').update({ follower_count: Math.max(0, (tp?.follower_count || 1) - 1) }).eq('id', targetUserId);
        const { data: mp } = await supabase.from('profiles').select('following_count').eq('id', currentUser.id).single();
        await supabase.from('profiles').update({ following_count: Math.max(0, (mp?.following_count || 1) - 1) }).eq('id', currentUser.id);
    } else {
        await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: targetUserId });
        btn.textContent = '팔로잉'; btn.classList.add('following');
        const el = document.getElementById('stat-followers');
        if (el) el.textContent = parseInt(el.textContent) + 1;
        const { data: tp } = await supabase.from('profiles').select('follower_count').eq('id', targetUserId).single();
        await supabase.from('profiles').update({ follower_count: (tp?.follower_count || 0) + 1 }).eq('id', targetUserId);
        const { data: mp } = await supabase.from('profiles').select('following_count').eq('id', currentUser.id).single();
        await supabase.from('profiles').update({ following_count: (mp?.following_count || 0) + 1 }).eq('id', currentUser.id);
        const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', currentUser.id).single();
        await supabase.from('notifications').insert({ user_id: targetUserId, type: 'follow', actor_id: currentUser.id, message: `@${myProfile?.username || '누군가'}님이 팔로우했어요.` });
    }
    btn.disabled = false;
}

/* ─────────────────────────────────────────
   게시물 로드
───────────────────────────────────────── */
async function loadUserPosts(userId) {
    const container = document.getElementById('profile-posts');
    try {
        const { data: posts, error } = await supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (error) throw error;
        if (!posts || posts.length === 0) {
            container.innerHTML = `<div class="profile-empty"><span class="material-symbols-rounded" style="font-size:40px;display:block;margin-bottom:12px;">eco</span>아직 게시물이 없어요.</div>`;
            return;
        }
        container.innerHTML = '';
        posts.forEach(post => container.appendChild(createProfilePostCard(post)));
    } catch (err) {
        container.innerHTML = `<div class="profile-empty" style="color:var(--error)">${err.message}</div>`;
    }
}

function createProfilePostCard(post) {
    const card = document.createElement('div');
    card.className = 'profile-post-card-v2';
    const timeAgo = formatTime(new Date(post.created_at));
    const tagsHtml = (post.tags || []).slice(0, 3).map(t => `<span class="ppc-tag">#${t}</span>`).join('');
    const plainContent = (post.content || '').replace(/[#*`>~_\[\]]/g, '').trim();
    const img = post.image_url || (post.image_urls && post.image_urls[0]);
    card.innerHTML = `
        <div class="ppcard-img-wrap">
            ${img ? `<img src="${img}" class="ppcard-img" alt="">` : `<div class="ppcard-img-placeholder"><span class="material-symbols-rounded">article</span></div>`}
        </div>
        <div class="ppcard-body">
            ${post.title ? `<div class="ppcard-title">${escapeHtml(post.title)}</div>` : ''}
            <div class="ppcard-preview">${escapeHtml(plainContent.substring(0, 80))}${plainContent.length > 80 ? '...' : ''}</div>
            <div class="ppcard-meta">
                <span class="ppcard-time">${timeAgo}</span>
                <div class="ppcard-tags">${tagsHtml}</div>
            </div>
        </div>`;
    card.addEventListener('click', () => openPostModal(post));
    return card;
}

async function openPostModal(post) {
    // 상세 데이터 fetch
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
    const tagsHtml     = (p.tags || []).map(t => `<span style="display:inline-block;padding:2px 10px;background:var(--bg-2);border-radius:20px;font-size:0.78rem;color:var(--primary);font-weight:600;">#${escapeHtml(t)}</span>`).join('');
    const timeStr      = formatTime(new Date(p.created_at));
    const hasImg       = imgs.length > 0;

    let mediaHtml = '';
    if (imgs.length > 1) {
        mediaHtml = `<div style="position:relative;background:#000;flex:1;display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden;">
            <div id="prof-modal-slides" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
                ${imgs.map((u,i) => `<img src="${u}" style="max-width:100%;max-height:100%;object-fit:contain;display:${i===0?'block':'none'};">`).join('')}
            </div>
            <button onclick="profModalCarousel(-1)" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.55);color:#fff;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;z-index:2;">&#8249;</button>
            <button onclick="profModalCarousel(1)"  style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.55);color:#fff;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;z-index:2;">&#8250;</button>
            <div style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:5px;" id="prof-modal-dots">
                ${imgs.map((_,i) => `<div style="width:6px;height:6px;border-radius:50%;background:${i===0?'#fff':'rgba(255,255,255,0.4)'};transition:background 0.2s;"></div>`).join('')}
            </div></div>`;
    } else if (imgs.length === 1) {
        mediaHtml = `<div style="background:#000;flex:1;display:flex;align-items:center;justify-content:center;min-height:0;overflow:hidden;">
            <img src="${imgs[0]}" style="max-width:100%;max-height:100%;object-fit:contain;"></div>`;
    }

    let overlay = document.getElementById('post-modal-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'post-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
    <style>@keyframes profModalIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}</style>
    <div style="display:flex;flex-direction:${hasImg?'row':'column'};width:${hasImg?'min(900px,94vw)':'min(520px,94vw)'};max-height:90vh;background:var(--bg-1);border-radius:16px;overflow:hidden;border:1px solid var(--border);animation:profModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1);">
        ${hasImg ? mediaHtml : ''}
        <div style="width:${hasImg?'340px':'100%'};min-width:${hasImg?'280px':'unset'};flex-shrink:0;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-1);">
            <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border);flex-shrink:0;">
                <img src="${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${p.user_id}'">
                <div>
                    <div style="font-weight:700;font-size:0.88rem;color:var(--text-0);">@${escapeHtml(username)}</div>
                    <div style="font-size:0.72rem;color:var(--text-3);">${timeStr}</div>
                </div>
                <button onclick="document.getElementById('post-modal-overlay').remove()" style="margin-left:auto;width:30px;height:30px;background:var(--bg-2);border:none;border-radius:50%;color:var(--text-2);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>
            <div style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:0;">
                ${p.title ? `<div style="font-size:1.05rem;font-weight:800;color:var(--text-0);line-height:1.3;">${escapeHtml(p.title)}</div>` : ''}
                ${plainContent ? `<p style="font-size:0.88rem;color:var(--text-1);line-height:1.75;white-space:pre-wrap;margin:0;">${escapeHtml(plainContent)}</p>` : ''}
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
    window._profCarouselIdx  = 0;
    window._profCarouselImgs = imgs;
}

window.profModalCarousel = function(dir) {
    const imgs = window._profCarouselImgs || [];
    if (imgs.length < 2) return;
    window._profCarouselIdx = (window._profCarouselIdx + dir + imgs.length) % imgs.length;
    const idx = window._profCarouselIdx;
    document.querySelectorAll('#prof-modal-slides img').forEach((s,i) => s.style.display = i===idx?'block':'none');
    document.querySelectorAll('#prof-modal-dots div').forEach((d,i) => {
        d.style.background = i===idx ? '#fff' : 'rgba(255,255,255,0.4)';
    });
};

/* ─── 팸 모달 (프로필 페이지용) ─── */
async function openProfilePamModal(pam) {
    const { data: p } = await supabase.from('pams').select('*').eq('id', pam.id).single();
    const data = p || pam;

    let overlay = document.getElementById('prof-pam-modal-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'prof-pam-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
    <style>@keyframes profModalIn{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}</style>
    <div style="width:min(460px,94vw);background:var(--bg-1);border-radius:20px;overflow:hidden;border:1px solid var(--border);animation:profModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1);">
        <div style="width:100%;height:200px;background:var(--bg-2);position:relative;overflow:hidden;">
            ${data.image_url ? `<img src="${data.image_url}" style="width:100%;height:100%;object-fit:cover;">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:64px;">🌿</div>`}
            <button onclick="document.getElementById('prof-pam-modal-overlay').remove()" style="position:absolute;top:12px;right:12px;width:32px;height:32px;background:rgba(0,0,0,0.5);border:none;border-radius:50%;color:#fff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">✕</button>
        </div>
        <div style="padding:20px 22px 24px;">
            <div style="font-size:1.25rem;font-weight:800;color:var(--text-0);margin-bottom:6px;">${escapeHtml(data.name||'')}</div>
            ${data.description ? `<p style="font-size:0.88rem;color:var(--text-1);line-height:1.7;margin:0 0 14px;">${escapeHtml(data.description)}</p>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;">
                <div style="display:flex;align-items:center;gap:5px;font-size:0.82rem;color:var(--text-2);">
                    <span class="material-symbols-rounded" style="font-size:16px;">group</span>
                    <b style="color:var(--text-0);">${data.member_count||0}</b>명
                </div>
                ${data.region ? `<div style="display:flex;align-items:center;gap:5px;font-size:0.82rem;color:var(--text-2);"><span class="material-symbols-rounded" style="font-size:16px;">location_on</span>${escapeHtml(data.region)}</div>` : ''}
            </div>
            <a href="/pam.html?id=${data.id}" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px;background:var(--primary);color:#fff;border-radius:12px;font-weight:700;font-size:0.9rem;text-decoration:none;">
                <span class="material-symbols-rounded" style="font-size:18px;">groups</span>팸 페이지로 이동
            </a>
        </div>
    </div>`;

    document.body.appendChild(overlay);
}

/* ─── 유저 팸 ─── */
async function loadUserPams(userId) {
    const { data: memberships } = await supabase.from('pam_members').select('pam_id').eq('user_id', userId);
    const pamSection = document.getElementById('profile-pams-section');
    const pamList    = document.getElementById('profile-pams-list');
    if (!pamSection || !pamList) return;
    if (!memberships || memberships.length === 0) { pamSection.style.display = 'none'; return; }
    const pamIds = memberships.map(m => m.pam_id);
    const { data: pams } = await supabase.from('pams').select('id, name, image_url, member_count, region').in('id', pamIds);
    if (!pams || pams.length === 0) { pamSection.style.display = 'none'; return; }
    pamSection.style.display = 'block';
    pamList.innerHTML = '';
    pams.forEach(pam => {
        const item = document.createElement('div');
        item.className = 'profile-pam-card';
        item.style.cursor = 'pointer';
        item.innerHTML = `
            <div class="profile-pam-img">${pam.image_url ? `<img src="${pam.image_url}" alt="${escapeHtml(pam.name)}">` : '<span class="material-symbols-rounded" style="font-size:24px;color:var(--text-3)">groups</span>'}</div>
            <div class="profile-pam-name">${escapeHtml(pam.name)}</div>
            <div class="profile-pam-members">${pam.member_count || 1}명</div>`;
        item.addEventListener('click', () => openProfilePamModal(pam));
        pamList.appendChild(item);
    });
}

/* ─── 유틸 ─── */
function formatTime(date) {
    const diff = (Date.now() - date) / 1000;
    if (diff < 60)     return '방금 전';
    if (diff < 3600)   return `${Math.floor(diff/60)}분 전`;
    if (diff < 86400)  return `${Math.floor(diff/3600)}시간 전`;
    if (diff < 604800) return `${Math.floor(diff/86400)}일 전`;
    return `${date.getMonth()+1}월 ${date.getDate()}일`;
}
function escapeHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function showToast(msg) {
    let t = document.querySelector('.ug-toast');
    if (!t) { t = document.createElement('div'); t.className = 'ug-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}
