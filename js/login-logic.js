/* js/login-logic.js */
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const toggleBtn = document.getElementById('toggle-auth-mode');
const signupExtra = document.getElementById('signup-extra');
const authError = document.getElementById('auth-error');

let isSignupMode = false;

// 초기 로드: 로그인 모드이므로 비밀번호 찾기 표시
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('forgot-password-wrap').style.display = 'block';
});

// 1. 로그인/회원가입 모드 전환 로직
toggleBtn.addEventListener('click', () => {
    isSignupMode = !isSignupMode;
    authTitle.innerText = isSignupMode ? 'Resident Registration' : 'Resident Login';
    authSubmitBtn.innerText = isSignupMode ? '회원가입 하기' : '접속하기';
    toggleBtn.innerText = isSignupMode ? '로그인' : '회원가입';
    
    const toggleText = document.getElementById('toggle-text');
    if (toggleText) {
        toggleText.innerText = isSignupMode ? '이미 계정이 있으신가요?' : '아직 거주민이 아니신가요?';
    }
    
    signupExtra.style.display = isSignupMode ? 'block' : 'none';
    authError.style.display = 'none';
    document.getElementById('auth-success').style.display = 'none';
    // 로그인 모드일 때만 비밀번호 찾기 표시
    document.getElementById('forgot-password-wrap').style.display = isSignupMode ? 'none' : 'block';
});

// 비밀번호 찾기 — 이메일 발송
document.getElementById('forgot-password-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const authSuccess = document.getElementById('auth-success');
    authError.style.display = 'none';
    authSuccess.style.display = 'none';

    if (!email) {
        authError.innerText = '위에 이메일을 먼저 입력해주세요.';
        authError.style.display = 'block';
        return;
    }

    const btn = document.getElementById('forgot-password-btn');
    btn.disabled = true;
    btn.textContent = '발송 중...';

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password.html'
    });

    btn.disabled = false;
    btn.textContent = '비밀번호를 잊으셨나요?';

    if (error) {
        authError.innerText = '발송 실패: ' + error.message;
        authError.style.display = 'block';
    } else {
        authSuccess.innerText = `${email}로 재설정 링크를 보냈어요. 메일함을 확인해주세요.`;
        authSuccess.style.display = 'block';
    }
});

// 2. 폼 제출 핸들러
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    authError.style.display = 'none';
    authSubmitBtn.disabled = true;
    authSubmitBtn.innerText = isSignupMode ? '가든 연결 중...' : '접속 중...';
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const username = document.getElementById('username')?.value || email.split('@')[0];

    try {
        if (isSignupMode) {
            // [회원가입]
            const { data: authData, error: authErrorMsg } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { username: username } // user_metadata에 username 저장
                }
            });

            if (authErrorMsg) throw authErrorMsg;

            if (authData.user) {
                // 세션이 확립될 때까지 최대 3초 대기 후 프로필 upsert 시도
                let retries = 6;
                while (retries-- > 0) {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) break;
                    await new Promise(r => setTimeout(r, 500));
                }

                try {
                    await supabase.from('profiles').upsert([{
                        id: authData.user.id,
                        email: email,
                        username: username,
                        description: "UnderGarden에 새로 합류한 거주민입니다."
                    }]);
                } catch (pErr) {
                    console.warn("프로필 동기화 지연 (무시됨):", pErr.message);
                }

                alert('가든 거주권이 발급되었습니다!');
                window.location.href = './index.html';
            }
        } else {
            // [로그인]
            const { error: loginError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (loginError) throw loginError;

            window.location.href = './index.html';
        }
    } catch (err) {
        console.error("Auth System Error:", err.message);
        authError.innerText = "가든 접속 실패: " + translateError(err.message);
        authError.style.display = 'block';
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.innerText = isSignupMode ? '회원가입 하기' : '접속하기';
    }
});

function translateError(msg) {
    if (msg.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 틀렸습니다.";
    if (msg.includes("User already registered")) return "이미 등록된 이메일입니다.";
    if (msg.includes("Password should be at least 6 characters")) return "비밀번호는 최소 6자 이상이어야 합니다.";
    if (msg.includes("Database error saving new user")) return "서버 오류입니다. Supabase 트리거 설정을 확인해주세요.";
    return msg;
}
