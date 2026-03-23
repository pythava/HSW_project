/**
 * UnderGarden Write Logic - Full Integration
 * - Tab Navigation (Write vs Preview)
 * - Real-time Markdown Rendering (marked.js)
 * - Image Upload to Supabase Storage
 * - Post Insertion with Image URL & Tags
 * - Form Dirty Checking (Prevent accidental exit)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. 요소 선택
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    const tabs = document.querySelectorAll('.tab-item');
    const tabPanes = document.querySelectorAll('.tab-pane');

    const imageInput = document.getElementById('post-image-file'); 
    const imagePreview = document.getElementById('image-preview');
    const previewContainer = document.getElementById('image-preview-container');
    const removeImageBtn = document.getElementById('remove-image-btn');
    const uploadLabel = document.querySelector('.image-upload-label');

    const tagInput = document.getElementById('tag-input');
    const tagList = document.getElementById('tag-list');
    const submitBtn = document.getElementById('submit-post');
    const postTitle = document.getElementById('post-title');

    let tags = [];
    let isDirty = false;

    // 2. 탭 전환 로직 (원래 vs 미리보기)
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            tabPanes.forEach(pane => {
                pane.classList.remove('active');
                if (pane.id === targetId) pane.classList.add('active');
            });

            // 미리보기 탭 활성화 시 마크다운 렌더링
            if (targetId === 'preview-mode') {
                renderMarkdown();
            }
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

    // 3. 마크다운 툴바 - 텍스트 삽입 헬퍼
    window.insertMarkdown = (prefix, suffix = '') => {
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const text = editor.value;
        const selected = text.substring(start, end);

        const before = text.substring(0, start);
        const after = text.substring(end);

        let newValue;
        let newPos;

        if (suffix === '') {
            // 블록 타입 (H1, Quote 등) - 줄 처음에 삽입
            const lines = selected ? selected.split('\n').map(l => prefix + l).join('\n') : prefix;
            newValue = before + lines + after;
            newPos = start + lines.length;
        } else {
            // 인라인 타입 (Bold, Italic 등) - 선택 영역 감싸기
            const wrapped = prefix + selected + suffix;
            newValue = before + wrapped + after;
            newPos = selected ? start + wrapped.length : start + prefix.length;
        }

        editor.value = newValue;
        editor.setSelectionRange(newPos, newPos);
        editor.focus();
        isDirty = true;

        // 미리보기 탭이 열려있다면 즉시 갱신
        const activeTab = document.querySelector('.tab-item.active');
        if (activeTab && activeTab.dataset.tab === 'preview-mode') renderMarkdown();
    };

    // 툴바 버튼 이벤트 바인딩 (HTML의 data-action 활용)
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

    // 4. 이미지 핸들링 (파일 선택 및 로컬 미리보기)
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
            uploadLabel.style.display = 'none'; // 업로드 버튼 숨김
            isDirty = true;
        };
        reader.readAsDataURL(file);
    });

    removeImageBtn.addEventListener('click', () => {
        imageInput.value = '';
        imagePreview.src = '';
        previewContainer.style.display = 'none';
        uploadLabel.style.display = 'flex'; // 업로드 버튼 다시 표시
    });

    // 5. 태그 시스템
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = tagInput.value.trim().replace(/#/g, '');
            if (!val) return;
            if (tags.includes(val)) { tagInput.value = ''; return; }
            if (tags.length >= 5) { alert('태그는 최대 5개까지입니다.'); return; }

            tags.push(val);
            const tagBadge = document.createElement('div');
            tagBadge.className = 'tag-badge';
            tagBadge.innerHTML = `#${val} <span style="cursor:pointer; margin-left:6px; font-weight:bold;">×</span>`;
            
            tagBadge.querySelector('span').addEventListener('click', () => {
                tags = tags.filter(t => t !== val);
                tagBadge.remove();
            });
            
            tagList.appendChild(tagBadge);
            tagInput.value = '';
            isDirty = true;
        }
    });

    // 6. [핵심] 게시글 저장 (Storage 업로드 포함)
    submitBtn.addEventListener('click', async () => {
        const title = postTitle.value.trim();
        const content = editor.value.trim();

        if (!title || !content) {
            alert('제목과 내용을 모두 작성해주세요.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerText = '가든에 씨앗 심는 중...';

        try {
            // 사용자 세션 체크
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) throw new Error('로그인이 필요합니다.');

            let finalImageUrl = null;

            // [A] 이미지가 선택되었다면 스토리지에 먼저 업로드
            const imageFile = imageInput.files[0];
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${user.id}/${Date.now()}.${fileExt}`; // 유저 폴더별 관리

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('post-images') // ✅ 버킷 이름이 'post-images'인지 확인 필수
                    .upload(fileName, imageFile, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) throw uploadError;

                // 공개 URL 생성
                const { data: publicUrlData } = supabase.storage
                    .from('post-images')
                    .getPublicUrl(fileName);
                
                finalImageUrl = publicUrlData.publicUrl;
            }

            // [B] 게시글 데이터를 Database에 Insert
            const { error: insertError } = await supabase
                .from('posts')
                .insert([{
                    user_id: user.id,
                    title: title,
                    content: content,
                    image_url: finalImageUrl, // 업로드된 이미지 URL
                    tags: tags,
                    created_at: new Date()
                }]);

            if (insertError) throw insertError;

            // 성공 처리
            isDirty = false;
            alert('성공적으로 게시되었습니다!');
            window.location.href = '../index.html';

        } catch (err) {
            console.error('Submission Error:', err);
            alert('오류 발생: ' + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = '씨앗 심기';
        }
    });

    // 변경사항 감지 및 이탈 경고
    editor.addEventListener('input', () => { isDirty = true; });
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});
