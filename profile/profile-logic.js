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

    // 통계
    document.getElementById('stat-posts').textContent = profile.post_count || 0;
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
        document.getElementById('follow-btn').style.display = 'block';
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
    card.className = 'profile-post-card';

    const timeAgo  = formatTime(new Date(post.created_at));
    const tagsHtml = (post.tags || []).slice(0, 3)
        .map(t => `<span class="ppc-tag">#${t}</span>`).join('');

    // plain text 미리보기 (마크다운 태그 제거)
    const plainContent = (post.content || '').replace(/[#*`>~_\[\]]/g, '').trim();

    card.innerHTML = `
        <div style="display:flex; gap:12px; align-items:flex-start;">
            <div style="flex:1; min-width:0;">
                ${post.title ? `<div class="ppc-title">${post.title}</div>` : ''}
                <div class="ppc-preview">${plainContent}</div>
                <div class="ppc-meta">
                    <span class="ppc-time">${timeAgo}</span>
                    <div class="ppc-tags">${tagsHtml}</div>
                </div>
            </div>
            ${post.image_url ? `<img src="${post.image_url}" class="ppc-thumb" alt="">` : ''}
        </div>
    `;

    card.addEventListener('click', () => {
        window.location.href = `../index.html?post=${post.id}`;
    });

    return card;
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
