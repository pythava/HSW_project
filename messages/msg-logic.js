/* messages/msg-logic.js — 디스코드 서버+채널 구조 v2 */

/* ─────────────────────────────────────────
   상태
───────────────────────────────────────── */
let _me = null;
let _myProfile = null;
let _followingList = [];
let _currentRoom = null;     // 현재 선택된 방 { id, type, name, ... }
let _currentChannel = null;  // 현재 선택된 채널 { id, name, room_id }
let _realtimeChannel = null;
let _selectedInviteIds = new Set();
let _roomList = [];          // 내가 속한 채팅방들
let _selectedRoomImgFile = null;
let _selectedSettingsImgFile = null;

/* ─────────────────────────────────────────
   초기화
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = '../login.html'; return; }
    _me = user;

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    _myProfile = profile;

    const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
    document.getElementById('my-avatar').src = avatar;
    document.getElementById('my-username').textContent = profile?.username || user.email.split('@')[0];

    await loadFollowingList();
    await loadServerList();   // 방 아이콘 로드
    await loadDmList();       // DM 목록

    subscribeToMyInvites();
    checkNotiBadge(user.id);
    checkMsgBadge(user.id);
    bindEvents();
});

/* ─────────────────────────────────────────
   팔로잉 목록
───────────────────────────────────────── */
async function loadFollowingList() {
    const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', _me.id);
    if (!follows || follows.length === 0) { _followingList = []; return; }
    const ids = follows.map(f => f.following_id);
    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids);
    _followingList = profiles || [];
}

/* ─────────────────────────────────────────
   서버(방) 아이콘 리스트
───────────────────────────────────────── */
async function loadServerList() {
    const { data: memberships } = await supabase.from('room_members').select('room_id').eq('user_id', _me.id);
    if (!memberships || memberships.length === 0) { _roomList = []; return; }
    const roomIds = memberships.map(m => m.room_id);
    const { data: rooms } = await supabase.from('message_rooms').select('*').in('id', roomIds).eq('type', 'room').order('updated_at', { ascending: false });
    _roomList = rooms || [];
    renderServerIcons();
}

function renderServerIcons() {
    const container = document.getElementById('server-icons');
    container.innerHTML = '';
    _roomList.forEach(room => {
        const btn = document.createElement('button');
        btn.className = 'server-icon';
        btn.dataset.roomId = room.id;
        btn.title = room.name;

        if (room.image_url) {
            const img = document.createElement('img');
            img.src = room.image_url;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;';
            img.onerror = function() {
                this.remove();
                const sp = document.createElement('span');
                sp.style.cssText = 'font-size:13px;font-weight:800;color:var(--text-2)';
                sp.textContent = room.name.substring(0,2);
                btn.appendChild(sp);
            };
            btn.appendChild(img);
        } else {
            const sp = document.createElement('span');
            sp.style.cssText = 'font-size:13px;font-weight:800;color:var(--text-2)';
            sp.textContent = room.name.substring(0,2);
            btn.appendChild(sp);
        }
        container.appendChild(btn);
    });
}

/* ─────────────────────────────────────────
   DM 목록
───────────────────────────────────────── */
async function loadDmList() {
    const dmListEl = document.getElementById('dm-list');
    const { data: memberships } = await supabase.from('room_members').select('room_id').eq('user_id', _me.id);
    if (!memberships || memberships.length === 0) { dmListEl.innerHTML = '<li class="channel-empty">아직 DM이 없어요</li>'; return; }
    const roomIds = memberships.map(m => m.room_id);
    const { data: rooms } = await supabase.from('message_rooms').select('*').in('id', roomIds).eq('type', 'dm').order('updated_at', { ascending: false });
    if (!rooms || rooms.length === 0) { dmListEl.innerHTML = '<li class="channel-empty">아직 DM이 없어요</li>'; return; }
    dmListEl.innerHTML = '';
    for (const room of rooms) {
        const { data: otherMembers } = await supabase.from('room_members').select('user_id, profiles(username, avatar_url)').eq('room_id', room.id).neq('user_id', _me.id);
        const other = otherMembers?.[0];
        if (!other) continue;
        const username = other.profiles?.username || '알 수 없음';
        const avatarUrl = other.profiles?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${other.user_id}`;
        const li = document.createElement('li');
        li.className = 'channel-item';
        li.dataset.roomId = room.id;
        li.innerHTML = `<img src="${avatarUrl}" class="channel-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${other.user_id}'"><span class="channel-name">${escapeHtml(username)}</span>`;
        li.addEventListener('click', () => {
            switchToDmView();
            openDmRoom(room, { name: username, avatar: avatarUrl });
        });
        dmListEl.appendChild(li);
    }
}

/* ─────────────────────────────────────────
   서버 뷰 (방 채널 목록)
───────────────────────────────────────── */
async function openServerView(room) {
    _currentRoom = room;

    // 서버 아이콘 활성화
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('server-home-btn').classList.remove('active');
    const activeIcon = document.querySelector(`.server-icon[data-room-id="${room.id}"]`);
    if (activeIcon) activeIcon.classList.add('active');

    // 사이드바 전환
    document.getElementById('dm-sidebar').style.display = 'none';
    const roomSidebar = document.getElementById('room-sidebar');
    roomSidebar.style.display = 'flex';
    roomSidebar.style.flexDirection = 'column';
    roomSidebar.style.flex = '1';
    roomSidebar.style.overflow = 'hidden';

    // 방 헤더 업데이트
    const imgEl = document.getElementById('room-sidebar-img');
    if (room.image_url) { imgEl.src = room.image_url; imgEl.style.display = 'block'; }
    else { imgEl.style.display = 'none'; }
    document.getElementById('room-sidebar-name').textContent = room.name;

    // 방장이면 설정 버튼 표시
    const isOwner = room.created_by === _me.id;
    document.getElementById('room-settings-btn').style.display = isOwner ? 'flex' : 'none';
    document.getElementById('add-channel-btn').style.display = isOwner ? 'flex' : 'none';

    // 채널 목록 로드
    await loadChannelList(room.id, isOwner);
}

async function loadChannelList(roomId, isOwner) {
    const channelListEl = document.getElementById('channel-list');
    channelListEl.innerHTML = '<li class="channel-loading"><span class="material-symbols-rounded animation-spin">sync</span></li>';

    const { data: channels } = await supabase.from('message_channels').select('*').eq('room_id', roomId).order('created_at', { ascending: true });

    channelListEl.innerHTML = '';

    if (!channels || channels.length === 0) {
        // 방장이면 기본 채널 자동 생성
        if (isOwner) {
            await supabase.from('message_channels').insert({ room_id: roomId, name: '일반', created_by: _me.id });
            return loadChannelList(roomId, isOwner);
        }
        channelListEl.innerHTML = '<li class="channel-empty">채널이 없어요</li>';
        return;
    }

    channels.forEach(ch => {
        const li = document.createElement('li');
        li.className = 'channel-item channel-item-hover';
        li.dataset.channelId = ch.id;
        li.innerHTML = `
            <span class="material-symbols-rounded channel-hash">tag</span>
            <span class="channel-name">${escapeHtml(ch.name)}</span>
            <button class="ch-more-btn" data-channel-id="${ch.id}" data-channel-name="${escapeHtml(ch.name)}" title="설정">
                <span class="material-symbols-rounded">more_horiz</span>
            </button>`;
        li.querySelector('.channel-name').addEventListener('click', () => openChannel(ch));
        li.querySelector('.ch-more-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openChannelMenu(ch, isOwner, e.currentTarget);
        });
        channelListEl.appendChild(li);
    });

    // 첫 번째 채널 자동 선택
    if (channels.length > 0) openChannel(channels[0]);
}

async function openChannel(channel) {
    _currentChannel = channel;
    _currentRoom = { ..._currentRoom, channelId: channel.id };

    document.querySelectorAll('#channel-list .channel-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`[data-channel-id="${channel.id}"]`);
    if (activeEl) activeEl.classList.add('active');

    // 채팅창 열기
    document.getElementById('chat-welcome').style.display = 'none';
    const chatRoom = document.getElementById('chat-room');
    chatRoom.style.display = 'flex';

    document.getElementById('chat-room-avatar').style.display = 'none';
    document.getElementById('chat-channel-hash').style.display = 'inline';
    document.getElementById('chat-room-name').textContent = channel.name;
    document.getElementById('chat-room-sub').textContent = _currentRoom?.name || '';
    document.getElementById('msg-input').placeholder = `#${channel.name}에 메시지 보내기`;
    document.getElementById('members-panel').style.display = 'none';

    await loadMessages(null, channel.id);
    subscribeToChannel(channel.id);
    loadRoomMembers(_currentRoom.id);
}

/* ─────────────────────────────────────────
   DM 방 열기
───────────────────────────────────────── */
async function openDmRoom(room, meta) {
    _currentRoom = { ...room, ...meta, type: 'dm' };
    _currentChannel = null;

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`[data-room-id="${room.id}"]`);
    if (activeEl) activeEl.classList.add('active');

    document.getElementById('chat-welcome').style.display = 'none';
    const chatRoom = document.getElementById('chat-room');
    chatRoom.style.display = 'flex';

    const avatarEl = document.getElementById('chat-room-avatar');
    if (meta.avatar) { avatarEl.src = meta.avatar; avatarEl.style.display = 'block'; }
    else { avatarEl.style.display = 'none'; }
    document.getElementById('chat-channel-hash').style.display = 'none';
    document.getElementById('chat-room-name').textContent = meta.name;
    document.getElementById('chat-room-sub').textContent = '다이렉트 메시지';
    document.getElementById('msg-input').placeholder = `${meta.name}에게 메시지 보내기`;
    document.getElementById('members-panel').style.display = 'none';

    await loadMessages(room.id, null);
    subscribeToRoom(room.id);
}

function switchToDmView() {
    document.getElementById('dm-sidebar').style.display = 'flex';
    document.getElementById('dm-sidebar').style.flexDirection = 'column';
    document.getElementById('dm-sidebar').style.flex = '1';
    document.getElementById('dm-sidebar').style.overflow = 'hidden';
    document.getElementById('room-sidebar').style.display = 'none';
    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('server-home-btn').classList.add('active');
    _currentRoom = null;
    _currentChannel = null;
}

/* ─────────────────────────────────────────
   메시지 로드
───────────────────────────────────────── */
async function loadMessages(roomId, channelId) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="messages-loader"><span class="material-symbols-rounded animation-spin">sync</span></div>';

    let query = supabase.from('messages').select('*, profiles(id, username, avatar_url)').order('created_at', { ascending: true }).limit(100);
    if (channelId) query = query.eq('channel_id', channelId);
    else if (roomId) query = query.eq('room_id', roomId).is('channel_id', null);

    const { data: messages } = await query;
    container.innerHTML = '';
    renderChatStartNotice(container);
    if (messages && messages.length > 0) renderMessages(container, messages);
    container.scrollTop = container.scrollHeight;
}

function renderChatStartNotice(container) {
    const notice = document.createElement('div');
    notice.className = 'chat-start-notice';
    if (_currentChannel) {
        notice.innerHTML = `<h3># ${escapeHtml(_currentChannel.name)}</h3><p>${escapeHtml(_currentRoom?.name || '')} 채널의 시작입니다.</p>`;
    } else if (_currentRoom?.type === 'dm') {
        notice.innerHTML = `
            ${_currentRoom.avatar ? `<img src="${_currentRoom.avatar}" class="start-avatar">` : ''}
            <h3>${escapeHtml(_currentRoom.name)}</h3>
            <p>${escapeHtml(_currentRoom.name)}님과의 다이렉트 메시지 시작입니다.</p>`;
    }
    container.appendChild(notice);
}

function renderMessages(container, messages) {
    let prevUserId = null, prevDate = null;
    messages.forEach(msg => {
        const msgDate = new Date(msg.created_at);
        const dateStr = formatDate(msgDate);
        if (dateStr !== prevDate) {
            const divider = document.createElement('div');
            divider.className = 'msg-date-divider';
            divider.textContent = dateStr;
            container.appendChild(divider);
            prevDate = dateStr;
            prevUserId = null;
        }
        const isContinuation = msg.user_id === prevUserId;
        const profile = msg.profiles;
        const username = profile?.username || '알 수 없음';
        const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${msg.user_id}`;
        const timeStr = formatTime(msgDate);
        const el = document.createElement('div');
        if (isContinuation) {
            el.className = 'msg-continuation';
            el.dataset.userId = msg.user_id;
            el.innerHTML = `<span class="msg-time-stub">${timeStr}</span><span class="msg-text">${renderMarkdownSafe(msg.content)}</span>`;
        } else {
            el.className = 'msg-group';
            el.dataset.userId = msg.user_id;
            el.innerHTML = `
                <img src="${avatar}" class="msg-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${msg.user_id}'">
                <div class="msg-group-content">
                    <div class="msg-group-header">
                        <span class="msg-author">${escapeHtml(username)}</span>
                        <span class="msg-timestamp">${timeStr}</span>
                    </div>
                    <span class="msg-text">${renderMarkdownSafe(msg.content)}</span>
                </div>`;
        }
        container.appendChild(el);
        prevUserId = msg.user_id;
    });
}

/* ─────────────────────────────────────────
   실시간 구독
───────────────────────────────────────── */
function subscribeToChannel(channelId) {
    if (_realtimeChannel) { supabase.removeChannel(_realtimeChannel); _realtimeChannel = null; }
    _realtimeChannel = supabase.channel(`ch-${channelId}-${Date.now()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, async (payload) => {
            const msg = payload.new;
            if (msg.user_id === _me.id) return;
            const { data: profile } = await supabase.from('profiles').select('id, username, avatar_url').eq('id', msg.user_id).single();
            msg.profiles = profile;
            appendNewMessage(msg);
        }).subscribe();
}

function subscribeToRoom(roomId) {
    if (_realtimeChannel) { supabase.removeChannel(_realtimeChannel); _realtimeChannel = null; }
    _realtimeChannel = supabase.channel(`room-${roomId}-${Date.now()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, async (payload) => {
            const msg = payload.new;
            if (msg.user_id === _me.id || msg.channel_id) return;
            const { data: profile } = await supabase.from('profiles').select('id, username, avatar_url').eq('id', msg.user_id).single();
            msg.profiles = profile;
            appendNewMessage(msg);
        }).subscribe();
}

function subscribeToMyInvites() {
    supabase.channel(`invites-${_me.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_members', filter: `user_id=eq.${_me.id}` }, async () => {
            await loadServerList();
            await loadDmList();
        }).subscribe();
}

function appendNewMessage(msg) {
    const container = document.getElementById('chat-messages');
    const profile = msg.profiles;
    const username = profile?.username || '알 수 없음';
    const avatar = profile?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${msg.user_id}`;
    const timeStr = formatTime(new Date(msg.created_at));
    const lastGroup = container.querySelector('.msg-group:last-of-type');
    const isContinuation = lastGroup && lastGroup.dataset.userId === msg.user_id;
    const el = document.createElement('div');
    if (isContinuation) {
        el.className = 'msg-continuation';
        el.dataset.userId = msg.user_id;
        el.innerHTML = `<span class="msg-time-stub">${timeStr}</span><span class="msg-text">${renderMarkdownSafe(msg.content)}</span>`;
    } else {
        el.className = 'msg-group';
        el.dataset.userId = msg.user_id;
        el.innerHTML = `
            <img src="${avatar}" class="msg-avatar" onerror="this.src='https://api.dicebear.com/7.x/identicon/svg?seed=${msg.user_id}'">
            <div class="msg-group-content">
                <div class="msg-group-header">
                    <span class="msg-author">${escapeHtml(username)}</span>
                    <span class="msg-timestamp">${timeStr}</span>
                </div>
                <span class="msg-text">${renderMarkdownSafe(msg.content)}</span>
            </div>`;
    }
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}

/* ─────────────────────────────────────────
   메시지 전송
───────────────────────────────────────── */
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    input.style.height = 'auto';

    // 즉시 표시
    const fakeMsg = {
        id: 'temp_' + Date.now(), user_id: _me.id, content,
        created_at: new Date().toISOString(),
        profiles: { id: _me.id, username: _myProfile?.username || _me.email.split('@')[0], avatar_url: _myProfile?.avatar_url }
    };
    appendNewMessage(fakeMsg);

    const insertData = { user_id: _me.id, content };
    if (_currentChannel) {
        insertData.channel_id = _currentChannel.id;
        insertData.room_id = _currentRoom.id;
    } else if (_currentRoom) {
        insertData.room_id = _currentRoom.id;
    }

    await supabase.from('messages').insert(insertData);
    if (_currentRoom) await supabase.from('message_rooms').update({ updated_at: new Date().toISOString() }).eq('id', _currentRoom.id);
}

/* ─────────────────────────────────────────
   멤버 목록
───────────────────────────────────────── */
async function loadRoomMembers(roomId) {
    const { data: members } = await supabase.from('room_members').select('user_id, profiles(username, avatar_url)').eq('room_id', roomId);
    const list = document.getElementById('members-list');
    list.innerHTML = '';
    (members || []).forEach(m => {
        const username = m.profiles?.username || '알 수 없음';
        const avatar = m.profiles?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${m.user_id}`;
        const li = document.createElement('li');
        li.className = 'member-item';
        li.innerHTML = `<img src="${avatar}" class="member-avatar"><span class="member-name">${escapeHtml(username)}${m.user_id === _me.id ? ' (나)' : ''}</span>`;
        list.appendChild(li);
    });
}

/* ─────────────────────────────────────────
   채팅방 만들기
───────────────────────────────────────── */
async function createRoom() {
    const name = document.getElementById('room-name-input').value.trim();
    if (!name) { alert('방 이름을 입력해주세요'); return; }
    const memberIds = [..._selectedInviteIds, _me.id];

    let imageUrl = null;
    if (_selectedRoomImgFile) {
        const ext = _selectedRoomImgFile.name.split('.').pop();
        const fileName = `rooms/${_me.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('post-images').upload(fileName, _selectedRoomImgFile, { upsert: false });
        if (!upErr) {
            const { data: pub } = supabase.storage.from('post-images').getPublicUrl(fileName);
            imageUrl = pub.publicUrl;
        }
    }

    const { data: room, error } = await supabase.from('message_rooms').insert({ name, type: 'room', created_by: _me.id, member_count: memberIds.length, image_url: imageUrl }).select().single();
    if (error || !room) { alert('방 만들기 실패'); return; }

    const memberInserts = memberIds.map(uid => ({ room_id: room.id, user_id: uid }));
    await supabase.from('room_members').insert(memberInserts);
    // 기본 채널 생성
    await supabase.from('message_channels').insert([
            { room_id: room.id, name: '채팅채널1', created_by: _me.id },
            { room_id: room.id, name: '채팅채널2', created_by: _me.id }
        ]);

    document.getElementById('create-room-modal').style.display = 'none';
    await loadServerList();
    openServerView({ ...room, image_url: imageUrl });
}

/* ─────────────────────────────────────────
   방 설정
───────────────────────────────────────── */
async function saveRoomSettings() {
    if (!_currentRoom) return;
    const name = document.getElementById('settings-name-input').value.trim();
    if (!name) { alert('방 이름을 입력해주세요'); return; }

    let imageUrl = _currentRoom.image_url;
    if (_selectedSettingsImgFile) {
        const ext = _selectedSettingsImgFile.name.split('.').pop();
        const fileName = `rooms/${_me.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('post-images').upload(fileName, _selectedSettingsImgFile, { upsert: false });
        if (!upErr) {
            const { data: pub } = supabase.storage.from('post-images').getPublicUrl(fileName);
            imageUrl = pub.publicUrl;
        }
    }

    await supabase.from('message_rooms').update({ name, image_url: imageUrl }).eq('id', _currentRoom.id);
    _currentRoom = { ..._currentRoom, name, image_url: imageUrl };
    document.getElementById('room-settings-modal').style.display = 'none';
    await loadServerList();
    openServerView(_currentRoom);
}

/* ─────────────────────────────────────────
   채널 추가
───────────────────────────────────────── */
async function addChannel() {
    const name = document.getElementById('channel-name-input').value.trim();
    if (!name || !_currentRoom) { alert('채널 이름을 입력해주세요'); return; }
    await supabase.from('message_channels').insert({ room_id: _currentRoom.id, name, created_by: _me.id });
    document.getElementById('add-channel-modal').style.display = 'none';
    document.getElementById('channel-name-input').value = '';
    await loadChannelList(_currentRoom.id, _currentRoom.created_by === _me.id);
}

/* ─────────────────────────────────────────
   DM 시작
───────────────────────────────────────── */
function openNewDmModal() {
    document.getElementById('dm-user-search').value = '';
    renderDmUserList('');
    document.getElementById('new-dm-modal').style.display = 'flex';
}

function renderDmUserList(query) {
    const list = document.getElementById('dm-user-list');
    const filtered = _followingList.filter(u => u.username.toLowerCase().includes(query.toLowerCase()));
    if (filtered.length === 0) { list.innerHTML = '<li class="channel-empty">팔로우한 사람이 없어요</li>'; return; }
    list.innerHTML = '';
    filtered.forEach(user => {
        const avatar = user.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
        const li = document.createElement('li');
        li.className = 'invite-item';
        li.innerHTML = `<img src="${avatar}" class="invite-avatar"><span class="invite-username">${escapeHtml(user.username)}</span>`;
        li.addEventListener('click', () => startDm(user));
        list.appendChild(li);
    });
}

async function startDm(user) {
    document.getElementById('new-dm-modal').style.display = 'none';
    const { data: myRooms } = await supabase.from('room_members').select('room_id').eq('user_id', _me.id);
    const { data: theirRooms } = await supabase.from('room_members').select('room_id').eq('user_id', user.id);
    const myIds = new Set((myRooms || []).map(r => r.room_id));
    const commonIds = (theirRooms || []).filter(r => myIds.has(r.room_id)).map(r => r.room_id);
    let existingRoom = null;
    if (commonIds.length > 0) {
        const { data: dmRooms } = await supabase.from('message_rooms').select('*').in('id', commonIds).eq('type', 'dm').limit(1);
        existingRoom = dmRooms?.[0];
    }
    if (existingRoom) {
        switchToDmView();
        const avatar = user.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
        await loadDmList();
        openDmRoom(existingRoom, { name: user.username, avatar });
        return;
    }
    const { data: newRoom, error } = await supabase.from('message_rooms').insert({ name: `dm_${_me.id}_${user.id}`, type: 'dm', created_by: _me.id, member_count: 2 }).select().single();
    if (error || !newRoom) { console.error(error); return; }
    await supabase.from('room_members').insert([{ room_id: newRoom.id, user_id: _me.id }, { room_id: newRoom.id, user_id: user.id }]);
    switchToDmView();
    await loadDmList();
    const avatar = user.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
    openDmRoom(newRoom, { name: user.username, avatar });
}

/* ─────────────────────────────────────────
   초대 모달
───────────────────────────────────────── */
function renderInviteList(query) {
    const list = document.getElementById('invite-list');
    const filtered = _followingList.filter(u => u.username.toLowerCase().includes(query.toLowerCase()));
    if (filtered.length === 0) { list.innerHTML = '<li class="channel-empty">팔로우한 사람이 없어요</li>'; return; }
    list.innerHTML = '';
    filtered.forEach(user => {
        const avatar = user.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.id}`;
        const isSelected = _selectedInviteIds.has(user.id);
        const li = document.createElement('li');
        li.className = `invite-item${isSelected ? ' selected' : ''}`;
        li.innerHTML = `<img src="${avatar}" class="invite-avatar"><span class="invite-username">${escapeHtml(user.username)}</span>${isSelected ? '<span class="material-symbols-rounded invite-check">check_circle</span>' : ''}`;
        li.addEventListener('click', () => {
            if (_selectedInviteIds.has(user.id)) _selectedInviteIds.delete(user.id);
            else _selectedInviteIds.add(user.id);
            renderInviteList(document.getElementById('invite-search').value);
            renderSelectedTags();
        });
        list.appendChild(li);
    });
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
        tag.innerHTML = `<img src="${avatar}"><span>${escapeHtml(user.username)}</span><button data-id="${id}"><span class="material-symbols-rounded" style="font-size:14px;">close</span></button>`;
        tag.querySelector('button').addEventListener('click', () => {
            _selectedInviteIds.delete(id);
            renderInviteList(document.getElementById('invite-search').value);
            renderSelectedTags();
        });
        container.appendChild(tag);
    });
}

/* ─────────────────────────────────────────
   뱃지
───────────────────────────────────────── */
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
    const { data: memberships } = await supabase.from('room_members').select('room_id, last_read_at').eq('user_id', userId);
    if (!memberships || memberships.length === 0) return;
    let unread = 0;
    for (const m of memberships) {
        const since = m.last_read_at || '1970-01-01';
        const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('room_id', m.room_id).neq('user_id', userId).gt('created_at', since);
        unread += count || 0;
    }
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
}

/* ─────────────────────────────────────────
   이벤트 바인딩
───────────────────────────────────────── */
function bindEvents() {
    // 서버 홈 (DM 뷰)
    document.getElementById('server-home-btn').addEventListener('click', switchToDmView);

    // 새 채팅방
    document.getElementById('new-room-btn').addEventListener('click', () => {
        _selectedInviteIds.clear();
        _selectedRoomImgFile = null;
        document.getElementById('room-name-input').value = '';
        document.getElementById('invite-search').value = '';
        document.getElementById('selected-members').innerHTML = '';
        document.getElementById('room-img-label').innerHTML = '<span class="material-symbols-rounded">add_photo_alternate</span><span>사진 추가</span>';
        renderInviteList('');
        document.getElementById('create-room-modal').style.display = 'flex';
    });
    document.getElementById('close-room-modal').addEventListener('click', () => document.getElementById('create-room-modal').style.display = 'none');
    document.getElementById('cancel-room-modal').addEventListener('click', () => document.getElementById('create-room-modal').style.display = 'none');
    document.getElementById('confirm-create-room').addEventListener('click', createRoom);
    document.getElementById('invite-search').addEventListener('input', e => renderInviteList(e.target.value));

    // 방 이미지 업로드
    document.getElementById('room-img-file').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        _selectedRoomImgFile = file;
        const url = URL.createObjectURL(file);
        document.getElementById('room-img-label').innerHTML = `<img src="${url}"><span>변경</span>`;
    });

    // 방 설정
    document.getElementById('room-settings-btn').addEventListener('click', () => {
        if (!_currentRoom) return;
        document.getElementById('settings-name-input').value = _currentRoom.name;
        _selectedSettingsImgFile = null;
        const label = document.getElementById('settings-img-label');
        if (_currentRoom.image_url) label.innerHTML = `<img src="${_currentRoom.image_url}"><span>변경</span>`;
        else label.innerHTML = '<span class="material-symbols-rounded">add_photo_alternate</span><span>사진 변경</span>';
        document.getElementById('room-settings-modal').style.display = 'flex';
    });
    document.getElementById('close-settings-modal').addEventListener('click', () => document.getElementById('room-settings-modal').style.display = 'none');
    document.getElementById('cancel-settings-modal').addEventListener('click', () => document.getElementById('room-settings-modal').style.display = 'none');
    document.getElementById('confirm-settings').addEventListener('click', saveRoomSettings);
    document.getElementById('settings-img-file').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        _selectedSettingsImgFile = file;
        const url = URL.createObjectURL(file);
        document.getElementById('settings-img-label').innerHTML = `<img src="${url}"><span>변경</span>`;
    });

    // 채널 추가
    document.getElementById('add-channel-btn').addEventListener('click', () => {
        document.getElementById('channel-name-input').value = '';
        document.getElementById('add-channel-modal').style.display = 'flex';
    });
    document.getElementById('close-channel-modal').addEventListener('click', () => document.getElementById('add-channel-modal').style.display = 'none');
    document.getElementById('cancel-channel-modal').addEventListener('click', () => document.getElementById('add-channel-modal').style.display = 'none');
    document.getElementById('confirm-add-channel').addEventListener('click', addChannelWithToken);

    // DM
    document.getElementById('new-dm-btn').addEventListener('click', openNewDmModal);
    document.getElementById('start-chat-btn').addEventListener('click', openNewDmModal);
    document.getElementById('close-dm-modal').addEventListener('click', () => document.getElementById('new-dm-modal').style.display = 'none');
    document.getElementById('dm-user-search').addEventListener('input', e => renderDmUserList(e.target.value));

    // 모달 외부 클릭
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
    });

    // 전송
    document.getElementById('send-btn').addEventListener('click', sendMessage);

    // 이미지 첨부
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    document.querySelector('.attach-btn')?.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) uploadChatImage(e.target.files[0]);
        fileInput.value = '';
    });
    document.getElementById('msg-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById('msg-input').addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 140) + 'px';
    });

    // 멤버 패널 토글
    document.getElementById('members-btn').addEventListener('click', () => {
        const panel = document.getElementById('members-panel');
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) panel.style.flexDirection = 'column';
        if (isHidden && _currentRoom?.id) loadRoomMembers(_currentRoom.id);
    });

    // DM 검색
    document.getElementById('dm-search').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('#dm-list .channel-item').forEach(item => {
            const name = item.querySelector('.channel-name')?.textContent?.toLowerCase() || '';
            item.style.display = name.includes(q) ? '' : 'none';
        });
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
function renderMarkdownSafe(text) {
    // 안전한 마크다운만 렌더링
    let html = escapeHtml(text);
    html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:0.95rem;font-weight:700;margin:4px 0">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:1.05rem;font-weight:800;margin:4px 0">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:1.15rem;font-weight:800;margin:4px 0">$1</h1>');
    html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:6px 0">');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`(.+?)`/g, '<code style="background:var(--bg-2);padding:1px 5px;border-radius:4px;font-size:0.85em;color:#c084fc">$1</code>');
    return html;
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

/* ─── 채널 컨텍스트 메뉴 ─── */
let _menuEl = null;
function openChannelMenu(ch, isOwner, btn) {
    closeChannelMenu();
    const rect = btn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'ch-context-menu';
    menu.style.cssText = `position:fixed;top:${rect.bottom+4}px;left:${rect.left}px;z-index:2000;`;
    menu.innerHTML = `
        <button class="ch-menu-item" data-action="mute">
            <span class="material-symbols-rounded">notifications_off</span>알림 해제
        </button>
        ${isOwner ? `
        <div class="ch-menu-divider"></div>
        <button class="ch-menu-item" data-action="rename">
            <span class="material-symbols-rounded">edit</span>채널 이름 변경
        </button>
        <button class="ch-menu-item danger" data-action="delete">
            <span class="material-symbols-rounded">delete</span>채널 삭제
        </button>` : ''}
    `;
    menu.querySelectorAll('.ch-menu-item').forEach(item => {
        item.addEventListener('click', async () => {
            const action = item.dataset.action;
            closeChannelMenu();
            if (action === 'rename') {
                const name = prompt('새 채널 이름:', ch.name);
                if (name && name.trim()) {
                    await supabase.from('message_channels').update({ name: name.trim() }).eq('id', ch.id);
                    await loadChannelList(_currentRoom.id, true);
                }
            } else if (action === 'delete') {
                if (confirm(`"${ch.name}" 채널을 삭제할까요?`)) {
                    await supabase.from('messages').delete().eq('channel_id', ch.id);
                    await supabase.from('message_channels').delete().eq('id', ch.id);
                    await loadChannelList(_currentRoom.id, true);
                    document.getElementById('chat-welcome').style.display = 'flex';
                    document.getElementById('chat-room').style.display = 'none';
                }
            } else if (action === 'mute') {
                alert('알림이 해제됐어요.');
            }
        });
    });
    document.body.appendChild(menu);
    _menuEl = menu;
    setTimeout(() => document.addEventListener('click', closeChannelMenu, { once: true }), 0);
}
function closeChannelMenu() {
    if (_menuEl) { _menuEl.remove(); _menuEl = null; }
}

/* ─── 채널 추가 (루나 소모) ─── */
async function addChannelWithToken() {
    const name = document.getElementById('channel-name-input').value.trim();
    if (!name || !_currentRoom) { alert('채널 이름을 입력해주세요'); return; }

    // 토큰 확인
    const { data: tokenData } = await supabase.from('user_tokens').select('amount').eq('user_id', _me.id).single();
    const myTokens = tokenData?.amount ?? 0;
    const { count: chCount } = await supabase.from('message_channels').select('*', {count:'exact',head:true}).eq('room_id', _currentRoom.id);
    const cost = chCount >= 2 ? 3000 : 0; // 기본 2개 무료, 추가는 3000루나

    if (cost > 0 && myTokens < cost) {
        alert(`채널 추가에는 ${cost} 루나가 필요해요. (보유: ${myTokens} 루나)`);
        return;
    }
    if (cost > 0 && !confirm(`채널 추가에 ${cost} 루나가 소모됩니다. 계속할까요?`)) return;

    await supabase.from('message_channels').insert({ room_id: _currentRoom.id, name, created_by: _me.id });
    if (cost > 0) await supabase.from('user_tokens').update({ amount: myTokens - cost }).eq('user_id', _me.id);

    document.getElementById('add-channel-modal').style.display = 'none';
    document.getElementById('channel-name-input').value = '';
    const { count: newCount } = await supabase.from('message_channels').select('*', {count:'exact',head:true}).eq('room_id', _currentRoom.id);
    await loadChannelList(_currentRoom.id, true);
}

/* ─── 채팅 이미지 업로드 ─── */
async function uploadChatImage(file) {
    if (!_me || (!_currentChannel && !_currentRoom)) return;
    if (file.size > 10 * 1024 * 1024) { alert('10MB 이하 이미지만 가능합니다.'); return; }
    const ext = file.name.split('.').pop();
    const fileName = `chat/${_me.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('post-images').upload(fileName, file, { upsert: false });
    if (error) { alert('이미지 업로드 실패'); return; }
    const { data: pub } = supabase.storage.from('post-images').getPublicUrl(fileName);
    const imgUrl = pub.publicUrl;

    const insertData = { user_id: _me.id, content: `![이미지](${imgUrl})` };
    if (_currentChannel) { insertData.channel_id = _currentChannel.id; insertData.room_id = _currentRoom.id; }
    else if (_currentRoom) { insertData.room_id = _currentRoom.id; }
    await supabase.from('messages').insert(insertData);
}
