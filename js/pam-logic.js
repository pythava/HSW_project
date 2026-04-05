/* js/pam-logic.js — 팸 목록 페이지 로직 */

let _me = null;
let _myProfile = null;
let _allPams = [];
let _currentTab = 'all';
let _filters = { region: '', age: '', gender: '' };
let _searchQuery = '';
let _currentPamId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = './login.html'; return; }
    _me = user;

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    _myProfile = profile;

    // 토큰 표시
    await loadMyToken();

    // 팸 목록 로드
    await loadPams();

    // 인기 팸 사이드
    await loadTrendingPams();

    // 알림/메시지 뱃지
    checkNotiBadge(user.id);
    checkMsgBadge(user.id);

    bindEvents();
});

/* ─── 토큰 ─── */
async function loadMyToken() {
    const { data } = await supabase.from('user_tokens').select('amount').eq('user_id', _me.id).single();
    const amount = data?.amount ?? 0;
    document.getElementById('my-token-count').textContent = amount;
    document.getElementById('token-card').style.display = 'flex';
}

/* ─── 팸 목록 ─── */
async function loadPams() {
    const grid = document.getElementById('pam-grid');
    grid.innerHTML = '<div class="pam-loader"><span class="material-symbols-rounded animation-spin">local_florist</span><span>팸을 불러오는 중...</span></div>';

    let query = supabase.from('pams').select('*, profiles(id, username, avatar_url)').order('member_count', { ascending: false });

    const { data: pams, error } = await query;
    if (error) { grid.innerHTML = '<div class="pam-empty">팸을 불러오지 못했어요.</div>'; return; }

    _allPams = pams || [];
    renderPams();
}

function renderPams() {
    const grid = document.getElementById('pam-grid');
    let list = [..._allPams];

    // 탭 필터
    if (_currentTab === 'mypam') {
        // 내가 멤버인 팸
        list = list.filter(p => p.creator_id === _me.id || (p.members || []).includes(_me.id));
    } else if (_currentTab === 'hot') {
        list = list.sort((a, b) => (b.member_count || 0) - (a.member_count || 0)).slice(0, 20);
    }

    // 검색
    if (_searchQuery) {
        const q = _searchQuery.toLowerCase();
        list = list.filter(p =>
            p.name?.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q) ||
            p.region?.toLowerCase().includes(q)
        );
    }

    // 필터
    if (_filters.region) list = list.filter(p => p.region === _filters.region);
    if (_filters.age) list = list.filter(p => !p.age_group || p.age_group === _filters.age);
    if (_filters.gender) list = list.filter(p => !p.gender || p.gender === _filters.gender);

    grid.innerHTML = '';
    if (list.length === 0) {
        grid.innerHTML = '<div class="pam-empty"><span class="material-symbols-rounded" style="font-size:48px;color:var(--text-3);display:block;margin-bottom:12px;">local_florist</span>조건에 맞는 팸이 없어요</div>';
        return;
    }

    list.forEach(pam => {
        const card = createPamCard(pam);
        grid.appendChild(card);
    });
}

function createPamCard(pam) {
    const li = document.createElement('div');
    li.className = 'pam-card';

    const badges = [pam.region, pam.age_group, pam.gender].filter(Boolean).map(b => `<span class="pam-badge">${b}</span>`).join('');
    const imgHtml = pam.image_url
        ? `<img src="${pam.image_url}" alt="${pam.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
        : '';

    li.innerHTML = `
        <div class="pam-card-img-wrap">
            ${imgHtml}
            <div class="pam-card-img-placeholder" style="${pam.image_url ? 'display:none' : ''}">
                <span class="material-symbols-rounded">groups</span>
            </div>
            <div class="pam-card-overlay"></div>
            <div class="pam-card-badges">${badges}</div>
        </div>
        <div class="pam-card-body">
            <div class="pam-card-name">${escapeHtml(pam.name)}</div>
            <div class="pam-card-desc">${escapeHtml(pam.description || '설명이 없어요')}</div>
            <div class="pam-card-footer">
                <span class="pam-card-members">
                    <span class="material-symbols-rounded">group</span>${pam.member_count || 1}명
                </span>
                ${pam.has_password ? '<span class="pam-card-lock"><span class="material-symbols-rounded">lock</span></span>' : ''}
            </div>
        </div>
    `;
    li.addEventListener('click', () => openPamModal(pam));
    return li;
}

/* ─── 팸 상세 모달 ─── */
async function openPamModal(pam) {
    _currentPamId = pam.id;

    const modal = document.getElementById('pam-modal');
    modal.style.display = 'flex';

    // 이미지
    const modalImg = document.getElementById('modal-img');
    if (pam.image_url) { modalImg.src = pam.image_url; modalImg.style.display = 'block'; }
    else { modalImg.style.display = 'none'; }

    // 뱃지
    document.getElementById('modal-region-badge').textContent = pam.region || '';
    document.getElementById('modal-region-badge').style.display = pam.region ? 'inline' : 'none';
    document.getElementById('modal-age-badge').textContent = pam.age_group || '';
    document.getElementById('modal-age-badge').style.display = pam.age_group ? 'inline' : 'none';
    document.getElementById('modal-gender-badge').textContent = pam.gender || '';
    document.getElementById('modal-gender-badge').style.display = pam.gender ? 'inline' : 'none';

    document.getElementById('modal-name').textContent = pam.name;
    document.getElementById('modal-members').textContent = pam.member_count || 1;
    document.getElementById('modal-desc').textContent = pam.description || '설명이 없어요.';

    // 잠금
    const lockBadge = document.getElementById('modal-lock-badge');
    const pwSection = document.getElementById('modal-pw-section');
    if (pam.has_password) {
        lockBadge.style.display = 'flex';
        pwSection.style.display = 'block';
        document.getElementById('modal-pw-input').value = '';
    } else {
        lockBadge.style.display = 'none';
        pwSection.style.display = 'none';
    }

    // 방장 정보
    const creator = pam.profiles;
    const hostAvatar = creator?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${pam.creator_id}`;
    document.getElementById('modal-host-avatar').src = hostAvatar;
    document.getElementById('modal-host-name').textContent = creator?.username || '알 수 없음';

    // 이미 참여 중인지
    const { data: membership } = await supabase
        .from('pam_members')
        .select('id')
        .eq('pam_id', pam.id)
        .eq('user_id', _me.id)
        .single();

    const joinBtn = document.getElementById('pam-join-btn');
    joinBtn.onclick = null;
    if (pam.creator_id === _me.id) {
        joinBtn.innerHTML = '<span class="material-symbols-rounded">star</span> 내가 만든 팸';
        joinBtn.className = 'pam-join-btn joined';
    } else if (membership) {
        joinBtn.innerHTML = '<span class="material-symbols-rounded">chat</span> 메시지에서 채팅하기';
        joinBtn.className = 'pam-join-btn';
        joinBtn.onclick = () => goToPamChatRoom(pam);
    } else {
        joinBtn.innerHTML = '<span class="material-symbols-rounded">door_open</span> 팸 참여하기';
        joinBtn.className = 'pam-join-btn';
    }
}

/* ─── 팸 참여 ─── */
async function joinPam() {
    if (!_currentPamId) return;
    const pam = _allPams.find(p => p.id === _currentPamId);
    if (!pam) return;

    if (pam.has_password) {
        const pw = document.getElementById('modal-pw-input').value;
        if (!pw || pw.length !== 6) { alert('6자리 비밀번호를 입력해주세요.'); return; }
        if (pw !== pam.password) { alert('비밀번호가 틀렸어요.'); return; }
    }

    const { error } = await supabase.from('pam_members').insert({ pam_id: _currentPamId, user_id: _me.id });
    if (error) { alert('참여 실패: ' + error.message); return; }
    await supabase.from('pams').update({ member_count: (pam.member_count || 1) + 1 }).eq('id', _currentPamId);

    // ─── 팸에 연결된 채팅방이 있으면 자동 가입 ───
    if (pam.room_id) {
        // 이미 멤버인지 확인
        const { data: existing } = await supabase.from('room_members')
            .select('id').eq('room_id', pam.room_id).eq('user_id', _me.id).maybeSingle();
        if (!existing) {
            await supabase.from('room_members').insert({ room_id: pam.room_id, user_id: _me.id });
        }
    }
    // ─────────────────────────────────────────────

    const joinBtn = document.getElementById('pam-join-btn');
    joinBtn.innerHTML = '<span class="material-symbols-rounded">chat</span> 메시지에서 채팅하기';
    joinBtn.className = 'pam-join-btn';
    joinBtn.onclick = () => goToPamChatRoom(pam);

    document.getElementById('pam-modal').style.display = 'none';
    if (pam.room_id) {
        goToPamChatRoom(pam);
    }
    await loadPams();
}

/* ─── 팸 채팅방으로 이동 ─── */
function goToPamChatRoom(pam) {
    // 메시지 페이지로 이동 (room_id를 URL 파라미터로 전달)
    if (pam && pam.room_id) {
        location.href = `./messages/index.html?open_room=${pam.room_id}`;
    } else {
        location.href = './messages/index.html';
    }
}

/* ─── 인기 팸 사이드 ─── */
async function loadTrendingPams() {
    const { data: pams } = await supabase
        .from('pams')
        .select('id, name, image_url, member_count')
        .order('member_count', { ascending: false })
        .limit(5);

    const list = document.getElementById('trending-pams');
    if (!pams || pams.length === 0) { list.innerHTML = '<li style="color:var(--text-3);font-size:0.85rem;">아직 팸이 없어요</li>'; return; }

    list.innerHTML = '';
    pams.forEach(pam => {
        const li = document.createElement('li');
        const imgSrc = pam.image_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${pam.id}`;
        li.innerHTML = `
            <img src="${imgSrc}" alt="">
            <span class="trending-pam-name">${escapeHtml(pam.name)}</span>
            <span class="trending-pam-members">${pam.member_count || 1}명</span>
        `;
        li.addEventListener('click', () => {
            const full = _allPams.find(p => p.id === pam.id);
            if (full) openPamModal(full);
        });
        list.appendChild(li);
    });
}

/* ─── 알림 뱃지 ─── */
async function checkNotiBadge(userId) {
    const badge = document.getElementById('nav-noti-badge');
    if (!badge) return;
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false);
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
}

async function checkMsgBadge(userId) {
    const badge = document.getElementById('nav-msg-badge');
    if (!badge) return;

    const updateBadge = async () => {
        const { data: memberships } = await supabase.from('room_members').select('room_id, last_read_at').eq('user_id', userId);
        if (!memberships || memberships.length === 0) { badge.style.display = 'none'; return; }
        let unread = 0;
        for (const m of memberships) {
            const since = m.last_read_at || (() => {
                const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString();
            })();
            const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('room_id', m.room_id).neq('user_id', userId).gt('created_at', since);
            unread += count || 0;
        }
        badge.textContent = unread > 9 ? '9+' : unread;
        badge.style.display = unread > 0 ? 'flex' : 'none';
    };

    await updateBadge();

    // 실시간 구독 - 새 메시지 오면 즉시 뱃지 갱신
    supabase.channel('pam-page-msg-badge')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, updateBadge)
        .subscribe();
}

/* ─── 이벤트 ─── */
function bindEvents() {
    // 탭
    document.querySelectorAll('.pam-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.pam-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            _currentTab = tab.dataset.tab;
            renderPams();
        });
    });

    // 검색
    document.getElementById('pam-search').addEventListener('input', e => {
        _searchQuery = e.target.value;
        renderPams();
    });

    // 필터 드롭다운
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const group = btn.closest('.filter-group');
            const isOpen = group.classList.contains('open');
            document.querySelectorAll('.filter-group').forEach(g => g.classList.remove('open'));
            if (!isOpen) group.classList.add('open');
        });
    });

    document.querySelectorAll('.filter-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = opt.closest('.filter-dropdown');
            const group = opt.closest('.filter-group');
            const filterType = group.id.replace('filter-', '');
            const value = opt.dataset.value;

            dropdown.querySelectorAll('.filter-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');

            _filters[filterType] = value;
            const label = document.getElementById(`filter-${filterType}-label`);
            if (label) label.textContent = value || filterType === 'region' ? (value || '지역') : filterType === 'age' ? (value || '나이대') : (value || '성별');

            // 필터 활성화 표시
            const btn = group.querySelector('.filter-btn');
            if (value) btn.classList.add('active-filter');
            else btn.classList.remove('active-filter');

            group.classList.remove('open');
            renderPams();
        });
    });

    // 외부 클릭 시 드롭다운 닫기
    document.addEventListener('click', () => {
        document.querySelectorAll('.filter-group').forEach(g => g.classList.remove('open'));
    });

    // 모달 닫기
    document.getElementById('pam-modal-close').addEventListener('click', () => {
        document.getElementById('pam-modal').style.display = 'none';
    });
    document.getElementById('pam-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('pam-modal')) {
            document.getElementById('pam-modal').style.display = 'none';
        }
    });

    // 팸 참여
    document.getElementById('pam-join-btn').addEventListener('click', joinPam);

    // 팸 모달 탭
    document.querySelectorAll('.pam-modal-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            // 채팅 탭 클릭 시 메시지 페이지로 바로 이동
            if (tab.dataset.tab === 'chat' && _currentPamId) {
                const pam = _allPams.find(p => p.id === _currentPamId);
                const { data: m } = await supabase.from('pam_members').select('id').eq('pam_id', _currentPamId).eq('user_id', _me.id).maybeSingle();
                if (m) {
                    document.getElementById('pam-modal').style.display = 'none';
                    goToPamChatRoom(pam);
                } else {
                    // 참여 안 한 경우 참여 유도
                    if (confirm('채팅하려면 먼저 팸에 참여해야 해요. 지금 참여할까요?')) {
                        await joinPam();
                    }
                }
                return;
            }
            document.querySelectorAll('.pam-modal-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.pam-modal-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('pam-pane-' + tab.dataset.tab)?.classList.add('active');
        });
    });

    // 로그아웃
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        location.href = './login.html';
    });
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
