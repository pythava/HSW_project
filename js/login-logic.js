/* js/login-logic.js */
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const toggleBtn = document.getElementById('toggle-auth-mode');
const signupExtra = document.getElementById('signup-extra');
const authError = document.getElementById('auth-error');

let isSignupMode = false;

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
});

// 2. 폼 제출 핸들러
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // UI 초기화 및 버튼 비활성화 (중복 클릭 방지)
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
            });

            if (authErrorMsg) throw authErrorMsg;

            // [프로필 생성] - 에러가 나더라도 리다이렉트를 막지 않음
            if (authData.user) {
                try {
                    await supabase
                        .from('profiles')
                        .upsert([{ 
                            id: authData.user.id, 
                            email: email,
                            username: username,
                            description: "UnderGarden에 새로 합류한 거주민입니다."
                        }]);
                } catch (pErr) {
                    console.warn("프로필 데이터베이스 동기화 지연:", pErr.message);
                }
                
                // 성공 메시지 후 즉시 이동
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
            
            // 로그인 성공 시 지체 없이 이동
            window.location.href = './index.html';
        }
    } catch (err) {
        // 실제 계정 생성/로그인 자체가 실패한 경우에만 에러 표시
        console.error("Auth System Error:", err.message);
        authError.innerText = "가든 접속 실패: " + translateError(err.message);
        authError.style.display = 'block';
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.innerText = isSignupMode ? '회원가입 하기' : '접속하기';
    }
});

/**
 * 일반적인 에러 메시지를 한국어로 변환
 */
function translateError(msg) {
    if (msg.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 틀렸습니다.";
    if (msg.includes("User already registered")) return "이미 등록된 이메일입니다.";
    if (msg.includes("Password should be at least 6 characters")) return "비밀번호는 최소 6자 이상이어야 합니다.";
    return msg;
}
