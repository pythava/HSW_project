/* js/login-logic.js */
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const toggleBtn = document.getElementById('toggle-auth-mode');
const signupExtra = document.getElementById('signup-extra');
const authError = document.getElementById('auth-error');

let isSignupMode = false;

// 로그인/회원가입 모드 전환
toggleBtn.addEventListener('click', () => {
    isSignupMode = !isSignupMode;
    authTitle.innerText = isSignupMode ? 'Resident Registration' : 'Resident Login';
    authSubmitBtn.innerText = isSignupMode ? '회원가입 하기' : '접속하기';
    toggleBtn.innerText = isSignupMode ? '로그인' : '회원가입';
    document.getElementById('toggle-text').innerText = isSignupMode ? '이미 계정이 있으신가요?' : '아직 거주민이 아니신가요?';
    signupExtra.style.display = isSignupMode ? 'block' : 'none';
    authError.style.display = 'none';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.style.display = 'none';
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const username = document.getElementById('username').value;

    try {
        if (isSignupMode) {
            // 1. 회원가입 실행
            const { data: authData, error: authErrorMsg } = await supabase.auth.signUp({
                email,
                password,
            });

            if (authErrorMsg) throw authErrorMsg;

            if (authData.user) {
                // 2. profiles 테이블에 닉네임 저장
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert([{ id: authData.user.id, username: username || email.split('@')[0] }]);
                
                if (profileError) throw profileError;
                alert('가입 승인! 이메일을 확인하거나 로그인해주세요.');
                location.reload();
            }
        } else {
            // 로그인 실행
            const { error: loginError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (loginError) throw loginError;
            
            // 성공 시 메인 페이지로 이동
            window.location.href = './index.html';
        }
    } catch (err) {
        authError.innerText = err.message;
        authError.style.display = 'block';
    }
});
