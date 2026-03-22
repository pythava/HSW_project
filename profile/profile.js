// DOM 요소 가져오기
const imageClickArea = document.getElementById('imageClickArea');
const fileInput = document.getElementById('fileInput');
const profileDisplay = document.getElementById('profileDisplay');

// 1. 이미지 영역 클릭 시 파일 input 클릭 트리거
imageClickArea.addEventListener('click', () => {
    fileInput.click();
});

// 2. 파일 input에 변화가 생겼을 때 (파일을 선택했을 때) 실행
fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0]; // 선택한 파일 가져오기
    
    if (file) {
        // 이미지 파일인지 확인
        if (!file.type.startsWith('image/')) {
            alert('이미지 파일만 선택할 수 있습니다.');
            return;
        }

        // FileReader를 이용해 파일을 읽고 화면에 표시
        const reader = new FileReader();
        
        reader.onload = (e) => {
            // 읽어온 이미지 데이터를 img 태그의 src에 입력
            profileDisplay.src = e.target.result;
        };
        
        reader.readAsDataURL(file); // 파일을 Data URL 형식으로 읽기
    }
});
