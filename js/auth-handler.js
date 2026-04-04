/* js/auth-handler.js */
async function checkUserStatus() {
    const authSection = document.getElementById('auth-section');
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        const user = session.user;
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        const username = profile?.username || user.email.split('@')[0];
        const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;

        authSection.innerHTML = `
            <div class="user-profile-card">
                <div class="user-profile-row">
                    <img src="${avatar}" class="user-profile-avatar">
                    <div class="user-profile-info">
                        <div class="user-profile-name">${username}</div>
                        <div class="user-profile-role">Deep Web Resident</div>
                    </div>
                </div>
                <a href="/profile/index.html?id=${user.id}" class="btn-my-profile">내 프로필</a>
            </div>
        `;
    } else {
        authSection.innerHTML = `
            <div class="auth-prompt">
                <h3 style="margin-bottom:10px;">가든에 입장하세요</h3>
                <p style="font-size:0.85rem;color:var(--text-2);margin-bottom:20px;">더 많은 기능을 이용하려면 로그인이 필요합니다.</p>
                <a href="/login.html" class="write-link" style="display:flex;justify-content:center;align-items:center;padding:12px;border-radius:12px;background:var(--primary);color:white;font-weight:700;">로그인 / 시작하기</a>
            </div>
        `;
    }
}

document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
});

checkUserStatus();

// 경고 알림 체크
async function checkWarnings() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: warnings } = await supabase
        .from('warnings')
        .select('id, message, created_at')
        .eq('user_id', session.user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: true });

    if (!warnings?.length) return;

    for (const w of warnings) {
        await showAdminWarning(w.message, w.created_at);
        await supabase.from('warnings').update({ is_read: true }).eq('id', w.id);
    }
}

function showAdminWarning(message, createdAt) {
    return new Promise(resolve => {
        const date = createdAt
            ? new Date(createdAt).toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
            : '';

        const overlay = document.createElement('div');
        overlay.className = 'ug-alert-overlay';
        overlay.innerHTML = `
            <div class="ug-alert-box admin-warning-box">
                <div class="admin-warning-header">
                    <div class="admin-warning-icon-wrap">
                        <span class="admin-warning-icon">⚠️</span>
                    </div>
                    <div class="admin-warning-badge">관리자 공식 경고</div>
                </div>
                <div class="admin-warning-body">
                    <p class="admin-warning-message">${message.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</p>
                    ${date ? `<p class="admin-warning-date">발송 시각: ${date}</p>` : ''}
                </div>
                <div class="admin-warning-footer">
                    <p class="admin-warning-notice">
                        이 경고는 UnderGarden 운영 정책 위반으로 인해 발송되었습니다.<br>
                        반복 위반 시 서비스 이용이 제한될 수 있습니다.
                    </p>
                    <button class="ug-alert-btn primary admin-warning-confirm">확인했습니다</button>
                </div>
            </div>`;

        overlay.querySelector('.admin-warning-confirm').onclick = () => {
            overlay.style.animation = 'ugFadeIn 0.15s ease reverse';
            setTimeout(() => { overlay.remove(); resolve(); }, 140);
        };
        document.body.appendChild(overlay);
    });
}

checkWarnings();
