
/* messages/msg-logic.js — 디스코드 스타일 메시지 로직 */

/* ─────────────────────────────────────────
   상태
───────────────────────────────────────── */
let _me = null;
let _myProfile = null;
let _followingList = []; // { id, username, avatar_url }
let _currentRoom = null; // { id, type: 'dm'|'room', name, ... }
let _realtimeChannel = null;
let _selectedInviteIds = new Set();
let _dmSearchQuery = '';

/* ─────────────────────────────────────────
   초기화
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = '../login.html'; return; }
    _me = user;

    // 내 프로필 로드
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
    _myProfile = profile;

    // 유저 바 업데이트
    const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
    document.getElementById('my-avatar').src = avatar;
    document.getElementById('my-username').textContent = profile?.username || user.email.split('@')[0];

    // 팔로잉 목록 로드
    await loadFollowingList();

    // DM + 채팅방 목록 로드
    await loadDmList();
    await loadRoomList();

    // 이벤트 바인딩
    bindEvents();
});

/* ─────────────────────────────────────────
   팔로잉 목록
───────────────────────────────────────── */
async function loadFollowingList() {
    const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', _me.id);

    if (!follows || follows.length === 0) { _followingList = []; return; }

    const ids = follows.map(f => f.following_id);
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', ids);

    _followingList = profiles || [];
}

/* ─────────────────────────────────────────
   DM 목록
───────────────────────────────────────── */
async function loadDmList() {
    const dmListEl = document.getElementById('dm-list');

    // message_rooms 에서 type='dm' 이고 내가 멤버인 것
    const { data: memberships } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', _me.id);

    if (!memberships || memberships.length === 0) {
        dmListEl.innerHTML = '<li class="channel-empty">아직 DM이 없어요</li>';
        return;
    }

    const roomIds = memberships.map(m => m.room_id);
    const { data: rooms } = await supabase
        .from('message_rooms')
        .select('*')
        .in('id', roomIds)
        .eq('type', 'dm')
        .order('updated_at', { ascending: false });

    if (!rooms || rooms.length === 0) {
        dmListEl.innerHTML = '<li class="channel-empty">아직 DM이 없어요</li>';
        return;
    }

    dmListEl.innerHTML = '';
    for (const room of rooms) {
        // DM 상대방 찾기
        const { data: otherMembers } = await supabase
            .from('room_members')
            .select('user_id, profiles(username, avatar_url)')
            .eq('room_id', room.id)
            .neq('user_id', _me.id);

        const other = otherMembers?.[0];
        if (!other) continue;

        const username = other.profiles?.username || '알 수 없음';
        const avatarUrl = other.profiles?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${other.user_id}`;

        const li = document.createElement('li');
        li.className = 'channel-item';
        li.dataset.roomId = room.id;
        li.dataset.roomType = 'dm';
        li.innerHTML = `
            <img src="${avatarUrl}" class="channel-avatar" alt="${username}" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${other.user_id}'">
            <span class="channel-name">${username}</span>
        `;
        li.addEventListener('click', () => openRoom(room, { name: username, avatar: avatarUrl, type: 'dm' }));
        dmListEl.appendChild(li);
    }
}

/* ─────────────────────────────────────────
   채팅방 목록
───────────────────────────────────────── */
async function loadRoomList() {
    const roomListEl = document.getElementById('room-list');

    const { data: memberships } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', _me.id);

    if (!memberships || memberships.length === 0) {
        roomListEl.innerHTML = '<li class="channel-empty">참여 중인 방이 없어요</li>';
        return;
    }

    const roomIds = memberships.map(m => m.room_id);
    const { data: rooms } = await supabase
        .from('message_rooms')
        .select('*')
        .in('id', roomIds)
        .eq('type', 'room')
        .order('updated_at', { ascending: false });

    if (!rooms || rooms.length === 0) {
        roomListEl.innerHTML = '<li class="channel-empty">참여 중인 방이 없어요</li>';
        return;
    }

    roomListEl.innerHTML = '';
    for (const room of rooms) {
        const li = document.createElement('li');
        li.className = 'channel-item';
        li.dataset.roomId = room.id;
        li.innerHTML = `
            <span class="material-symbols-rounded channel-hash">tag</span>
            <span class="channel-name">${room.name}</span>
        `;
        li.addEventListener('click', () => openRoom(room, {
            name: room.name,
            avatar: null,
            type: 'room',
            memberCount: room.member_count || 0
        }));
        roomListEl.appendChild(li);
    }
}

/* ─────────────────────────────────────────
   채팅방 열기
───────────────────────────────────────── */
async function openRoom(room, meta) {
    _currentRoom = { ...room, ...meta };

    // 활성 표시
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`[data-room-id="${room.id}"]`);
    if (activeEl) activeEl.classList.add('active');

    // UI 전환
    document.getElementById('chat-welcome').style.display = 'none';
    const chatRoom = document.getElementById('chat-room');
    chatRoom.style.display = 'flex';

    // 헤더 업데이트
    const avatarEl = document.getElementById('chat-room-avatar');
    if (meta.avatar) {
        avatarEl.src = meta.avatar;
        avatarEl.style.display = 'block';
    } else {
        avatarEl.style.display = 'none';
    }

    document.getElementById('chat-room-name').textContent =
        meta.type === 'dm' ? meta.name : `# ${meta.name}`;
    document.getElementById('chat-room-sub').textContent =
        meta.type === 'dm' ? '다이렉트 메시지' : `채팅방 · ${meta.memberCount || '?'}명`;

    // input placeholder
    document.getElementById('msg-input').placeholder =
        meta.type === 'dm' ? `${meta.name}에게 메시지 보내기` : `#${meta.name}에 메시지 보내기`;

    // 멤버 패널 닫기
    document.getElementById('members-panel').style.display = 'none';

    // 메시지 로드
    await loadMessages(room.id);

    // 실시간 구독
    subscribeToRoom(room.id);

    // 멤버 로드 (백그라운드)
    loadMembers(room.id);
}

/* ─────────────────────────────────────────
   메시지 로드
───────────────────────────────────────── */
async function loadMessages(roomId) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="messages-loader"><span class="material-symbols-rounded animation-spin">sync</span></div>';

    const { data: messages, error } = await supabase
        .from('messages')
        .select('*, profiles(id, username, avatar_url)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(100);

    container.innerHTML = '';

    if (!messages || messages.length === 0) {
        renderChatStartNotice(container);
        return;
    }

    renderChatStartNotice(container);
    renderMessages(container, messages);
    container.scrollTop = container.scrollHeight;
}

function renderChatStartNotice(container) {
    if (!_currentRoom) return;
    const notice = document.createElement('div');
    notice.className = 'chat-start-notice';

    if (_currentRoom.type === 'dm' && _currentRoom.avatar) {
        notice.innerHTML = `
            <img src="${_currentRoom.avatar}" class="start-avatar" onerror="this.style.display='none'">
            <h3>${_currentRoom.name}</h3>
            <p>${_currentRoom.name}님과의 다이렉트 메시지 시작입니다.</p>
        `;
    } else {
        notice.innerHTML = `
            <h3># ${_currentRoom.name}</h3>
            <p>${_currentRoom.name} 채팅방의 시작입니다.</p>
        `;
    }
    container.appendChild(notice);
}

function renderMessages(container, messages) {
    let prevUserId = null;
    let prevDate = null;

    messages.forEach((msg, i) => {
        const msgDate = new Date(msg.created_at);
        const dateStr = formatDate(msgDate);

        // 날짜 구분선
        if (dateStr !== prevDate) {
            const divider = document.createElement('div');
            divider.className = 'msg-date-divider';
            divider.textContent = dateStr;
            container.appendChild(divider);
            prevDate = dateStr;
            prevUserId = null; // 날짜 바뀌면 그룹 리셋
        }

        const isContinuation = msg.user_id === prevUserId;
        const profile = msg.profiles;
        const username = profile?.username || '알 수 없음';
        const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${msg.user_id}`;
        const timeStr = formatTime(msgDate);

        if (isContinuation) {
            const el = document.createElement('div');
            el.className = 'msg-continuation';
            el.innerHTML = `
                <span class="msg-time-stub">${timeStr}</span>
                <span class="msg-text">${escapeHtml(msg.content)}</span>
            `;
            container.appendChild(el);
        } else {
            const el = document.createElement('div');
            el.className = 'msg-group';
            el.innerHTML = `
                <img src="${avatar}" class="msg-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${msg.user_id}'">
                <div class="msg-group-content">
                    <div class="msg-group-header">
                        <span class="msg-author">${escapeHtml(username)}</span>
                        <span class="msg-timestamp">${timeStr}</span>
                    </div>
                    <span class="msg-text">${escapeHtml(msg.content)}</span>
                </div>
            `;
            container.appendChild(el);
        }

        prevUserId = msg.user_id;
    });
}

/* ─────────────────────────────────────────
   실시간 구독
───────────────────────────────────────── */
function subscribeToRoom(roomId) {
    if (_realtimeChannel) {
        supabase.removeChannel(_realtimeChannel);
        _realtimeChannel = null;
    }

    _realtimeChannel = supabase
        .channel(`room-${roomId}-${Date.now()}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `room_id=eq.${roomId}`
        }, async (payload) => {
            const msg = payload.new;
            // 내가 보낸 메시지는 이미 화면에 있으니 스킵
            if (msg.user_id === _me.id) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .eq('id', msg.user_id)
                .single();

            msg.profiles = profile;
            appendNewMessage(msg);
        })
        .subscribe((status) => {
            console.log('realtime status:', status);
        });
}

function appendNewMessage(msg) {
    const container = document.getElementById('chat-messages');
    const profile = msg.profiles;
    const username = profile?.username || '알 수 없음';
    const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${msg.user_id}`;
    const timeStr = formatTime(new Date(msg.created_at));

    // 마지막 메시지 그룹이 같은 유저인지 확인
    const lastGroup = container.querySelector('.msg-group:last-of-type');
    const isContinuation = lastGroup && lastGroup.dataset.userId === msg.user_id;

    let el;
    if (isContinuation) {
        el = document.createElement('div');
        el.className = 'msg-continuation';
        el.dataset.userId = msg.user_id;
        el.innerHTML = `
            <span class="msg-time-stub">${timeStr}</span>
            <span class="msg-text">${escapeHtml(msg.content)}</span>
        `;
    } else {
        el = document.createElement('div');
        el.className = 'msg-group';
        el.dataset.userId = msg.user_id;
        el.innerHTML = `
            <img src="${avatar}" class="msg-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${msg.user_id}'">
            <div class="msg-group-content">
                <div class="msg-group-header">
                    <span class="msg-author">${escapeHtml(username)}</span>
                    <span class="msg-timestamp">${timeStr}</span>
                </div>
                <span class="msg-text">${escapeHtml(msg.content)}</span>
            </div>
        `;
    }

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}

/* ─────────────────────────────────────────
   메시지 전송
───────────────────────────────────────── */
async function sendMessage() {
    if (!_currentRoom) return;
    const input = document.getElementById('msg-input');
    const content = input.value.trim();
    if (!content) return;

    input.value = '';
    input.style.height = 'auto';

    // 내 메시지 즉시 화면에 표시
    const fakeMsg = {
        id: 'temp_' + Date.now(),
        room_id: _currentRoom.id,
        user_id: _me.id,
        content,
        created_at: new Date().toISOString(),
        profiles: {
            id: _me.id,
            username: _myProfile?.username || _me.email.split('@')[0],
            avatar_url: _myProfile?.avatar_url
        }
    };
    appendNewMessage(fakeMsg);

    const { error } = await supabase
        .from('messages')
        .insert({
            room_id: _currentRoom.id,
            user_id: _me.id,
            content
        });

    if (error) console.error('메시지 전송 실패:', error);

    await supabase
        .from('message_rooms')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', _currentRoom.id);
}
/* ─────────────────────────────────────────
   멤버 패널
───────────────────────────────────────── */
async function loadMembers(roomId) {
    const { data: members } = await supabase
        .from('room_members')
        .select('user_id, profiles(username, avatar_url)')
        .eq('room_id', roomId);

    const membersList = document.getElementById('members-list');
    membersList.innerHTML = '';

    (members || []).forEach(m => {
        const profile = m.profiles;
        const username = profile?.username || '알 수 없음';
        const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${m.user_id}`;
        const isMe = m.user_id === _me.id;

        const li = document.createElement('li');
        li.className = 'member-item';
        li.innerHTML = `
            <img src="${avatar}" class="member-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${m.user_id}'">
            <span class="member-name">${escapeHtml(username)}${isMe ? ' (나)' : ''}</span>
        `;
        membersList.appendChild(li);
    });
}

/* ─────────────────────────────────────────
   방 만들기 모달
───────────────────────────────────────── */
function openCreateRoomModal() {
    _selectedInviteIds.clear();
    document.getElementById('room-name-input').value = '';
    document.getElementById('invite-search').value = '';
    document.getElementById('selected-members').innerHTML = '';
    renderInviteList('');
    document.getElementById('create-room-modal').style.display = 'flex';
}

function renderInviteList(query) {
    const list = document.getElementById('invite-list');
    const filtered = _followingList.filter(u =>
        u.username.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
        list.innerHTML = '<li class="channel-empty">팔로우한 사람이 없어요</li>';
        return;
    }

    list.innerHTML = '';
    filtered.forEach(user => {
        const avatar = user.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
        const isSelected = _selectedInviteIds.has(user.id);
        const li = document.createElement('li');
        li.className = `invite-item${isSelected ? ' selected' : ''}`;
        li.innerHTML = `
            <img src="${avatar}" class="invite-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}'">
            <span class="invite-username">${escapeHtml(user.username)}</span>
            ${isSelected ? '<span class="material-symbols-rounded invite-check">check_circle</span>' : ''}
        `;
        li.addEventListener('click', () => toggleInvite(user, 'room'));
        list.appendChild(li);
    });
}

function toggleInvite(user, modalType) {
    if (_selectedInviteIds.has(user.id)) {
        _selectedInviteIds.delete(user.id);
    } else {
        _selectedInviteIds.add(user.id);
    }
    if (modalType === 'room') {
        renderInviteList(document.getElementById('invite-search').value);
        renderSelectedTags();
    }
}

function renderSelectedTags() {
    const container = document.getElementById('selected-members');
    container.innerHTML = '';
    _selectedInviteIds.forEach(id => {
        const user = _followingList.find(u => u.id === id);
        if (!user) return;
        const avatar = user.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${id}`;
        const tag = document.createElement('div');
        tag.className = 'selected-tag';
        tag.innerHTML = `
            <img src="${avatar}">
            <span>${escapeHtml(user.username)}</span>
            <button data-id="${id}"><span class="material-symbols-rounded" style="font-size:16px;">close</span></button>
        `;
        tag.querySelector('button').addEventListener('click', () => {
            _selectedInviteIds.delete(id);
            renderInviteList(document.getElementById('invite-search').value);
            renderSelectedTags();
        });
        container.appendChild(tag);
    });
}

async function createRoom() {
    const name = document.getElementById('room-name-input').value.trim();
    if (!name) { alert('방 이름을 입력해주세요'); return; }

    const memberIds = [..._selectedInviteIds, _me.id];

    // 방 생성
    const { data: room, error } = await supabase
        .from('message_rooms')
        .insert({ name, type: 'room', created_by: _me.id, member_count: memberIds.length })
        .select()
        .single();

    if (error || !room) { console.error(error); alert('방 만들기 실패'); return; }

    // 멤버 추가
    const memberInserts = memberIds.map(uid => ({ room_id: room.id, user_id: uid }));
    await supabase.from('room_members').insert(memberInserts);

    document.getElementById('create-room-modal').style.display = 'none';
    await loadRoomList();
    openRoom(room, { name: room.name, avatar: null, type: 'room', memberCount: memberIds.length });
}

/* ─────────────────────────────────────────
   DM 시작 모달
───────────────────────────────────────── */
function openNewDmModal() {
    document.getElementById('dm-user-search').value = '';
    renderDmUserList('');
    document.getElementById('new-dm-modal').style.display = 'flex';
}

function renderDmUserList(query) {
    const list = document.getElementById('dm-user-list');
    const filtered = _followingList.filter(u =>
        u.username.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
        list.innerHTML = '<li class="channel-empty">팔로우한 사람이 없어요</li>';
        return;
    }

    list.innerHTML = '';
    filtered.forEach(user => {
        const avatar = user.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
        const li = document.createElement('li');
        li.className = 'invite-item';
        li.innerHTML = `
            <img src="${avatar}" class="invite-avatar">
            <span class="invite-username">${escapeHtml(user.username)}</span>
        `;
        li.addEventListener('click', () => startDm(user));
        list.appendChild(li);
    });
}

async function startDm(user) {
    document.getElementById('new-dm-modal').style.display = 'none';

    // 기존 DM 방 확인
    const { data: myRooms } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', _me.id);

    const { data: theirRooms } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', user.id);

    const myIds = new Set((myRooms || []).map(r => r.room_id));
    const commonIds = (theirRooms || []).filter(r => myIds.has(r.room_id)).map(r => r.room_id);

    let existingRoom = null;
    if (commonIds.length > 0) {
        const { data: dmRooms } = await supabase
            .from('message_rooms')
            .select('*')
            .in('id', commonIds)
            .eq('type', 'dm')
            .limit(1);
        existingRoom = dmRooms?.[0];
    }

    if (existingRoom) {
        const avatar = user.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
        openRoom(existingRoom, { name: user.username, avatar, type: 'dm' });
        return;
    }

    // 새 DM 방 생성
    const { data: newRoom, error } = await supabase
        .from('message_rooms')
        .insert({ name: `dm_${_me.id}_${user.id}`, type: 'dm', created_by: _me.id, member_count: 2 })
        .select()
        .single();

    if (error || !newRoom) { console.error(error); return; }

    await supabase.from('room_members').insert([
        { room_id: newRoom.id, user_id: _me.id },
        { room_id: newRoom.id, user_id: user.id }
    ]);

    await loadDmList();
    const avatar = user.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
    openRoom(newRoom, { name: user.username, avatar, type: 'dm' });
}

/* ─────────────────────────────────────────
   DM 검색 필터
───────────────────────────────────────── */
function filterSidebar(query) {
    const items = document.querySelectorAll('.channel-item');
    items.forEach(item => {
        const name = item.querySelector('.channel-name')?.textContent?.toLowerCase() || '';
        item.style.display = name.includes(query.toLowerCase()) ? '' : 'none';
    });
}

/* ─────────────────────────────────────────
   이벤트 바인딩
───────────────────────────────────────── */
function bindEvents() {
    // 새 방 만들기
    document.getElementById('new-room-btn').addEventListener('click', openCreateRoomModal);
    document.getElementById('new-room-btn-2').addEventListener('click', openCreateRoomModal);

    // 방 모달
    document.getElementById('close-room-modal').addEventListener('click', () => {
        document.getElementById('create-room-modal').style.display = 'none';
    });
    document.getElementById('cancel-room-modal').addEventListener('click', () => {
        document.getElementById('create-room-modal').style.display = 'none';
    });
    document.getElementById('confirm-create-room').addEventListener('click', createRoom);

    document.getElementById('invite-search').addEventListener('input', e => {
        renderInviteList(e.target.value);
    });

    // DM 모달
    document.getElementById('start-chat-btn').addEventListener('click', openNewDmModal);
    document.getElementById('close-dm-modal').addEventListener('click', () => {
        document.getElementById('new-dm-modal').style.display = 'none';
    });
    document.getElementById('dm-user-search').addEventListener('input', e => {
        renderDmUserList(e.target.value);
    });

    // 모달 외부 클릭 닫기
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.style.display = 'none';
        });
    });

    // 전송
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 자동 높이 조절
    document.getElementById('msg-input').addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 160) + 'px';
    });

    // 멤버 패널 토글
    document.getElementById('members-btn').addEventListener('click', () => {
        const panel = document.getElementById('members-panel');
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
        panel.style.flexDirection = 'column';
    });

    // 사이드바 검색
    document.getElementById('dm-search').addEventListener('input', e => {
        filterSidebar(e.target.value);
    });

    // 로그아웃
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        location.href = '../login.html';
    });
}

/* ─────────────────────────────────────────
   유틸
───────────────────────────────────────── */
function escapeHtml(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatTime(date) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return '오늘';
    if (date.toDateString() === yesterday.toDateString()) return '어제';
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}
