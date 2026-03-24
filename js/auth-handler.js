/* js/auth-handler.js */
async function checkUserStatus() {
    const authSection = document.getElementById('auth-section');
    const { data: { session }, error } = await supabase.auth.getSession();

    if (session) {
        const user = session.user;
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        const username = profile?.username || user.email.split('@')[0];
        const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;

        authSection.innerHTML = `
            <div class="user-profile-card">
                <img src="${avatar}" style="width:60px; height:60px; border-radius:50%; margin-bottom:10px; border:2px solid var(--primary);">
                <div style="font-weight:800; font-size:1.1rem;">${username}</div>
                <div style="color:var(--text-3); font-size:0.85rem; margin-bottom:15px;">Deep Web Resident</div>
                <a href="/profile/index.html?id=${user.id}" class="btn-primary" style="display:block; padding:8px; font-size:0.9rem; border-radius:8px; background:var(--bg-0); border:1px solid var(--border); text-align:center;">내 프로필</a>
            </div>
        `;
    } else {
        const loginUrl = '/login.html';

        authSection.innerHTML = `
            <div class="auth-prompt">
                <h3 style="margin-bottom:10px;">가든에 입장하세요</h3>
                <p style="font-size:0.85rem; color:var(--text-2); margin-bottom:20px;">더 많은 기능을 이용하려면 로그인이 필요합니다.</p>
                <a href="${loginUrl}" class="write-link" style="display:flex; justify-content:center; align-items:center; padding:12px; border-radius:12px; background:var(--primary); color:white; font-weight:700;">로그인 / 시작하기</a>
            </div>
        `;
    }
}

document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
});

checkUserStatus();
