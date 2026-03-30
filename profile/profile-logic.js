/* profile/profile-logic.js */

document.addEventListener('DOMContentLoaded', async () => {
    // URL 파라미터에서 유저 ID 가져오기
    const params = new URLSearchParams(window.location.search);
    const profileUserId = params.get('id');

    if (!profileUserId) {
        // id 없으면 내 프로필로 리다이렉트
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            window.location.href = `/profile/index.html?id=${user.id}`;
        } else {
            window.location.href = '/login.html';
        }
        return;
    }

    // 현재 로그인 유저
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const isOwner = currentUser && currentUser.id === profileUserId;

    // 프로필 로드
    await loadProfile(profileUserId, isOwner, currentUser);
    await loadUserPams(profileUserId);
    await loadUserPosts(profileUserId);

    // 수정 버튼
    const editBtn = document.getElementById('edit-btn');
    const editForm = document.getElementById('edit-form');
    const cancelBtn = document.getElementById('cancel-btn');
    const saveBtn = document.getElementById('save-btn');

    editBtn?.addEventListener('click', () => {
        editForm.style.display = editForm.style.display === 'none' ? 'block' : 'none';
    });

    cancelBtn?.addEventListener('click', () => {
        editForm.style.display = 'none';
    });

    saveBtn?.addEventListener('click', () => saveProfile(profileUserId));

    // 아바타 업로드
    const avatarFileInput = document.getElementById('avatar-file-input');
    avatarFileInput?.addEventListener('change', (e) => uploadAvatar(e, profileUserId));
});

/* ─────────────────────────────────────────
   프로필 로드
───────────────────────────────────────── */
async function loadProfile(userId, isOwner, currentUser) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !profile) {
        document.getElementById('profile-username').textContent = '알 수 없는 유저';
        return;
    }

    const avatar = profile.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${userId}`;
    const username = profile.username || userId.slice(0, 8);

    // 헤더 & 아바타 & 이름
    document.getElementById('header-username').textContent = username;
    document.getElementById('profile-avatar').src = avatar;
    document.getElementById('profile-username').textContent = username;
    document.getElementById('profile-description').textContent = profile.description || '';
    document.title = `UnderGarden | ${username}`;

    // 통계 - post_count는 실제 게시물 수로 계산
    const { count: realPostCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
    document.getElementById('stat-posts').textContent = realPostCount || 0;
    document.getElementById('stat-followers').textContent = profile.follower_count || 0;
    document.getElementById('stat-following').textContent = profile.following_count || 0;

    // 본인이면 수정 버튼 + 아바타 업로드 오버레이 표시
    if (isOwner) {
        document.getElementById('edit-btn').style.display = 'flex';
        document.getElementById('avatar-upload-label').style.display = 'flex';

        // 수정 폼 초기값
        document.getElementById('edit-username').value = profile.username || '';
        document.getElementById('edit-description').value = profile.description || '';
        document.getElementById('edit-location').value = profile.location || '';
        document.getElementById('edit-organization').value = profile.organization || '';
    } else {
        // 남의 프로필이면 팔로우 버튼
        const followBtn = document.getElementById('follow-btn');
        if (followBtn) {
            followBtn.style.display = 'block';
            // 현재 팔로우 상태 확인
            if (currentUser) {
                const { data: existingFollow } = await supabase
                    .from('follows')
                    .select('id')
                    .eq('follower_id', currentUser.id)
                    .eq('following_id', userId)
                    .single();
                if (existingFollow) {
                    followBtn.textContent = '팔로잉';
                    followBtn.classList.add('following');
                }
            }
            followBtn.addEventListener('click', () => handleFollowToggle(userId, followBtn, currentUser));
        }
    }
}

/* ─────────────────────────────────────────
   프로필 저장
───────────────────────────────────────── */
async function saveProfile(userId) {
    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';

    const username    = document.getElementById('edit-username').value.trim();
    const description = document.getElementById('edit-description').value.trim();
    const location    = document.getElementById('edit-location').value.trim();
    const organization = document.getElementById('edit-organization').value.trim();

    if (!username) {
        showToast('닉네임을 입력해주세요.');
        saveBtn.disabled = false;
        saveBtn.textContent = '저장하기';
        return;
    }

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ username, description, location, organization, updated_at: new Date() })
            .eq('id', userId);

        if (error) throw error;

        // UI 즉시 반영
        document.getElementById('profile-username').textContent = username;
        document.getElementById('header-username').textContent = username;
        document.getElementById('profile-description').textContent = description;
        document.getElementById('edit-form').style.display = 'none';

        showToast('프로필이 저장됐어요!');
    } catch (err) {
        showToast('저장 실패: ' + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '저장하기';
    }
}

/* ─────────────────────────────────────────
   아바타 업로드
───────────────────────────────────────── */
async function uploadAvatar(e, userId) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
        showToast('3MB 이하 이미지만 가능합니다.');
        return;
    }

    showToast('업로드 중...');

    try {
        const ext = file.name.split('.').pop();
        const fileName = `${userId}/avatar.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, file, { upsert: true, cacheControl: '3600' });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);

        // profiles 테이블 업데이트
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ avatar_url: publicUrl, updated_at: new Date() })
            .eq('id', userId);

        if (updateError) throw updateError;

        // UI 즉시 반영 (캐시 bust)
        document.getElementById('profile-avatar').src = publicUrl + '?t=' + Date.now();
        showToast('프로필 사진이 변경됐어요!');

    } catch (err) {
        showToast('업로드 실패: ' + err.message);
    }
}

/* ─────────────────────────────────────────
   팔로우 토글
───────────────────────────────────────── */
async function handleFollowToggle(targetUserId, btn, currentUser) {
    if (!currentUser) { showToast('로그인이 필요합니다.'); return; }
    const isFollowing = btn.classList.contains('following');

    if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', currentUser.id).eq('following_id', targetUserId);
        btn.textContent = '팔로우';
        btn.classList.remove('following');
        // 팔로워 수 UI 감소
        const el = document.getElementById('stat-followers');
        if (el) el.textContent = Math.max(0, parseInt(el.textContent) - 1);
    } else {
        await supabase.from('follows').insert({ follower_id: currentUser.id, following_id: targetUserId });
        btn.textContent = '팔로잉';
        btn.classList.add('following');
        // 팔로워 수 UI 증가
        const el = document.getElementById('stat-followers');
        if (el) el.textContent = parseInt(el.textContent) + 1;
        // 알림 생성
        const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', currentUser.id).single();
        await supabase.from('notifications').insert({
            user_id: targetUserId, type: 'follow', actor_id: currentUser.id,
            message: `@${myProfile?.username || '누군가'}님이 팔로우했어요.`
        });
    }
}

/* ─────────────────────────────────────────
   유저 게시물 로드
───────────────────────────────────────── */
async function loadUserPosts(userId) {
    const container = document.getElementById('profile-posts');

    try {
        const { data: posts, error } = await supabase
            .from('posts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!posts || posts.length === 0) {
            container.innerHTML = `
                <div class="profile-empty">
                    <span class="material-symbols-rounded" style="font-size:40px;display:block;margin-bottom:12px;">eco</span>
                    아직 게시물이 없어요.
                </div>`;
            return;
        }

        container.innerHTML = '';
        posts.forEach(post => container.appendChild(createProfilePostCard(post)));

    } catch (err) {
        container.innerHTML = `<div class="profile-empty" style="color:var(--error)">${err.message}</div>`;
    }
}

/* ─────────────────────────────────────────
   프로필 게시물 카드
───────────────────────────────────────── */
function createProfilePostCard(post) {
    const card = document.createElement('div');
    card.className = 'profile-post-card-v2';

    const timeAgo = formatTime(new Date(post.created_at));
    const tagsHtml = (post.tags || []).slice(0, 3).map(t => `<span class="ppc-tag">#${t}</span>`).join('');
    const plainContent = (post.content || '').replace(/[#*`>~_\[\]]/g, '').trim();
    const img = post.image_url || (post.image_urls && post.image_urls[0]);

    card.innerHTML = `
        <div class="ppcard-img-wrap">
            ${img ? `<img src="${img}" class="ppcard-img" alt="">` :
              `<div class="ppcard-img-placeholder"><span class="material-symbols-rounded">article</span></div>`}
        </div>
        <div class="ppcard-body">
            ${post.title ? `<div class="ppcard-title">${escapeHtml(post.title)}</div>` : ''}
            <div class="ppcard-preview">${escapeHtml(plainContent.substring(0, 80))}${plainContent.length > 80 ? '...' : ''}</div>
            <div class="ppcard-meta">
                <span class="ppcard-time">${timeAgo}</span>
                <div class="ppcard-tags">${tagsHtml}</div>
            </div>
        </div>
    `;

    card.addEventListener('click', () => openPostModal(post));
    return card;
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openPostModal(post) {
    let overlay = document.getElementById('post-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'post-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:40px 20px;backdrop-filter:blur(6px);';
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';

    const img = post.image_url || (post.image_urls && post.image_urls[0]);
    const imgs = post.image_urls && post.image_urls.length > 0 ? post.image_urls : (post.image_url ? [post.image_url] : []);
    const carouselHtml = imgs.length > 1
        ? `<div style="position:relative;background:#000;border-radius:12px;overflow:hidden;margin-bottom:16px;">
            <div id="modal-carousel-slides">${imgs.map((u,i) => `<img src="${u}" style="width:100%;max-height:400px;object-fit:contain;display:${i===0?'block':'none'}">`).join('')}</div>
            <button onclick="modalCarousel(-1)" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;">&#8249;</button>
            <button onclick="modalCarousel(1)" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;">&#8250;</button>
            <div style="position:absolute;bottom:8px;right:12px;background:rgba(0,0,0,0.6);color:white;font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:20px;" id="modal-carousel-counter">1/${imgs.length}</div>
           </div>`
        : img ? `<img src="${img}" style="width:100%;max-height:400px;object-fit:contain;background:#000;border-radius:12px;margin-bottom:16px;">` : '';

    const plainContent = (post.content || '').replace(/[#*`>~_\[\]]/g, '').trim();
    const tagsHtml = (post.tags || []).map(t => `<span class="ppc-tag">#${t}</span>`).join('');
    const timeAgo = formatTime(new Date(post.created_at));

    overlay.innerHTML = `
        <div style="background:var(--bg-1);border:1px solid var(--border);border-radius:20px;width:560px;max-width:94vw;padding:24px;animation:slideDown 0.25s cubic-bezier(0.34,1.56,0.64,1);position:relative;">
            <button onclick="document.getElementById('post-modal-overlay').remove()" style="position:absolute;top:14px;right:14px;width:32px;height:32px;background:var(--bg-2);border:none;border-radius:50%;color:var(--text-2);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;">✕</button>
            ${carouselHtml}
            ${post.title ? `<h2 style="font-size:1.2rem;font-weight:800;color:var(--text-0);margin-bottom:10px;line-height:1.3;">${escapeHtml(post.title)}</h2>` : ''}
            <p style="font-size:0.9rem;color:var(--text-1);line-height:1.7;white-space:pre-wrap;margin-bottom:14px;">${escapeHtml(plainContent)}</p>
            ${tagsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;">${tagsHtml}</div>` : ''}
            <div style="font-size:0.75rem;color:var(--text-3);">${timeAgo}</div>
        </div>`;

    // 캐러셀 상태
    window._modalCarouselIdx = 0;
    window._modalCarouselImgs = imgs;
}

window.modalCarousel = function(dir) {
    const imgs = window._modalCarouselImgs || [];
    if (imgs.length < 2) return;
    window._modalCarouselIdx = (window._modalCarouselIdx + dir + imgs.length) % imgs.length;
    const slides = document.querySelectorAll('#modal-carousel-slides img');
    slides.forEach((s, i) => s.style.display = i === window._modalCarouselIdx ? 'block' : 'none');
    const counter = document.getElementById('modal-carousel-counter');
    if (counter) counter.textContent = `${window._modalCarouselIdx + 1}/${imgs.length}`;
};

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

function showToast(msg) {
    let t = document.querySelector('.ug-toast');
    if (!t) {
        t = document.createElement('div');
        t.className = 'ug-toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.classList.remove('show'); }, 2500);
}

/* ─── 유저 가입 팸 (가로 스크롤) ─── */
async function loadUserPams(userId) {
    const { data: memberships } = await supabase
        .from('pam_members')
        .select('pam_id')
        .eq('user_id', userId);

    const pamSection = document.getElementById('profile-pams-section');
    const pamList = document.getElementById('profile-pams-list');
    if (!pamSection || !pamList) return;

    if (!memberships || memberships.length === 0) {
        pamSection.style.display = 'none';
        return;
    }

    const pamIds = memberships.map(m => m.pam_id);
    const { data: pams } = await supabase
        .from('pams')
        .select('id, name, image_url, member_count, region')
        .in('id', pamIds);

    if (!pams || pams.length === 0) { pamSection.style.display = 'none'; return; }

    pamSection.style.display = 'block';
    pamList.innerHTML = '';
    pams.forEach(pam => {
        const item = document.createElement('div');
        item.className = 'profile-pam-card';
        const img = pam.image_url || '';
        item.innerHTML = `
            <div class="profile-pam-img">
                ${img ? `<img src="${img}" alt="${escapeHtml(pam.name)}">` :
                  '<span class="material-symbols-rounded" style="font-size:24px;color:var(--text-3)">groups</span>'}
            </div>
            <div class="profile-pam-name">${escapeHtml(pam.name)}</div>
            <div class="profile-pam-members">${pam.member_count || 1}명</div>`;
        pamList.appendChild(item);
    });
}
