/* messages/msg-logic.js — 3단계 구조 (채팅방 → 채널 → 방) */

/* ─────────────────────────────────────────
   상태
───────────────────────────────────────── */
let _me = null;
let _myProfile = null;
let _followingList = [];
let _currentServer = null;    // 현재 선택된 채팅방 (message_rooms)
let _currentChannel = null;   // 현재 선택된 채널 (message_channels)
let _currentChatRoom = null;  // 현재 선택된 방 (channel_rooms)
let _realtimeChannel = null;
let _selectedInviteIds = new Set();
let _serverList = [];
let _selectedServerImgFile = null;
let _selectedSettingsImgFile = null;
let _mutedRooms = new Set();  // 알림 해제된 방 ID
let _channelSettingsTarget = null;
let _selectedChSettingsImgFile = null;

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

    // 알림 해제 방 목록 불러오기
    try {
        const saved = JSON.parse(localStorage.getItem(`mutedRooms_${user.id}`) || '[]');
        _mutedRooms = new Set(saved);
    } catch(e) { _mutedRooms = new Set(); }

    await loadFollowingList();
    await loadServerList();
    await loadDmList();

    subscribeToMyInvites();
    subscribeToPermissions();
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
   채팅방(서버) 아이콘 리스트
───────────────────────────────────────── */
async function loadServerList() {
    const { data: memberships } = await supabase.from('room_members').select('room_id').eq('user_id', _me.id);
    if (!memberships || memberships.length === 0) { _serverList = []; renderServerIcons(); return; }
    const roomIds = memberships.map(m => m.room_id);
    const { data: rooms } = await supabase.from('message_rooms').select('*').in('id', roomIds).eq('type', 'room').order('updated_at', { ascending: false });
    _serverList = rooms || [];
    renderServerIcons();
}

function renderServerIcons() {
    const container = document.getElementById('server-icons');
    container.innerHTML = '';
    _serverList.forEach(room => {
        const btn = document.createElement('button');
        btn.className = 'server-icon';
        btn.dataset.roomId = room.id;
        btn.title = room.name;
        btn.addEventListener('click', () => openServerView(room));
        if (room.image_url) {
            const img = document.createElement('img');
            img.src = room.image_url;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;';
            img.onerror = function() {
                this.remove();
                const sp = document.createElement('span');
                sp.style.cssText = 'font-size:13px;font-weight:800;color:var(--text-2)';
                sp.textContent = room.name.substring(0, 2);
                btn.appendChild(sp);
            };
            btn.appendChild(img);
        } else {
            const sp = document.createElement('span');
            sp.style.cssText = 'font-size:13px;font-weight:800;color:var(--text-2)';
            sp.textContent = room.name.substring(0, 2);
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
   채팅방(서버) 뷰 열기
───────────────────────────────────────── */
async function openServerView(room) {
    _currentServer = room;
    _currentChannel = null;
    _currentChatRoom = null;

    document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
    document.getElementById('server-home-btn').classList.remove('active');
    const activeIcon = document.querySelector(`.server-icon[data-room-id="${room.id}"]`);
    if (activeIcon) activeIcon.classList.add('active');

    document.getElementById('dm-sidebar').style.display = 'none';
    const roomSidebar = document.getElementById('room-sidebar');
    roomSidebar.style.display = 'flex';
    roomSidebar.style.flexDirection = 'column';
    roomSidebar.style.flex = '1';
    roomSidebar.style.overflow = 'hidden';

    const imgEl = document.getElementById('room-sidebar-img');
    if (room.image_url) { imgEl.src = room.image_url; imgEl.style.display = 'block'; }
    else { imgEl.style.display = 'none'; }
    document.getElementById('room-sidebar-name').textContent = room.name;

    const isOwner = room.created_by === _me.id;
    document.getElementById('room-settings-btn').style.display = isOwner ? 'flex' : 'none';
    document.getElementById('add-channel-btn').style.display = isOwner ? 'flex' : 'none';

    // 채팅 영역 초기화
    document.getElementById('chat-welcome').style.display = 'flex';
    document.getElementById('chat-room').style.display = 'none';

    await loadChannelList(room.id, isOwner);
}

/* ─────────────────────────────────────────
   채널 목록 로드 (채팅방 안의 채널들)
───────────────────────────────────────── */
async function loadChannelList(serverId, isOwner) {
    const channelListEl = document.getElementById('channel-list');
    channelListEl.innerHTML = '<li class="channel-loading"><span class="material-symbols-rounded animation-spin">sync</span></li>';

    const { data: channels } = await supabase
        .from('message_channels')
        .select('*')
        .eq('room_id', serverId)
        .order('created_at', { ascending: true });

    channelListEl.innerHTML = '';

    if (!channels || channels.length === 0) {
        if (isOwner) {
            // 기본 채널 자동 생성
            const { data: newCh } = await supabase.from('message_channels')
                .insert({ room_id: serverId, name: '일반', created_by: _me.id })
                .select().single();
            if (newCh) {
                // 기본 방 1개도 자동 생성
                await supabase.from('channel_rooms')
                    .insert({ channel_id: newCh.id, name: '일반채팅', created_by: _me.id });
            }
            return loadChannelList(serverId, isOwner);
        }
        channelListEl.innerHTML = '<li class="channel-empty">채널이 없어요</li>';
        return;
    }

    for (const ch of channels) {
        await renderChannelItem(channelListEl, ch, isOwner, serverId);
    }
}

async function renderChannelItem(parentEl, ch, isOwner, serverId) {
    // 채널 헤더
    const chLi = document.createElement('li');
    chLi.className = 'channel-group';
    chLi.dataset.channelId = ch.id;

    chLi.innerHTML = `
        <div class="channel-group-header" data-channel-id="${ch.id}">
            <span class="material-symbols-rounded ch-fold-icon">expand_more</span>
            <span class="material-symbols-rounded channel-hash">tag</span>
            <span class="channel-group-name">${escapeHtml(ch.name)}</span>
            ${isOwner ? `
            <div class="ch-header-actions">
                <button class="ch-add-room-btn" data-channel-id="${ch.id}" title="방 추가 (500루나)">
                    <span class="material-symbols-rounded">add</span>
                </button>
                <button class="ch-more-btn" data-channel-id="${ch.id}" title="채널 설정">
                    <span class="material-symbols-rounded">more_horiz</span>
                </button>
            </div>` : ''}
        </div>
        <ul class="channel-room-list" id="rooms-of-ch-${ch.id}">
            <li class="channel-loading"><span class="material-symbols-rounded animation-spin" style="font-size:14px;">sync</span></li>
        </ul>`;

    // 채널 접기/펼치기
    const header = chLi.querySelector('.channel-group-header');
    const roomList = chLi.querySelector('.channel-room-list');
    const foldIcon = chLi.querySelector('.ch-fold-icon');
    header.addEventListener('click', (e) => {
        if (e.target.closest('.ch-add-room-btn') || e.target.closest('.ch-more-btn')) return;
        const folded = roomList.style.display === 'none';
        roomList.style.display = folded ? '' : 'none';
        foldIcon.textContent = folded ? 'expand_more' : 'chevron_right';
    });

    // 방 추가 버튼
    chLi.querySelector('.ch-add-room-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddChatRoomModal(ch);
    });

    // 채널 더보기(설정/삭제) 버튼
    chLi.querySelector('.ch-more-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openChannelMenu(ch, isOwner, e.currentTarget, serverId);
    });

    parentEl.appendChild(chLi);

    // 채널 안 방 목록 로드
    await loadChatRoomList(ch.id, isOwner);
}

/* ─────────────────────────────────────────
   채널 안 방 목록 로드 (channel_rooms)
───────────────────────────────────────── */
async function loadChatRoomList(channelId, isOwner) {
    const listEl = document.getElementById(`rooms-of-ch-${channelId}`);
    if (!listEl) return;

    const { data: chatRooms } = await supabase
        .from('channel_rooms')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true });

    listEl.innerHTML = '';

    if (!chatRooms || chatRooms.length === 0) {
        listEl.innerHTML = '<li class="channel-empty" style="font-size:0.78rem;padding-left:40px;">방이 없어요</li>';
        return;
    }

    // 내 권한 정보 일괄 조회
    const roomIds = chatRooms.map(cr => cr.id);
    const { data: myPerms } = await supabase.from('channel_permissions')
        .select('channel_id, can_view, can_chat')
        .in('channel_id', roomIds)
        .eq('user_id', _me.id);
    const permMap = {};
    (myPerms || []).forEach(p => { permMap[p.channel_id] = p; });

    chatRooms.forEach(cr => {
        // 권한 체크: 레코드 없으면 전체 허용, 있으면 해당 값 따름
        const perm = permMap[cr.id];
        const canView = isOwner || !perm || perm.can_view;
        const canChat = isOwner || !perm || perm.can_chat;

        const isMuted = _mutedRooms.has(cr.id);
        const li = document.createElement('li');
        li.className = 'chat-room-item channel-item-hover';
        li.dataset.chatRoomId = cr.id;
        li.dataset.canChat = canChat ? 'true' : 'false';
        li.dataset.canView = canView ? 'true' : 'false';

        // 아이콘: 볼 수도 없으면 lock, 볼 수만 있으면 visibility, 다 되면 chat
        const icon = (!canView || !canChat) ? 'lock' : 'chat';
        li.innerHTML = `
            <span class="material-symbols-rounded cr-icon">${icon}</span>
            <span class="cr-name">${escapeHtml(cr.name)}</span>
            ${isMuted ? '<span class="material-symbols-rounded ch-muted-icon" title="알림 해제됨">notifications_off</span>' : ''}
            <button class="cr-more-btn" title="방 설정">
                <span class="material-symbols-rounded">more_horiz</span>
            </button>`;
        li.querySelector('.cr-name').addEventListener('click', () => openChatRoom(cr, channelId));
        li.querySelector('.cr-more-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openChatRoomMenu(cr, channelId, isOwner, e.currentTarget);
        });
        listEl.appendChild(li);
    });
}

/* ─────────────────────────────────────────
   방(channel_room) 열기
───────────────────────────────────────── */
async function openChatRoom(chatRoom, channelId) {
    _currentChatRoom = chatRoom;

    // 채널 정보도 업데이트
    const { data: ch } = await supabase.from('message_channels').select('*').eq('id', channelId).single();
    _currentChannel = ch;

    // 활성 표시
    document.querySelectorAll('.chat-room-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`.chat-room-item[data-chat-room-id="${chatRoom.id}"]`);
    if (activeEl) activeEl.classList.add('active');

    document.getElementById('chat-welcome').style.display = 'none';
    const chatRoomEl = document.getElementById('chat-room');
    chatRoomEl.style.display = 'flex';

    document.getElementById('chat-room-avatar').style.display = 'none';
    document.getElementById('chat-channel-hash').style.display = 'inline';
    document.getElementById('chat-room-name').textContent = chatRoom.name;
    document.getElementById('chat-room-sub').textContent = `${_currentServer?.name || ''} > ${ch?.name || ''}`;
    document.getElementById('members-panel').style.display = 'none';

    // 채팅 권한 체크 (channel_permissions 테이블)
    const isOwner = _currentServer?.created_by === _me.id;
    let canView = true;
    let canChat = true;
    if (!isOwner) {
        try {
            const { data: perm } = await supabase.from('channel_permissions')
                .select('can_view, can_chat').eq('channel_id', chatRoom.id).eq('user_id', _me.id).maybeSingle();
            if (perm !== null && perm !== undefined) {
                canView = perm.can_view;
                canChat = perm.can_chat;
            }
        } catch(e) { /* channel_permissions 테이블 없으면 기본 허용 */ }
    }
    _currentChatRoom._canView = canView;
    _currentChatRoom._canChat = canChat;

    const msgInput = document.getElementById('msg-input');
    const sendBtn = document.getElementById('send-btn');
    const attachBtn = document.querySelector('.attach-btn');
    const chatMessages = document.getElementById('chat-messages');

    if (canChat) {
        msgInput.disabled = false;
        msgInput.placeholder = `#${chatRoom.name}에 메시지 보내기`;
        msgInput.style.opacity = '1';
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; }
        if (attachBtn) { attachBtn.disabled = false; attachBtn.style.opacity = '1'; attachBtn.style.pointerEvents = ''; }
    } else {
        msgInput.disabled = true;
        msgInput.placeholder = canView ? '이 방에서는 채팅을 보낼 수 없어요.' : '이 방에 접근 권한이 없어요.';
        msgInput.style.opacity = '0.5';
        if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.5'; }
        if (attachBtn) { attachBtn.disabled = true; attachBtn.style.opacity = '0.5'; attachBtn.style.pointerEvents = 'none'; }
    }

    // 볼 권한 없으면 메시지 영역 잠금 표시
    if (!canView) {
        chatMessages.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--text-3);">
                <span class="material-symbols-rounded" style="font-size:48px;">lock</span>
                <p style="font-size:0.9rem;">이 방의 메시지를 볼 권한이 없어요.</p>
            </div>`;
        subscribeToChatRoom(chatRoom.id);
        loadRoomMembers(_currentServer.id);
        return;
    }

    await loadMessages(chatRoom.id);
    subscribeToChatRoom(chatRoom.id);
    loadRoomMembers(_currentServer.id);

    // 읽음 처리 - last_read_at 업데이트 후 뱃지 갱신
    await supabase.from('room_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('room_id', _currentServer.id).eq('user_id', _me.id);
    checkMsgBadge(_me.id);
}

/* ─────────────────────────────────────────
   방 컨텍스트 메뉴 (알림 토글 + 방장 전용)
───────────────────────────────────────── */
let _roomMenuEl = null;
function openChatRoomMenu(cr, channelId, isOwner, btn) {
    if (_roomMenuEl) { _roomMenuEl.remove(); _roomMenuEl = null; }
    const rect = btn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'ch-context-menu';
    menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:2000;`;
    const isMuted = _mutedRooms.has(cr.id);
    menu.innerHTML = `
        <button class="ch-menu-item" data-action="mute">
            <span class="material-symbols-rounded">${isMuted ? 'notifications' : 'notifications_off'}</span>
            ${isMuted ? '알림 받기' : '알림 해제'}
        </button>
        ${isOwner ? `
        <div class="ch-menu-divider"></div>
        <button class="ch-menu-item" data-action="settings">
            <span class="material-symbols-rounded">settings</span>방 설정
        </button>
        <button class="ch-menu-item danger" data-action="delete">
            <span class="material-symbols-rounded">delete</span>방 삭제
        </button>` : ''}`;

    menu.querySelectorAll('.ch-menu-item').forEach(item => {
        item.addEventListener('click', async () => {
            const action = item.dataset.action;
            menu.remove(); _roomMenuEl = null;
            if (action === 'mute') {
                if (_mutedRooms.has(cr.id)) {
                    _mutedRooms.delete(cr.id);
                    showToast(`#${cr.name} 알림이 켜졌어요.`);
                } else {
                    _mutedRooms.add(cr.id);
                    showToast(`#${cr.name} 알림이 해제됐어요.`);
                }
                localStorage.setItem(`mutedRooms_${_me.id}`, JSON.stringify([..._mutedRooms]));
                await loadChatRoomList(channelId, isOwner);
            } else if (action === 'settings') {
                openChatRoomSettings(cr, channelId);
            } else if (action === 'delete') {
                if (confirm(`"${cr.name}" 방을 삭제할까요? 채팅 내역도 모두 삭제됩니다.`)) {
                    await supabase.from('messages').delete().eq('channel_id', cr.id);
                    await supabase.from('channel_rooms').delete().eq('id', cr.id);
                    if (_currentChatRoom?.id === cr.id) {
                        document.getElementById('chat-welcome').style.display = 'flex';
                        document.getElementById('chat-room').style.display = 'none';
                        _currentChatRoom = null;
                    }
                    await loadChatRoomList(channelId, isOwner);
                }
            }
        });
    });

    document.body.appendChild(menu);
    _roomMenuEl = menu;
    setTimeout(() => document.addEventListener('click', () => { menu.remove(); _roomMenuEl = null; }, { once: true }), 0);
}

/* ─────────────────────────────────────────
   방 설정 모달
───────────────────────────────────────── */
async function openChatRoomSettings(cr, channelId) {
    let modal = document.getElementById('chat-room-settings-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'chat-room-settings-modal';
        modal.className = 'modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
        <div class="modal modal-wide">
            <div class="modal-header">
                <h3 id="cr-settings-title">방 설정</h3>
                <button class="icon-btn" id="close-cr-settings"><span class="material-symbols-rounded">close</span></button>
            </div>
            <div class="modal-body">
                <label class="modal-label">방 사진</label>
                <label for="cr-settings-img-file" class="room-img-upload-label" id="cr-settings-img-label">
                    <span class="material-symbols-rounded">add_photo_alternate</span><span>사진 추가</span>
                </label>
                <input type="file" id="cr-settings-img-file" accept="image/*" style="display:none;">

                <label class="modal-label" style="margin-top:16px;">방 이름 <span style="color:var(--primary)">*</span></label>
                <input type="text" id="cr-settings-name" class="modal-input" maxlength="20" placeholder="방 이름">

                <div class="modal-section-title" style="margin-top:20px;">채팅 볼 수 있는 멤버</div>
                <p class="modal-section-desc">선택하지 않으면 전체 공개</p>
                <div style="display:flex;gap:8px;margin-bottom:8px;">
                    <button class="btn-secondary btn-sm" id="cr-perm-view-all">전체 선택</button>
                    <button class="btn-secondary btn-sm" id="cr-perm-view-none">전체 해제</button>
                </div>
                <ul id="cr-perm-view-list" class="perm-member-list"></ul>

                <div class="modal-section-title" style="margin-top:20px;">채팅 칠 수 있는 멤버</div>
                <p class="modal-section-desc">선택하지 않으면 전체 허용</p>
                <div style="display:flex;gap:8px;margin-bottom:8px;">
                    <button class="btn-secondary btn-sm" id="cr-perm-chat-all">전체 선택</button>
                    <button class="btn-secondary btn-sm" id="cr-perm-chat-none">전체 해제</button>
                </div>
                <ul id="cr-perm-chat-list" class="perm-member-list"></ul>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" id="cancel-cr-settings">취소</button>
                <button class="btn-primary" id="confirm-cr-settings">저장</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        document.getElementById('close-cr-settings').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('cancel-cr-settings').addEventListener('click', () => modal.style.display = 'none');
        document.getElementById('confirm-cr-settings').addEventListener('click', () => saveChatRoomSettings(channelId));
        document.getElementById('cr-settings-img-file').addEventListener('change', e => {
            const file = e.target.files[0]; if (!file) return;
            modal._imgFile = file;
            const url = URL.createObjectURL(file);
            document.getElementById('cr-settings-img-label').innerHTML = `<img src="${url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;"><span>변경</span>`;
        });
        modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    }

    modal._cr = cr;
    modal._channelId = channelId;
    modal._imgFile = null;

    document.getElementById('cr-settings-title').textContent = `#${cr.name} 방 설정`;
    document.getElementById('cr-settings-name').value = cr.name;

    const imgLabel = document.getElementById('cr-settings-img-label');
    if (cr.image_url) {
        imgLabel.innerHTML = `<img src="${cr.image_url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;"><span>변경</span>`;
    } else {
        imgLabel.innerHTML = '<span class="material-symbols-rounded">add_photo_alternate</span><span>사진 추가</span>';
    }

    // 멤버 로드
    const { data: members } = await supabase.from('room_members')
        .select('user_id, profiles(username, avatar_url)').eq('room_id', _currentServer.id);

    // 기존 권한 로드
    const { data: permData } = await supabase.from('channel_permissions')
        .select('*').eq('channel_id', cr.id);
    const viewSet = new Set((permData || []).filter(p => p.can_view).map(p => p.user_id));
    const chatSet = new Set((permData || []).filter(p => p.can_chat).map(p => p.user_id));
    modal._viewSet = viewSet;
    modal._chatSet = chatSet;

    function renderList(listId, set, allBtnId, noneBtnId) {
        const list = document.getElementById(listId);
        list.innerHTML = '';
        (members || []).forEach(m => {
            const uname = m.profiles?.username || m.user_id.slice(0, 8);
            const avatar = m.profiles?.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${m.user_id}`;
            const isSelected = set.has(m.user_id);
            const li = document.createElement('li');
            li.className = `perm-member-item${isSelected ? ' selected' : ''}`;
            li.innerHTML = `<img src="${avatar}" class="invite-avatar"><span class="invite-username">${escapeHtml(uname)}${m.user_id === _me.id ? ' (나)' : ''}</span>${isSelected ? '<span class="material-symbols-rounded invite-check">check_circle</span>' : ''}`;
            li.addEventListener('click', () => {
                if (set.has(m.user_id)) set.delete(m.user_id); else set.add(m.user_id);
                renderList(listId, set, allBtnId, noneBtnId);
            });
            list.appendChild(li);
        });
        document.getElementById(allBtnId).onclick = () => { (members || []).forEach(m => set.add(m.user_id)); renderList(listId, set, allBtnId, noneBtnId); };
        document.getElementById(noneBtnId).onclick = () => { set.clear(); renderList(listId, set, allBtnId, noneBtnId); };
    }

    renderList('cr-perm-view-list', viewSet, 'cr-perm-view-all', 'cr-perm-view-none');
    renderList('cr-perm-chat-list', chatSet, 'cr-perm-chat-all', 'cr-perm-chat-none');
    modal.style.display = 'flex';
}

async function saveChatRoomSettings(channelId) {
    const modal = document.getElementById('chat-room-settings-modal');
    const cr = modal._cr;
    const name = document.getElementById('cr-settings-name').value.trim();
    if (!name) { alert('방 이름을 입력해주세요'); return; }

    let imageUrl = cr.image_url || null;
    if (modal._imgFile) {
        const ext = modal._imgFile.name.split('.').pop();
        const fileName = `chatrooms/${_me.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('post-images').upload(fileName, modal._imgFile, { upsert: false });
        if (!upErr) {
            const { data: pub } = supabase.storage.from('post-images').getPublicUrl(fileName);
            imageUrl = pub.publicUrl;
        }
    }

    await supabase.from('channel_rooms').update({ name, image_url: imageUrl }).eq('id', cr.id);

    // 권한 저장
    // viewSet/chatSet이 비어있으면 전체공개 (레코드 삭제 = 전체허용)
    // 비어있지 않으면 선택된 멤버만 저장
    try {
        await supabase.from('channel_permissions').delete().eq('channel_id', cr.id);
        const { data: members } = await supabase.from('room_members').select('user_id').eq('room_id', _currentServer.id);
        
        // viewSet, chatSet이 둘 다 비어있으면 권한 레코드 저장 안 해도 됨 (전체공개 기본값)
        const hasViewRestriction = modal._viewSet.size > 0;
        const hasChatRestriction = modal._chatSet.size > 0;
        
        if (hasViewRestriction || hasChatRestriction) {
            const permInserts = (members || []).map(m => ({
                channel_id: cr.id,
                user_id: m.user_id,
                can_view: hasViewRestriction ? modal._viewSet.has(m.user_id) : true,
                can_chat: hasChatRestriction ? modal._chatSet.has(m.user_id) : true
            }));
            if (permInserts.length > 0) {
                const { error: permErr } = await supabase.from('channel_permissions').insert(permInserts);
                if (permErr) {
                    console.error('권한 저장 실패:', permErr);
                    showToast('권한 저장에 실패했어요. channel_permissions 테이블을 확인해주세요.');
                }
            }
        }
    } catch(e) {
        console.error('권한 처리 오류:', e);
        showToast('권한 처리 중 오류가 발생했어요.');
    }

    modal.style.display = 'none';
    showToast(`#${name} 방 설정이 저장됐어요.`);
    await loadChatRoomList(channelId, true);
}

/* ─────────────────────────────────────────
   방 추가 모달 (500루나)
───────────────────────────────────────── */
let _addRoomTargetChannel = null;

function openAddChatRoomModal(ch) {
    _addRoomTargetChannel = ch;
    document.getElementById('add-chatroom-name').value = '';
    document.getElementById('add-chatroom-modal').style.display = 'flex';
}

async function addChatRoom() {
    const name = document.getElementById('add-chatroom-name').value.trim();
    if (!name) { alert('방 이름을 입력해주세요'); return; }
    if (!_addRoomTargetChannel) return;

    const COST = 500;
    const { data: tokenData } = await supabase.from('user_tokens').select('amount').eq('user_id', _me.id).single();
    const myTokens = tokenData?.amount ?? 0;
    if (myTokens < COST) {
        alert(`방 추가에는 ${COST} 루나가 필요해요. (보유: ${myTokens} 루나)`);
        return;
    }
    if (!confirm(`방 추가에 ${COST} 루나가 소모됩니다. 계속할까요?`)) return;

    const confirmBtn = document.getElementById('confirm-add-chatroom');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '추가 중...';

    const { error } = await supabase.from('channel_rooms').insert({
        channel_id: _addRoomTargetChannel.id,
        name,
        created_by: _me.id
    });

    if (error) {
        alert('방 추가 실패: ' + error.message);
        confirmBtn.disabled = false;
        confirmBtn.textContent = '추가';
        return;
    }

    await supabase.from('user_tokens').update({ amount: myTokens - COST }).eq('user_id', _me.id);

    // 모달 닫기
    document.getElementById('add-chatroom-modal').style.display = 'none';
    confirmBtn.disabled = false;
    confirmBtn.textContent = '추가';

    showToast(`#${name} 방이 추가됐어요! (${COST} 루나 소모)`);

    // 새로고침 없이 즉시 반영
    await loadChatRoomList(_addRoomTargetChannel.id, true);
}

/* ─────────────────────────────────────────
   채널 추가 (1500루나)
───────────────────────────────────────── */
async function addChannelWithToken() {
    const name = document.getElementById('channel-name-input').value.trim();
    if (!name || !_currentServer) { alert('채널 이름을 입력해주세요'); return; }

    const COST = 1500;
    const { data: tokenData } = await supabase.from('user_tokens').select('amount').eq('user_id', _me.id).single();
    const myTokens = tokenData?.amount ?? 0;
    if (myTokens < COST) {
        alert(`채널 추가에는 ${COST} 루나가 필요해요. (보유: ${myTokens} 루나)`);
        return;
    }
    if (!confirm(`채널 추가에 ${COST} 루나가 소모됩니다. 계속할까요?`)) return;

    const confirmBtn = document.getElementById('confirm-add-channel');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '추가 중...';

    const { data: newCh, error: chErr } = await supabase.from('message_channels')
        .insert({ room_id: _currentServer.id, name, created_by: _me.id })
        .select().single();

    if (chErr || !newCh) {
        alert('채널 추가 실패');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '추가';
        return;
    }

    // 기본 방 1개 자동 생성
    await supabase.from('channel_rooms').insert({
        channel_id: newCh.id,
        name: '일반',
        created_by: _me.id
    });

    await supabase.from('user_tokens').update({ amount: myTokens - COST }).eq('user_id', _me.id);

    document.getElementById('add-channel-modal').style.display = 'none';
    document.getElementById('channel-name-input').value = '';
    confirmBtn.disabled = false;
    confirmBtn.textContent = '추가';

    showToast(`#${name} 채널이 추가됐어요! (${COST} 루나 소모)`);
    await loadChannelList(_currentServer.id, true);
}

/* ─────────────────────────────────────────
   채널 컨텍스트 메뉴
───────────────────────────────────────── */
let _menuEl = null;
function openChannelMenu(ch, isOwner, btn, serverId) {
    if (_menuEl) { _menuEl.remove(); _menuEl = null; }
    const rect = btn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'ch-context-menu';
    menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:2000;`;
    menu.innerHTML = `
        ${isOwner ? `
        <button class="ch-menu-item" data-action="rename">
            <span class="material-symbols-rounded">edit</span>채널 이름 변경
        </button>
        <button class="ch-menu-item danger" data-action="delete">
            <span class="material-symbols-rounded">delete</span>채널 삭제
        </button>` : ''}`;

    menu.querySelectorAll('.ch-menu-item').forEach(item => {
        item.addEventListener('click', async () => {
            const action = item.dataset.action;
            menu.remove(); _menuEl = null;
            if (action === 'rename') {
                const newName = prompt('새 채널 이름:', ch.name);
                if (newName && newName.trim()) {
                    await supabase.from('message_channels').update({ name: newName.trim() }).eq('id', ch.id);
                    await loadChannelList(serverId, true);
                }
            } else if (action === 'delete') {
                if (confirm(`"${ch.name}" 채널을 삭제할까요? 안의 방과 채팅도 모두 삭제됩니다.`)) {
                    // 채널 안 방들 먼저 삭제
                    const { data: crs } = await supabase.from('channel_rooms').select('id').eq('channel_id', ch.id);
                    for (const cr of (crs || [])) {
                        await supabase.from('messages').delete().eq('channel_id', cr.id);
                    }
                    await supabase.from('channel_rooms').delete().eq('channel_id', ch.id);
                    await supabase.from('message_channels').delete().eq('id', ch.id);
                    await loadChannelList(serverId, true);
                    document.getElementById('chat-welcome').style.display = 'flex';
                    document.getElementById('chat-room').style.display = 'none';
                }
            }
        });
    });

    document.body.appendChild(menu);
    _menuEl = menu;
    setTimeout(() => document.addEventListener('click', () => { menu.remove(); _menuEl = null; }, { once: true }), 0);
}

/* ─────────────────────────────────────────
   채팅방 만들기 (무료)
───────────────────────────────────────── */
async function createRoom() {
    const name = document.getElementById('room-name-input').value.trim();
    if (!name) { alert('방 이름을 입력해주세요'); return; }

    const confirmBtn = document.getElementById('confirm-create-room');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '만드는 중...';

    const memberIds = [..._selectedInviteIds, _me.id];

    let imageUrl = null;
    if (_selectedServerImgFile) {
        const ext = _selectedServerImgFile.name.split('.').pop();
        const fileName = `rooms/${_me.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('post-images').upload(fileName, _selectedServerImgFile, { upsert: false });
        if (!upErr) {
            const { data: pub } = supabase.storage.from('post-images').getPublicUrl(fileName);
            imageUrl = pub.publicUrl;
        }
    }

    const { data: room, error } = await supabase.from('message_rooms')
        .insert({ name, type: 'room', created_by: _me.id, member_count: memberIds.length, image_url: imageUrl })
        .select().single();

    if (error || !room) {
        alert('방 만들기 실패');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '방 만들기';
        return;
    }

    const memberInserts = memberIds.map(uid => ({ room_id: room.id, user_id: uid }));
    await supabase.from('room_members').insert(memberInserts);

    // 기본 채널 "일반" 1개 자동 생성
    const { data: newCh } = await supabase.from('message_channels')
        .insert({ room_id: room.id, name: '일반', created_by: _me.id })
        .select().single();

    // 기본 채널 안에 방 "일반채팅" 1개 자동 생성
    if (newCh) {
        await supabase.from('channel_rooms').insert({
            channel_id: newCh.id,
            name: '일반채팅',
            created_by: _me.id
        });
    }

    document.getElementById('create-room-modal').style.display = 'none';
    confirmBtn.disabled = false;
    confirmBtn.textContent = '방 만들기';

    await loadServerList();
    openServerView({ ...room, image_url: imageUrl });
}

/* ─────────────────────────────────────────
   메시지 로드 (room_id + channel_id 기반)
   channel_rooms.id를 channel_id로, message_rooms.id를 room_id로 사용
───────────────────────────────────────── */
async function loadMessages(chatRoomId) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="messages-loader"><span class="material-symbols-rounded animation-spin">sync</span></div>';

    if (!chatRoomId) { container.innerHTML = ''; renderChatStartNotice(container); return; }

    // channel_rooms.id를 channel_id 컬럼에 저장해서 구분
    const { data: messages } = await supabase
        .from('messages')
        .select('*, profiles(id, username, avatar_url)')
        .eq('channel_id', chatRoomId)
        .order('created_at', { ascending: true })
        .limit(100);

    container.innerHTML = '';
    renderChatStartNotice(container);
    if (messages && messages.length > 0) renderMessages(container, messages);
    container.scrollTop = container.scrollHeight;
}

function renderChatStartNotice(container) {
    const notice = document.createElement('div');
    notice.className = 'chat-start-notice';
    if (_currentChatRoom) {
        notice.innerHTML = `<h3># ${escapeHtml(_currentChatRoom.name)}</h3>
            <p>${escapeHtml(_currentServer?.name || '')} › ${escapeHtml(_currentChannel?.name || '')} 채널의 시작입니다.</p>`;
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
function subscribeToChatRoom(chatRoomId) {
    if (_realtimeChannel) { supabase.removeChannel(_realtimeChannel); _realtimeChannel = null; }
    _realtimeChannel = supabase.channel(`cr-${chatRoomId}-${Date.now()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${chatRoomId}` }, async (payload) => {
            const msg = payload.new;
            if (msg.user_id === _me.id) return;
            if (_mutedRooms.has(chatRoomId)) return;
            // 볼 권한 없으면 실시간 메시지도 표시하지 않음
            if (_currentChatRoom?._canView === false) return;
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

// 권한 변경 실시간 감지 — channel_permissions INSERT/UPDATE/DELETE 시 즉시 반영
function subscribeToPermissions() {
    supabase.channel(`perms-${_me.id}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'channel_permissions',
            filter: `user_id=eq.${_me.id}`
        }, async (payload) => {
            // 현재 열려있는 방의 권한이 바뀐 경우 즉시 재적용
            if (_currentChatRoom && payload.new?.channel_id === _currentChatRoom.id) {
                await openChatRoom(_currentChatRoom, _currentChannel?.id);
            }
            // 사이드바 방 목록도 갱신
            if (_currentServer) {
                const isOwner = _currentServer.created_by === _me.id;
                const { data: channels } = await supabase
                    .from('message_channels').select('id').eq('room_id', _currentServer.id);
                for (const ch of (channels || [])) {
                    await loadChatRoomList(ch.id, isOwner);
                }
            }
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

    if (!_currentChatRoom && !_currentServer) return;

    // 채팅 권한 체크
    if (_currentChatRoom && _currentChatRoom._canChat === false) {
        showToast('이 방에서는 채팅을 보낼 수 없어요.');
        return;
    }

    input.value = '';
    input.style.height = 'auto';

    const insertData = { user_id: _me.id, content };
    if (_currentChatRoom) {
        // channel_id = channel_rooms.id (FK: channel_rooms 참조)
        insertData.channel_id = _currentChatRoom.id;
        insertData.room_id = _currentServer?.id;
    } else if (_currentServer) {
        insertData.room_id = _currentServer.id;
    }

    const { error: msgErr } = await supabase.from('messages').insert(insertData);
    if (msgErr) {
        console.error('메시지 전송 실패:', msgErr);
        showToast('메시지 전송에 실패했어요. (' + msgErr.code + ')');
        // 실패 시 입력값 복원
        input.value = content;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 140) + 'px';
        return;
    }

    // 즉시 화면에 표시 (성공 후)
    const fakeMsg = {
        id: 'temp_' + Date.now(),
        user_id: _me.id,
        content,
        created_at: new Date().toISOString(),
        profiles: { id: _me.id, username: _myProfile?.username || _me.email.split('@')[0], avatar_url: _myProfile?.avatar_url }
    };
    appendNewMessage(fakeMsg);

    if (_currentServer) await supabase.from('message_rooms').update({ updated_at: new Date().toISOString() }).eq('id', _currentServer.id);
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
   방 설정 저장 (모달)
───────────────────────────────────────── */
async function saveRoomSettings() {
    if (!_currentServer) return;
    const name = document.getElementById('settings-name-input').value.trim();
    if (!name) { alert('방 이름을 입력해주세요'); return; }

    let imageUrl = _currentServer.image_url;
    if (_selectedSettingsImgFile) {
        const ext = _selectedSettingsImgFile.name.split('.').pop();
        const fileName = `rooms/${_me.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('post-images').upload(fileName, _selectedSettingsImgFile, { upsert: false });
        if (!upErr) {
            const { data: pub } = supabase.storage.from('post-images').getPublicUrl(fileName);
            imageUrl = pub.publicUrl;
        }
    }

    await supabase.from('message_rooms').update({ name, image_url: imageUrl }).eq('id', _currentServer.id);
    _currentServer = { ..._currentServer, name, image_url: imageUrl };
    document.getElementById('room-settings-modal').style.display = 'none';
    await loadServerList();
    openServerView(_currentServer);
}

/* ─────────────────────────────────────────
   DM
───────────────────────────────────────── */
async function openDmRoom(room, meta) {
    _currentServer = { ...room, ...meta, type: 'dm' };
    _currentChannel = null;
    _currentChatRoom = null;

    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`[data-room-id="${room.id}"]`);
    if (activeEl) activeEl.classList.add('active');

    document.getElementById('chat-welcome').style.display = 'none';
    const chatRoomEl = document.getElementById('chat-room');
    chatRoomEl.style.display = 'flex';

    const avatarEl = document.getElementById('chat-room-avatar');
    if (meta.avatar) { avatarEl.src = meta.avatar; avatarEl.style.display = 'block'; }
    else { avatarEl.style.display = 'none'; }
    document.getElementById('chat-channel-hash').style.display = 'none';
    document.getElementById('chat-room-name').textContent = meta.name;
    document.getElementById('chat-room-sub').textContent = '다이렉트 메시지';
    document.getElementById('msg-input').placeholder = `${meta.name}에게 메시지 보내기`;
    document.getElementById('members-panel').style.display = 'none';

    await loadMessages(null);
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
    _currentServer = null;
    _currentChannel = null;
    _currentChatRoom = null;
}

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
    const { data: newRoom, error } = await supabase.from('message_rooms')
        .insert({ name: `dm_${_me.id}_${user.id}`, type: 'dm', created_by: _me.id, member_count: 2 })
        .select().single();
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
    try {
        // 1. 내가 속한 방 + 마지막 읽은 시각
        const { data: memberships } = await supabase
            .from('room_members').select('room_id, last_read_at').eq('user_id', userId);
        if (!memberships || memberships.length === 0) { badge.style.display = 'none'; return; }

        // 2. 내가 볼 권한이 막힌 channel_rooms id 목록
        const { data: blockedPerms } = await supabase
            .from('channel_permissions').select('channel_id')
            .eq('user_id', userId).eq('can_view', false);
        const blockedIds = new Set((blockedPerms || []).map(p => p.channel_id));

        // 3. 각 방별로 last_read_at 이후 볼 수 있는 방의 미읽음 메시지 카운트
        let unread = 0;
        for (const m of memberships) {
            const since = m.last_read_at || '1970-01-01T00:00:00Z';

            // 이 room에 속한 channel_rooms 중 볼 수 있는 것만
            const { data: channels } = await supabase
                .from('message_channels').select('id').eq('room_id', m.room_id);
            const channelIds = (channels || []).map(c => c.id);
            if (channelIds.length === 0) continue;

            const { data: chatRooms } = await supabase
                .from('channel_rooms').select('id').in('channel_id', channelIds);
            const visibleIds = (chatRooms || []).map(cr => cr.id).filter(id => !blockedIds.has(id));
            if (visibleIds.length === 0) continue;

            const { count } = await supabase.from('messages')
                .select('*', { count: 'exact', head: true })
                .in('channel_id', visibleIds)
                .neq('user_id', userId)
                .gt('created_at', since);
            unread += count || 0;
        }

        badge.textContent = unread > 9 ? '9+' : unread;
        badge.style.display = unread > 0 ? 'flex' : 'none';
    } catch(e) {
        console.warn('checkMsgBadge 오류:', e);
    }
}

/* ─────────────────────────────────────────
   이미지 업로드
───────────────────────────────────────── */
async function uploadChatImage(file) {
    if (!_me || !_currentChatRoom) return;
    if (_currentChatRoom._canChat === false) { showToast('이 방에서는 파일을 보낼 수 없어요.'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('10MB 이하 이미지만 가능합니다.'); return; }
    const ext = file.name.split('.').pop();
    const fileName = `chat/${_me.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('post-images').upload(fileName, file, { upsert: false });
    if (error) { alert('이미지 업로드 실패'); return; }
    const { data: pub } = supabase.storage.from('post-images').getPublicUrl(fileName);
    const insertData = {
        user_id: _me.id,
        content: `![이미지](${pub.publicUrl})`,
        channel_id: _currentChatRoom.id,
        room_id: _currentServer?.id
    };
    await supabase.from('messages').insert(insertData);
}

/* ─────────────────────────────────────────
   이벤트 바인딩
───────────────────────────────────────── */
function bindEvents() {
    document.getElementById('server-home-btn').addEventListener('click', switchToDmView);

    // 새 채팅방 (무료)
    document.getElementById('new-room-btn').addEventListener('click', () => {
        _selectedInviteIds.clear();
        _selectedServerImgFile = null;
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
    document.getElementById('room-img-file').addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        _selectedServerImgFile = file;
        const url = URL.createObjectURL(file);
        document.getElementById('room-img-label').innerHTML = `<img src="${url}"><span>변경</span>`;
    });

    // 방 설정
    document.getElementById('room-settings-btn').addEventListener('click', () => {
        if (!_currentServer) return;
        document.getElementById('settings-name-input').value = _currentServer.name;
        _selectedSettingsImgFile = null;
        const label = document.getElementById('settings-img-label');
        if (_currentServer.image_url) label.innerHTML = `<img src="${_currentServer.image_url}"><span>변경</span>`;
        else label.innerHTML = '<span class="material-symbols-rounded">add_photo_alternate</span><span>사진 변경</span>';
        document.getElementById('room-settings-modal').style.display = 'flex';
    });
    document.getElementById('close-settings-modal').addEventListener('click', () => document.getElementById('room-settings-modal').style.display = 'none');
    document.getElementById('cancel-settings-modal').addEventListener('click', () => document.getElementById('room-settings-modal').style.display = 'none');
    document.getElementById('confirm-settings').addEventListener('click', saveRoomSettings);
    document.getElementById('settings-img-file').addEventListener('change', e => {
        const file = e.target.files[0]; if (!file) return;
        _selectedSettingsImgFile = file;
        const url = URL.createObjectURL(file);
        document.getElementById('settings-img-label').innerHTML = `<img src="${url}"><span>변경</span>`;
    });

    // 채널 추가 (1500루나)
    document.getElementById('add-channel-btn').addEventListener('click', () => {
        document.getElementById('channel-name-input').value = '';
        document.getElementById('add-channel-modal').style.display = 'flex';
    });
    document.getElementById('close-channel-modal').addEventListener('click', () => document.getElementById('add-channel-modal').style.display = 'none');
    document.getElementById('cancel-channel-modal').addEventListener('click', () => document.getElementById('add-channel-modal').style.display = 'none');
    document.getElementById('confirm-add-channel').addEventListener('click', addChannelWithToken);

    // 방 추가 모달 (500루나)
    document.getElementById('close-chatroom-modal').addEventListener('click', () => document.getElementById('add-chatroom-modal').style.display = 'none');
    document.getElementById('cancel-chatroom-modal').addEventListener('click', () => document.getElementById('add-chatroom-modal').style.display = 'none');
    document.getElementById('confirm-add-chatroom').addEventListener('click', addChatRoom);

    // DM
    document.getElementById('new-dm-btn').addEventListener('click', openNewDmModal);
    document.getElementById('start-chat-btn').addEventListener('click', openNewDmModal);
    document.getElementById('close-dm-modal').addEventListener('click', () => document.getElementById('new-dm-modal').style.display = 'none');
    document.getElementById('dm-user-search').addEventListener('input', e => renderDmUserList(e.target.value));

    // 모달 외부 클릭
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
    });

    // 메시지 전송
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById('msg-input').addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 140) + 'px';
    });

    // 이미지 첨부
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    document.querySelector('.attach-btn')?.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) uploadChatImage(e.target.files[0]);
        fileInput.value = '';
    });

    // 멤버 패널 토글
    document.getElementById('members-btn').addEventListener('click', () => {
        const panel = document.getElementById('members-panel');
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) panel.style.flexDirection = 'column';
        if (isHidden && _currentServer?.id) loadRoomMembers(_currentServer.id);
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
function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'ug-toast'; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
}
