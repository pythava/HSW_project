/* js/badge-logic.js — 모든 페이지 공통 알림/메시지 뱃지 + 실시간 구독 */

(async function initBadges() {
    // supabase가 로드될 때까지 대기
    if (typeof supabase === 'undefined') return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // ── 알림 뱃지 ──
    async function updateNotiBadge() {
        const badge = document.getElementById('nav-noti-badge');
        if (!badge) return;
        const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false);
        badge.textContent = count > 9 ? '9+' : (count || 0);
        badge.style.display = count > 0 ? 'flex' : 'none';
    }

    // ── 메시지 뱃지 ──
    async function updateMsgBadge() {
        const badge = document.getElementById('nav-msg-badge');
        if (!badge) return;
        try {
            const { data: memberships } = await supabase
                .from('room_members')
                .select('room_id, last_read_at')
                .eq('user_id', user.id);
            if (!memberships || memberships.length === 0) {
                badge.style.display = 'none';
                return;
            }

            let unread = 0;
            for (const m of memberships) {
                const since = m.last_read_at || (() => {
                    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString();
                })();

                // channel_rooms 기반 메시지 카운트
                const { data: channels } = await supabase
                    .from('message_channels').select('id').eq('room_id', m.room_id);
                const channelIds = (channels || []).map(c => c.id);
                if (channelIds.length === 0) continue;

                const { data: chatRooms } = await supabase
                    .from('channel_rooms').select('id').in('channel_id', channelIds);
                const chatRoomIds = (chatRooms || []).map(cr => cr.id);
                if (chatRoomIds.length === 0) continue;

                const { count } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .in('channel_id', chatRoomIds)
                    .neq('user_id', user.id)
                    .gt('created_at', since);
                unread += count || 0;
            }

            badge.textContent = unread > 9 ? '9+' : unread;
            badge.style.display = unread > 0 ? 'flex' : 'none';
        } catch (e) {
            console.warn('badge-logic 오류:', e);
        }
    }

    // 전역 노출 (다른 스크립트에서 즉시 갱신 가능)
    window.updateMsgBadgeGlobal = updateMsgBadge;
    window.updateNotiBadgeGlobal = updateNotiBadge;

    // 초기 로드
    await updateNotiBadge();
    await updateMsgBadge();

    // 실시간 구독 - 새 메시지 오면 즉시 뱃지 갱신
    supabase.channel(`badge-msgs-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, updateMsgBadge)
        .subscribe();

    // 실시간 구독 - 새 알림 오면 즉시 뱃지 갱신
    supabase.channel(`badge-notis-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, updateNotiBadge)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, updateNotiBadge)
        .subscribe();
})();
