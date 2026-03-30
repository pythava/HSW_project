/* js/pam-create-logic.js — 팸 만들기 로직 */

let _me = null;
let _myTokens = 0;
let _selectedFile = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = '../login.html'; return; }
    _me = user;

    // 토큰 확인
    const { data: tokenData } = await supabase.from('user_tokens').select('amount').eq('user_id', user.id).single();
    _myTokens = tokenData?.amount ?? 0;
    document.getElementById('header-token').textContent = _myTokens;

    if (_myTokens < 100) {
        document.getElementById('pam-submit-btn').disabled = true;
        document.getElementById('pam-submit-btn').innerHTML = '✦ 루나이 부족해요 (100 루나 필요)';
    }

    bindEvents();
});

function bindEvents() {
    const nameInput = document.getElementById('pam-name');
    const descInput = document.getElementById('pam-desc');
    const imgInput = document.getElementById('pam-img-file');
    const regionSelect = document.getElementById('pam-region');
    const ageSelect = document.getElementById('pam-age');
    const genderSelect = document.getElementById('pam-gender');
    const pwToggle = document.getElementById('pw-toggle');
    const pwWrap = document.getElementById('pw-input-wrap');

    // 이름 → 미리보기
    nameInput.addEventListener('input', () => {
        document.getElementById('name-count').textContent = nameInput.value.length;
        document.getElementById('preview-name').textContent = nameInput.value || '팸 이름';
    });

    // 설명 → 미리보기
    descInput.addEventListener('input', () => {
        document.getElementById('desc-count').textContent = descInput.value.length;
        document.getElementById('preview-desc').textContent = descInput.value || '팸 설명이 여기에 표시됩니다';
    });

    // 이미지 → 미리보기
    imgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { alert('10MB 이하 이미지만 가능합니다.'); return; }
        _selectedFile = file;

        const url = URL.createObjectURL(file);
        const previewImg = document.getElementById('preview-img');
        previewImg.src = url;
        previewImg.style.display = 'block';
        document.getElementById('preview-placeholder').style.display = 'none';

        // 업로드 레이블도 이미지로
        const label = document.getElementById('img-upload-label');
        label.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
        label.classList.add('has-img');
    });

    // 지역/나이/성별 → 미리보기 뱃지
    [regionSelect, ageSelect, genderSelect].forEach(sel => {
        sel.addEventListener('change', updatePreviewBadges);
    });

    // 비번 토글
    pwToggle.addEventListener('change', () => {
        pwWrap.style.display = pwToggle.checked ? 'block' : 'none';
        document.getElementById('preview-lock').style.display = pwToggle.checked ? 'flex' : 'none';
    });

    // 제출
    document.getElementById('pam-submit-btn').addEventListener('click', submitPam);

    // 로그아웃
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        location.href = '../login.html';
    });
}

function updatePreviewBadges() {
    const region = document.getElementById('pam-region').value;
    const age = document.getElementById('pam-age').value;
    const gender = document.getElementById('pam-gender').value;
    const badges = [region, age, gender].filter(Boolean);
    document.getElementById('preview-badges').innerHTML = badges.map(b => `<span class="pam-badge">${b}</span>`).join('');
}

async function submitPam() {
    const name = document.getElementById('pam-name').value.trim();
    const desc = document.getElementById('pam-desc').value.trim();
    const region = document.getElementById('pam-region').value;
    const age = document.getElementById('pam-age').value;
    const gender = document.getElementById('pam-gender').value;
    const hasPw = document.getElementById('pw-toggle').checked;
    const pw = document.getElementById('pam-pw').value;

    if (!name) { alert('팸 이름을 입력해주세요.'); return; }
    if (hasPw && pw.length !== 6) { alert('비밀번호는 6자리여야 합니다.'); return; }
    if (_myTokens < 100) { alert('루나이 부족합니다.'); return; }

    const btn = document.getElementById('pam-submit-btn');
    btn.disabled = true;
    btn.textContent = '팸을 만드는 중...';

    try {
        // 이미지 업로드
        let imageUrl = null;
        if (_selectedFile) {
            const ext = _selectedFile.name.split('.').pop();
            const fileName = `pam/${_me.id}/${Date.now()}.${ext}`;
            const { error: uploadErr } = await supabase.storage.from('post-images').upload(fileName, _selectedFile, { upsert: false });
            if (uploadErr) throw uploadErr;
            const { data: pub } = supabase.storage.from('post-images').getPublicUrl(fileName);
            imageUrl = pub.publicUrl;
        }

        // 팸 생성
        const { data: pam, error: pamErr } = await supabase.from('pams').insert({
            name,
            description: desc,
            region: region || null,
            age_group: age || null,
            gender: gender || null,
            has_password: hasPw,
            password: hasPw ? pw : null,
            image_url: imageUrl,
            creator_id: _me.id,
            member_count: 1
        }).select().single();

        if (pamErr) throw pamErr;

        // 방장을 멤버로 추가
        await supabase.from('pam_members').insert({ pam_id: pam.id, user_id: _me.id });

        // 토큰 차감
        await supabase.from('user_tokens').update({ amount: _myTokens - 100 }).eq('user_id', _me.id);

        alert('팸이 만들어졌어요! ✦');
        location.href = '../pam.html';
    } catch (err) {
        console.error(err);
        alert('팸 만들기 실패: ' + err.message);
        btn.disabled = false;
        btn.innerHTML = '✦ 100 루나으로 팸 만들기';
    }
}
