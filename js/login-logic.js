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
    authSubmitBtn.disabled = true; // 중복 클릭 방지
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const username = document.getElementById('username')?.value || '';

    try {
        if (isSignupMode) {
            // 1. Supabase Auth 회원가입
            const { data: authData, error: authErrorMsg } = await supabase.auth.signUp({
                email,
                password,
            });

            if (authErrorMsg) throw authErrorMsg;

            if (authData.user) {
                // 2. 확장된 profiles 테이블에 상세 정보 저장 (SQL 스키마와 일치)
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert([{ 
                        id: authData.user.id, 
                        email: email,
                        username: username || email.split('@')[0],
                        description: "UnderGarden에 새로 합류한 거주민입니다.", // 기본 설명
                        follower_count: 0,
                        following_count: 0,
                        post_count: 0
                    }]);
                
                if (profileError) {
                    // Auth는 성공했지만 DB 저장이 실패한 경우 (주로 RLS 문제)
                    console.error("Profile 저장 실패:", profileError);
                    throw new Error("인증은 성공했으나 프로필 생성에 실패했습니다. (SQL 정책 확인 필요)");
                }
                
                alert('가입 승인! 가든의 거주민이 되신 것을 환영합니다.');
                window.location.href = './index.html';
            }
        } else {
            // 로그인 실행
            const { error: loginError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (loginError) throw loginError;
            
            // 성공 시 상대 경로를 이용해 메인 페이지로 이동
            window.location.href = './index.html';
        }
    } catch (err) {
        console.error("Auth 프로세스 에러:", err);
        authError.innerText = err.message;
        authError.style.display = 'block';
    } finally {
        authSubmitBtn.disabled = false;
    }
});
