/**
 * UnderGarden Write Logic — 수정 모드 지원 버전
 */

document.addEventListener('DOMContentLoaded', () => {
    const editor       = document.getElementById('editor');
    const preview      = document.getElementById('preview');
    const tabs         = document.querySelectorAll('.tab-item');
    const tabPanes     = document.querySelectorAll('.tab-pane');
    const imageInput   = document.getElementById('post-image-file');
    const imagePreview = document.getElementById('image-preview');
    const previewContainer = document.getElementById('image-preview-container');
    const removeImageBtn   = document.getElementById('remove-image-btn');
    const uploadLabel  = document.querySelector('.image-upload-label');
    const tagInput     = document.getElementById('tag-input');
    const tagList      = document.getElementById('tag-list');
    const submitBtn    = document.getElementById('submit-post');
    const postTitle    = document.getElementById('post-title');
    const pageTitle    = document.querySelector('.main-header h1');

    let tags = [];
    let isDirty = false;
    let editPostId = null;       // 수정 모드일 때 게시물 ID
    let existingImageUrl = null; // 기존 이미지 URL

    // ── 수정 모드 감지 및 데이터 로드 ──
    const params = new URLSearchParams(window.location.search);
    editPostId = params.get('edit');
    if (editPostId) {
        pageTitle.textContent   = 'EDIT SEED';
        submitBtn.textContent   = '수정 완료';
        loadExistingPost(editPostId);
    }

    async function loadExistingPost(postId) {
        submitBtn.disabled = true;
        try {
            const { data: post, error } = await supabase.from('posts').select('*').eq('id', postId).single();
            if (error || !post) throw new Error('게시물을 불러오지 못했어요.');

            // 내 게시물인지 확인
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || user.id !== post.user_id) {
                alert('수정 권한이 없습니다.');
                window.location.href = '../index.html';
                return;
            }

            // 기존 데이터 채우기
            postTitle.value  = post.title || '';
            editor.value     = post.content || '';
            existingImageUrl = post.image_url || null;

            // 기존 이미지 미리보기
            if (existingImageUrl) {
                imagePreview.src = existingImageUrl;
                previewContainer.style.display = 'block';
                uploadLabel.style.display = 'none';
            }

            // 기존 태그 복원
            (post.tags || []).forEach(val => addTag(val));

        } catch (err) {
            alert(err.message);
            window.location.href = '../index.html';
        } finally {
            submitBtn.disabled = false;
        }
    }

    // ── 탭 전환 ──
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabPanes.forEach(pane => {
                pane.classList.remove('active');
                if (pane.id === targetId) pane.classList.add('active');
            });
            if (targetId === 'preview-mode') renderMarkdown();
        });
    });

    function renderMarkdown() {
        const rawContent = editor.value;
        if (typeof marked !== 'undefined') {
            preview.innerHTML = marked.parse(rawContent || '*심연에 심을 내용이 비어있습니다.*');
        } else {
            preview.innerHTML = '<p style="color:var(--text-2)">marked.js 로드 중...</p>';
        }
    }

    // ── 마크다운 툴바 ──
    window.insertMarkdown = (prefix, suffix = '') => {
        const start    = editor.selectionStart;
        const end      = editor.selectionEnd;
        const text     = editor.value;
        const selected = text.substring(start, end);
        const before   = text.substring(0, start);
        const after    = text.substring(end);
        let newValue, newPos;

        if (suffix === '') {
            const lines = selected ? selected.split('\n').map(l => prefix + l).join('\n') : prefix;
            newValue = before + lines + after;
            newPos   = start + lines.length;
        } else {
            const wrapped = prefix + selected + suffix;
            newValue = before + wrapped + after;
            newPos   = selected ? start + wrapped.length : start + prefix.length;
        }

        editor.value = newValue;
        editor.setSelectionRange(newPos, newPos);
        editor.focus();
        isDirty = true;
        const activeTab = document.querySelector('.tab-item.active');
        if (activeTab && activeTab.dataset.tab === 'preview-mode') renderMarkdown();
    };

    document.querySelectorAll('.t-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            switch (action) {
                case 'h1': insertMarkdown('# '); break;
                case 'h2': insertMarkdown('## '); break;
                case 'h3': insertMarkdown('### '); break;
                case 'h4': insertMarkdown('#### '); break;
                case 'bold': insertMarkdown('**', '**'); break;
                case 'italic': insertMarkdown('*', '*'); break;
                case 'strike': insertMarkdown('~~', '~~'); break;
                case 'code': insertMarkdown('`', '`'); break;
                case 'codeblock': insertMarkdown('```\n', '\n```'); break;
                case 'quote': insertMarkdown('> '); break;
                case 'hr': insertMarkdown('\n---\n'); break;
                case 'ul': insertMarkdown('- '); break;
                case 'ol': insertMarkdown('1. '); break;
                case 'link':
                    const url = prompt('URL을 입력하세요:', 'https://');
                    if (url) insertMarkdown('[', `](${url})`);
                    break;
            }
        });
    });

    // ── 이미지 핸들링 ──
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            alert('파일이 너무 큽니다. 5MB 이하의 이미지만 가능합니다.');
            imageInput.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            imagePreview.src = event.target.result;
            previewContainer.style.display = 'block';
            uploadLabel.style.display = 'none';
            isDirty = true;
        };
        reader.readAsDataURL(file);
    });

    removeImageBtn.addEventListener('click', () => {
        imageInput.value = '';
        imagePreview.src = '';
        previewContainer.style.display = 'none';
        uploadLabel.style.display = 'flex';
        existingImageUrl = null; // 기존 이미지도 제거
    });

    // ── 태그 시스템 ──
    function addTag(val) {
        val = val.trim().replace(/#/g, '');
        if (!val || tags.includes(val) || tags.length >= 5) return;
        tags.push(val);
        const badge = document.createElement('div');
        badge.className = 'tag-badge';
        badge.innerHTML = `#${val} <span style="cursor:pointer;margin-left:6px;font-weight:bold;">×</span>`;
        badge.querySelector('span').addEventListener('click', () => {
            tags = tags.filter(t => t !== val);
            badge.remove();
        });
        tagList.appendChild(badge);
    }

    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = tagInput.value.trim();
            if (tags.length >= 5) { alert('태그는 최대 5개까지입니다.'); return; }
            addTag(val);
            tagInput.value = '';
            isDirty = true;
        }
    });

    // ── 제출 (신규 / 수정) ──
    submitBtn.addEventListener('click', async () => {
        const title   = postTitle.value.trim();
        const content = editor.value.trim();
        if (!title || !content) { alert('제목과 내용을 모두 작성해주세요.'); return; }

        submitBtn.disabled  = true;
        submitBtn.innerText = editPostId ? '수정 중...' : '가든에 씨앗 심는 중...';

        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) throw new Error('로그인이 필요합니다.');

            let finalImageUrl = existingImageUrl; // 기존 이미지 유지

            // 새 이미지가 선택됐으면 업로드
            const imageFile = imageInput.files[0];
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${user.id}/${Date.now()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('post-images')
                    .upload(fileName, imageFile, { cacheControl: '3600', upsert: false });
                if (uploadError) throw uploadError;
                const { data: publicUrlData } = supabase.storage.from('post-images').getPublicUrl(fileName);
                finalImageUrl = publicUrlData.publicUrl;
            }

            if (editPostId) {
                // ── 수정 모드 ──
                const { error: updateError } = await supabase
                    .from('posts')
                    .update({ title, content, image_url: finalImageUrl, tags, updated_at: new Date() })
                    .eq('id', editPostId);
                if (updateError) throw updateError;
                isDirty = false;
                alert('게시물이 수정됐어요!');
            } else {
                // ── 신규 작성 ──
                const { error: insertError } = await supabase
                    .from('posts')
                    .insert([{ user_id: user.id, title, content, image_url: finalImageUrl, tags, created_at: new Date() }]);
                if (insertError) throw insertError;

                // 팔로워들에게 알림
                const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', user.id);
                if (followers && followers.length > 0) {
                    const { data: myProfile } = await supabase.from('profiles').select('username').eq('id', user.id).single();
                    const notis = followers.map(f => ({
                        user_id: f.follower_id, type: 'post', actor_id: user.id,
                        message: `@${myProfile?.username || '누군가'}님이 새 게시물을 올렸어요: "${title.slice(0, 30)}${title.length > 30 ? '...' : ''}"`,
                        post_preview: title
                    }));
                    await supabase.from('notifications').insert(notis);
                }

                isDirty = false;
                alert('성공적으로 게시됐어요!');
            }

            window.location.href = '../index.html';

        } catch (err) {
            console.error('Submission Error:', err);
            alert('오류 발생: ' + err.message);
        } finally {
            submitBtn.disabled  = false;
            submitBtn.innerText = editPostId ? '수정 완료' : '씨앗 심기';
        }
    });

    editor.addEventListener('input', () => { isDirty = true; });
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    });
});
