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
