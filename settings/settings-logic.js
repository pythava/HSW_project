/* settings/settings-logic.js */

let _me = null;
let _myProfile = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = '../login.html'; return; }
    _me = user;

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    _myProfile = profile || {};

    // UI 초기화
    document.getElementById('current-username').textContent  = profile?.username || '없음';
    document.getElementById('current-description').textContent = profile?.description || '없음';
    document.getElementById('current-email').textContent     = user.email || '';

    // 공개/비공개 토글 초기화
    const isPrivate = profile?.is_private || false;
    const privacyToggle = document.getElementById('privacy-toggle');
    privacyToggle.checked = isPrivate;
    updatePrivacySub(isPrivate);

    // 우측 프로필 카드
    renderProfileCard(profile, user);

    // 알림 설정 로드
    loadNotiSettings(profile);

    // 이벤트 바인딩
    bindEvents(user, profile);
});

function renderProfileCard(profile, user) {
    const card = document.getElementById('settings-profile-card');
    const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
    const username = profile?.username || user.email?.split('@')[0] || '알 수 없음';
    card.innerHTML = `
        <div class="spc-inner">
            <img src="${avatar}" class="spc-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}'">
            <div class="spc-name">@${escHtml(username)}</div>
            <div class="spc-email">${escHtml(user.email || '')}</div>
            <a href="../profile/index.html?id=${user.id}" class="spc-link">
                <span class="material-symbols-rounded">open_in_new</span>내 프로필 보기
            </a>
        </div>`;
}

function updatePrivacySub(isPrivate) {
    const sub = document.getElementById('privacy-sub');
    if (sub) sub.textContent = isPrivate ? '비공개 계정' : '공개 계정';
}

function loadNotiSettings(profile) {
    const settings = profile?.notification_settings || {};
    document.getElementById('noti-follow').checked  = settings.follow  !== false;
    document.getElementById('noti-like').checked    = settings.like    !== false;
    document.getElementById('noti-comment').checked = settings.comment !== false;
}

function bindEvents(user, profile) {
    // 모달 열기
    document.getElementById('open-username-modal').addEventListener('click', () => {
        document.getElementById('new-username-input').value = _myProfile?.username || '';
        openModal('username-modal');
    });
    document.getElementById('open-desc-modal').addEventListener('click', () => {
        const val = _myProfile?.description || '';
        document.getElementById('new-desc-input').value = val;
        document.getElementById('desc-char-count').textContent = val.length;
        openModal('desc-modal');
    });

    // 모달 닫기 버튼
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.ug-settings-modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
    });

    // 소개글 글자수
    document.getElementById('new-desc-input').addEventListener('input', function() {
        document.getElementById('desc-char-count').textContent = this.value.length;
    });

    // 닉네임 저장
    document.getElementById('save-username-btn').addEventListener('click', saveUsername);

    // 소개글 저장
    document.getElementById('save-desc-btn').addEventListener('click', saveDescription);

    // 공개/비공개 토글
    document.getElementById('privacy-toggle').addEventListener('change', async function() {
        const isPrivate = this.checked;
        updatePrivacySub(isPrivate);
        await supabase.from('profiles').update({ is_private: isPrivate }).eq('id', user.id);
        showToast(isPrivate ? '비공개 계정으로 변경됐어요.' : '공개 계정으로 변경됐어요.');
    });

    // 알림 설정 토글
    ['follow', 'like', 'comment'].forEach(type => {
        document.getElementById(`noti-${type}`).addEventListener('change', async function() {
            const current = _myProfile?.notification_settings || {};
            current[type] = this.checked;
            await supabase.from('profiles').update({ notification_settings: current }).eq('id', user.id);
            _myProfile.notification_settings = current;
            showToast(`${type === 'follow' ? '팔로우' : type === 'like' ? '좋아요' : '댓글'} 알림이 ${this.checked ? '켜졌어요' : '꺼졌어요'}.`);
        });
    });

    // 비밀번호 재설정
    document.getElementById('reset-password-btn').addEventListener('click', async () => {
        const ok = await ugConfirm(`${user.email}으로\n비밀번호 재설정 링크를 발송할까요?`, {
            title: '비밀번호 변경', icon: 'help', confirmText: '발송'
        });
        if (!ok) return;
        const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
            redirectTo: window.location.origin + '/settings/index.html'
        });
        if (error) await ugAlert('발송 실패: ' + error.message, { icon: 'error', title: '오류' });
        else await ugAlert('재설정 링크가 이메일로 발송됐어요!', { icon: 'success', title: '발송 완료' });
    });

    // 로그아웃
    document.getElementById('settings-logout-btn').addEventListener('click', async () => {
        const ok = await ugConfirm('로그아웃 할까요?', { title: '로그아웃', icon: 'help', confirmText: '로그아웃' });
        if (!ok) return;
        await supabase.auth.signOut();
        location.href = '../login.html';
    });
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        location.href = '../login.html';
    });

    // 계정 삭제
    document.getElementById('delete-account-btn').addEventListener('click', async () => {
        const ok1 = await ugConfirm(
            '계정을 삭제하면 모든 게시물, 팔로우, 채팅 내역이 영구 삭제됩니다.\n정말 탈퇴하시겠어요?',
            { title: '계정 삭제', icon: 'delete', confirmText: '탈퇴하기', cancelText: '취소', danger: true }
        );
        if (!ok1) return;
        const ok2 = await ugConfirm(
            '이 작업은 되돌릴 수 없습니다.\n마지막으로 확인합니다.',
            { title: '정말 삭제할까요?', icon: 'error', confirmText: '네, 삭제합니다', cancelText: '취소', danger: true }
        );
        if (!ok2) return;
        // 게시물, 팔로우 등 삭제
        await supabase.from('posts').delete().eq('user_id', user.id);
        await supabase.from('follows').delete().or(`follower_id.eq.${user.id},following_id.eq.${user.id}`);
        await supabase.from('likes').delete().eq('user_id', user.id);
        await supabase.from('comments').delete().eq('user_id', user.id);
        await supabase.from('profiles').delete().eq('id', user.id);
        await supabase.auth.signOut();
        await ugAlert('계정이 삭제됐어요. 그동안 이용해 주셔서 감사합니다.', { icon: 'info', title: '탈퇴 완료' });
        location.href = '../login.html';
    });
}

async function saveUsername() {
    const val = document.getElementById('new-username-input').value.trim();
    if (!val) { await ugAlert('닉네임을 입력해주세요.', { icon: 'warning', title: '입력 필요' }); return; }
    if (val.length < 2) { await ugAlert('닉네임은 2자 이상이어야 해요.', { icon: 'warning' }); return; }

    const btn = document.getElementById('save-username-btn');
    btn.disabled = true; btn.textContent = '저장 중...';
    const { error } = await supabase.from('profiles').update({ username: val }).eq('id', _me.id);
    btn.disabled = false; btn.textContent = '저장';
    if (error) { await ugAlert('저장 실패: ' + error.message, { icon: 'error', title: '오류' }); return; }
    _myProfile.username = val;
    document.getElementById('current-username').textContent = val;
    closeModal('username-modal');
    showToast('닉네임이 변경됐어요!');
}

async function saveDescription() {
    const val = document.getElementById('new-desc-input').value.trim();
    const btn = document.getElementById('save-desc-btn');
    btn.disabled = true; btn.textContent = '저장 중...';
    const { error } = await supabase.from('profiles').update({ description: val }).eq('id', _me.id);
    btn.disabled = false; btn.textContent = '저장';
    if (error) { await ugAlert('저장 실패: ' + error.message, { icon: 'error', title: '오류' }); return; }
    _myProfile.description = val;
    document.getElementById('current-description').textContent = val || '없음';
    closeModal('desc-modal');
    showToast('소개글이 변경됐어요!');
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showToast(msg) {
    let t = document.querySelector('.ug-toast');
    if (!t) { t = document.createElement('div'); t.className = 'ug-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}
