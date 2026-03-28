/**
 * UnderGarden Write Logic — 다중 이미지 지원 버전
 */

document.addEventListener('DOMContentLoaded', () => {
    const editor       = document.getElementById('editor');
    const preview      = document.getElementById('preview');
    const tabs         = document.querySelectorAll('.tab-item');
    const tabPanes     = document.querySelectorAll('.tab-pane');
    const imageInput   = document.getElementById('post-image-file');
    const uploadLabelBtn = document.getElementById('upload-label-btn');
    const multiPreview = document.getElementById('multi-image-preview');
    const imageThumbs  = document.getElementById('image-thumbs');
    const tagInput     = document.getElementById('tag-input');
    const tagList      = document.getElementById('tag-list');
    const submitBtn    = document.getElementById('submit-post');
    const postTitle    = document.getElementById('post-title');
    const pageTitle    = document.querySelector('.main-header h1');

    let tags = [];
    let isDirty = false;
    let editPostId = null;
    let existingImageUrls = [];
    let newImageFiles = [];

    const params = new URLSearchParams(window.location.search);
    editPostId = params.get('edit');
    if (editPostId) {
        pageTitle.textContent = 'EDIT SEED';
        submitBtn.textContent = '수정 완료';
        loadExistingPost(editPostId);
    }

    async function loadExistingPost(postId) {
        submitBtn.disabled = true;
        try {
            const { data: post, error } = await supabase.from('posts').select('*').eq('id', postId).single();
            if (error || !post) throw new Error('게시물을 불러오지 못했어요.');
            const { data: { user } } = await supabase.auth.getUser();
            if (!user || user.id !== post.user_id) {
                alert('수정 권한이 없습니다.');
                window.location.href = '../index.html';
                return;
            }
            postTitle.value = post.title || '';
            editor.value = post.content || '';
            if (post.image_urls && post.image_urls.length > 0) {
                existingImageUrls = post.image_urls;
            } else if (post.image_url) {
                existingImageUrls = [post.image_url];
            }
            if (existingImageUrls.length > 0) renderThumbs();
            (post.tags || []).forEach(val => addTag(val));
        } catch (err) {
            alert(err.message);
            window.location.href = '../index.html';
        } finally {
            submitBtn.disabled = false;
        }
    }

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
        if (typeof marked !== 'undefined') {
            preview.innerHTML = marked.parse(editor.value || '*내용이 비어있습니다.*');
        }
    }

    window.insertMarkdown = (prefix, suffix = '') => {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const text = editor.value;
        const selected = text.substring(start, end);
        const before = text.substring(0, start);
        const after = text.substring(end);
        let newValue, newPos;
        if (suffix === '') {
            const lines = selected ? selected.split('\n').map(l => prefix + l).join('\n') : prefix;
            newValue = before + lines + after;
            newPos = start + lines.length;
        } else {
            const wrapped = prefix + selected + suffix;
            newValue = before + wrapped + after;
            newPos = selected ? start + wrapped.length : start + prefix.length;
        }
        editor.value = newValue;
        editor.setSelectionRange(newPos, newPos);
        editor.focus();
        isDirty = true;
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

    imageInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        const totalCount = existingImageUrls.length + newImageFiles.length + files.length;
        if (totalCount > 10) {
            alert(`사진은 최대 10장까지 첨부 가능합니다. (현재 ${existingImageUrls.length + newImageFiles.length}장)`);
            imageInput.value = '';
            return;
        }
        const oversized = files.filter(f => f.size > 10 * 1024 * 1024);
        if (oversized.length > 0) {
            alert('10MB 이하의 이미지만 가능합니다.');
            imageInput.value = '';
            return;
        }
        newImageFiles = [...newImageFiles, ...files];
        renderThumbs();
        imageInput.value = '';
        isDirty = true;
    });

    function renderThumbs() {
        imageThumbs.innerHTML = '';
        existingImageUrls.forEach((url, i) => {
            const wrap = document.createElement('div');
            wrap.className = 'thumb-wrap';
            wrap.innerHTML = `
                <img src="${url}" class="thumb-img">
                <button class="thumb-remove" data-type="existing" data-index="${i}">
                    <span class="material-symbols-rounded">close</span>
                </button>
                <div class="thumb-order">${i + 1}</div>
            `;
            imageThumbs.appendChild(wrap);
        });
        newImageFiles.forEach((file, i) => {
            const url = URL.createObjectURL(file);
            const globalIndex = existingImageUrls.length + i;
            const wrap = document.createElement('div');
            wrap.className = 'thumb-wrap';
            wrap.innerHTML = `
                <img src="${url}" class="thumb-img">
                <button class="thumb-remove" data-type="new" data-index="${i}">
                    <span class="material-symbols-rounded">close</span>
                </button>
                <div class="thumb-order">${globalIndex + 1}</div>
            `;
            imageThumbs.appendChild(wrap);
        });
        imageThumbs.querySelectorAll('.thumb-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const idx = parseInt(btn.dataset.index);
                if (type === 'existing') existingImageUrls.splice(idx, 1);
                else newImageFiles.splice(idx, 1);
                renderThumbs();
                if (existingImageUrls.length + newImageFiles.length === 0) {
                    multiPreview.style.display = 'none';
                    uploadLabelBtn.style.display = 'flex';
                }
            });
        });
        const total = existingImageUrls.length + newImageFiles.length;
        if (total > 0) {
            multiPreview.style.display = 'flex';
            uploadLabelBtn.style.display = 'none';
        }
    }

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
            if (tags.length >= 5) { alert('태그는 최대 5개까지입니다.'); return; }
            addTag(tagInput.value.trim());
            tagInput.value = '';
            isDirty = true;
        }
    });

    submitBtn.addEventListener('click', async () => {
        const title = postTitle.value.trim();
        const content = editor.value.trim();
        if (!title || !content) { alert('제목과 내용을 모두 작성해주세요.'); return; }

        submitBtn.disabled = true;
        submitBtn.innerText = editPostId ? '수정 중...' : '가든에 씨앗 심는 중...';

        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) throw new Error('로그인이 필요합니다.');

            const uploadedUrls = [];
            for (const file of newImageFiles) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('post-images')
                    .upload(fileName, file, { cacheControl: '3600', upsert: false });
                if (uploadError) throw uploadError;
                const { data: publicUrlData } = supabase.storage.from('post-images').getPublicUrl(fileName);
                uploadedUrls.push(publicUrlData.publicUrl);
            }

            const finalImageUrls = [...existingImageUrls, ...uploadedUrls];
            const finalImageUrl = finalImageUrls[0] || null;

            if (editPostId) {
                const { error: updateError } = await supabase
                    .from('posts')
                    .update({ title, content, image_url: finalImageUrl, image_urls: finalImageUrls, tags, updated_at: new Date() })
                    .eq('id', editPostId);
                if (updateError) throw updateError;
                isDirty = false;
                alert('게시물이 수정됐어요!');
            } else {
                const { error: insertError } = await supabase
                    .from('posts')
                    .insert([{ user_id: user.id, title, content, image_url: finalImageUrl, image_urls: finalImageUrls, tags, created_at: new Date() }]);
                if (insertError) throw insertError;

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
            submitBtn.disabled = false;
            submitBtn.innerText = editPostId ? '수정 완료' : '씨앗 심기';
        }
    });

    editor.addEventListener('input', () => { isDirty = true; });
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    });
});
