document.addEventListener('DOMContentLoaded', function() {
    
    // 데이터베이스 초기 구조 및 로컬스토리지 래퍼
    function safeGetItem(key, defaultValue) {
        try { return localStorage.getItem(key) || defaultValue; } catch(e) { return defaultValue; }
    }
    function safeSetItem(key, value) {
        try { localStorage.setItem(key, value); } catch(e) {}
    }

    let adminPassword = safeGetItem('adminPw', '0000');
    let rawStudentData = safeGetItem('studentData', null);
    let studentData = rawStudentData ? JSON.parse(rawStudentData) : {
        "1학년 1반": [], "1학년 2반": [], "2학년 1반": [], "2학년 2반": []
    };

    // 데이터 구조 업데이트 마이그레이션 방어코드
    Object.keys(studentData).forEach(cls => {
        studentData[cls].forEach(student => {
            if (!student.stats) student.stats = { maxWpm: 0 };
            if (!student.weakness) student.weakness = {};
        });
    });

    if (studentData["1학년 1반"].length === 0) {
        studentData["1학년 1반"].push({
            name: "테스트학생", errorMode: "stop", allowedMenus: ["자리 연습", "낱말 연습", "문장 연습", "이력서 연습"],
            stats: { maxWpm: 0 }, weakness: {}
        });
    }
    
    // 전역 저장 함수 
    window.saveData = async function() {
        safeSetItem('studentData', JSON.stringify(studentData));
        safeSetItem('adminPw', adminPassword);
    };
    window.saveData(); 

    let currentUser = null; let currentUserClass = null; let currentMode = null;

    const practiceContents = {
        "자리 연습": ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "ㄲ", "ㄸ", "ㅃ", "ㅆ", "ㅉ", "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅘ", "ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ", "ㅢ"],
        "낱말 연습": ["학교", "사과", "코끼리", "기차", "하늘", "바다", "토끼", "햇님", "꽃밭", "아빠", "엄마", "선생님", "컴퓨터", "마우스", "키보드", "모니터", "책상", "의자", "가방", "연필", "지우개", "필통", "공책", "우산", "안경", "시계", "자전거", "자동차", "버스", "비행기", "지하철", "배", "택시", "강아지", "고양이", "호랑이", "사자", "원숭이", "바나나", "포도", "수박", "딸기", "복숭아", "나비", "거미", "개미", "피아노", "기타", "축구", "야구", "농구", "수영", "도서관", "박물관"],
        "문장 연습": ["나비가 꽃밭에 앉아 있습니다.", "나는 매일 학교에 갑니다.", "우리 모두 함께 노래해요.", "즐거운 타자 연습 시간입니다.", "밥을 골고루 꼭꼭 씹어 먹어요.", "차를 탈 때는 안전벨트를 매요.", "친구와 사이좋게 지냅니다.", "선생님 말씀에 귀 기울여요.", "횡단보도에서는 초록불에 건너요.", "일찍 자고 일찍 일어납니다.", "양치질을 깨끗하게 해요.", "책 읽는 것을 좋아합니다.", "운동장에서 신나게 뛰어놀아요.", "항상 밝게 웃으며 인사합니다.", "할 수 있다는 자신감을 가져요.", "내 방은 내가 스스로 정리합니다.", "부모님께 효도하는 어린이가 됩시다."],
        "이력서 연습": ["성명: 홍길동", "생년월일: 2010년 5월 5일", "주소: 서울특별시 강남구", "연락처: 010-1234-5678", "이메일: test@example.com", "저는 성실하게 일할 수 있습니다.", "책임감을 가지고 일하겠습니다.", "어떤 일이든 배우는 자세로 임하겠습니다.", "취미: 독서, 자전거 타기", "특기: 컴퓨터 활용, 문서 작성"]
    };

    const jasoToKeyMap = {
        'ㅂ':'q', 'ㅈ':'w', 'ㄷ':'e', 'ㄱ':'r', 'ㅅ':'t', 'ㅛ':'y', 'ㅕ':'u', 'ㅑ':'i', 'ㅐ':'o', 'ㅔ':'p',
        'ㅁ':'a', 'ㄴ':'s', 'ㅇ':'d', 'ㄹ':'f', 'ㅎ':'g', 'ㅗ':'h', 'ㅓ':'j', 'ㅏ':'k', 'ㅣ':'l',
        'ㅋ':'z', 'ㅌ':'x', 'ㅊ':'c', 'ㅍ':'v', 'ㅠ':'b', 'ㅜ':'n', 'ㅡ':'m',
        'ㅃ':'q', 'ㅉ':'w', 'ㄸ':'e', 'ㄲ':'r', 'ㅆ':'t', 'ㅒ':'o', 'ㅖ':'p', ' ':'space'
    };
    const requiresShift = ['ㅃ', 'ㅉ', 'ㄸ', 'ㄲ', 'ㅆ', 'ㅒ', 'ㅖ'];
    const leftConsonants = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
    const rightVowels = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';

    function showScreen(screenId) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(screenId).classList.add('active'); }

    let pwActionTarget = ""; 
    function showPwModal(title, action) {
        document.getElementById('pw-modal-title').innerText = title; document.getElementById('pw-modal-input').value = "";
        pwActionTarget = action; document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('pw-modal').classList.remove('hidden'); document.getElementById('alert-modal').classList.add('hidden');
        setTimeout(() => document.getElementById('pw-modal-input').focus(), 100);
    }

    function showAlert(msg) {
        document.getElementById('alert-modal-msg').innerText = msg; document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('alert-modal').classList.remove('hidden'); document.getElementById('pw-modal').classList.add('hidden');
    }

    function closeModals() { document.getElementById('modal-overlay').classList.add('hidden'); }

    document.getElementById('pw-modal-cancel').addEventListener('click', closeModals);
    document.getElementById('alert-modal-ok').addEventListener('click', closeModals);

    document.getElementById('pw-modal-submit').addEventListener('click', () => {
        let pw = document.getElementById('pw-modal-input').value;
        if (pwActionTarget === 'login') {
            if (pw === adminPassword) { closeModals(); showScreen('admin-screen'); renderStudentTable(); } 
            else { showAlert("비밀번호가 틀렸습니다."); }
        } else if (pwActionTarget === 'change') {
            if (pw.trim() !== "") { adminPassword = pw; window.saveData(); showAlert("비밀번호가 성공적으로 변경되었습니다."); } 
            else { showAlert("비밀번호를 입력해주세요."); }
        }
    });

    document.getElementById('pw-modal-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('pw-modal-submit').click(); });
    document.getElementById('admin-btn').addEventListener('click', () => showPwModal("관리자 로그인 (초기: 0000)", "login"));
    document.getElementById('close-admin-btn').addEventListener('click', () => { showScreen('student-login-screen'); updateStudentSelects(); });
    document.getElementById('change-pw-btn').addEventListener('click', () => showPwModal("새로운 비밀번호 입력", "change"));

    // [백업 및 복구 버튼 로직]
    document.getElementById('backup-btn').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(studentData));
        const dlAnchor = document.createElement('a'); dlAnchor.setAttribute("href", dataStr);
        let dateStr = new Date().toISOString().slice(0,10); dlAnchor.setAttribute("download", `특수교육_타자연습_학생기록_${dateStr}.json`);
        document.body.appendChild(dlAnchor); dlAnchor.click(); dlAnchor.remove();
    });

    document.getElementById('restore-btn').addEventListener('click', () => { document.getElementById('restore-file').click(); });

    document.getElementById('restore-file').addEventListener('change', function(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if(importedData["1학년 1반"]) {
                        studentData = importedData; window.saveData(); renderStudentTable(); updateStudentSelects();
                        showAlert("데이터가 성공적으로 복구되었습니다!");
                    } else { showAlert("잘못된 백업 파일입니다."); }
                } catch(err) { showAlert("파일을 읽는 중 오류가 발생했습니다."); }
            };
            reader.readAsText(file);
        }
    });

    document.getElementById('add-student-btn').addEventListener('click', () => {
        let selectedClass = document.getElementById('admin-class').value;
        let newName = document.getElementById('admin-new-student').value.trim();
        if (newName) {
            studentData[selectedClass].push({ name: newName, errorMode: "stop", allowedMenus: ["자리 연습", "낱말 연습"], stats: { maxWpm: 0 }, weakness: {} });
            window.saveData(); document.getElementById('admin-new-student').value = '';
            renderStudentTable(); updateStudentSelects(); 
        }
    });

    window.renderStudentTable = function() {
        let selectedClass = document.getElementById('admin-class').value;
        let tbody = document.getElementById('student-list');
        tbody.innerHTML = '';

        studentData[selectedClass].forEach((student, index) => {
            let tr = document.createElement('tr');
            const menus = ['자리 연습', '낱말 연습', '문장 연습', '이력서 연습'];
            let checkboxes = menus.map(menu => `
                <label class="checkbox-label">
                    <input type="checkbox" class="menu-chk" data-cls="${selectedClass}" data-idx="${index}" data-menu="${menu}" 
                    ${student.allowedMenus.includes(menu) ? 'checked' : ''}> ${menu}
                </label>
            `).join('');

            let weakStr = "-"; let diagnosis = "아직 데이터가 부족합니다.";
            if (student.weakness && Object.keys(student.weakness).length > 0) {
                let sortedWeakness = Object.entries(student.weakness).sort((a, b) => b[1] - a[1]);
                weakStr = sortedWeakness.slice(0, 3).map(x => x[0]).join(', ');
                let leftErrors = 0, rightErrors = 0, shiftErrors = 0, totalErrors = 0;
                for (const [jaso, count] of Object.entries(student.weakness)) {
                    totalErrors += count;
                    if (leftConsonants.includes(jaso)) leftErrors += count;
                    if (rightVowels.includes(jaso)) rightErrors += count;
                    if (requiresShift.includes(jaso)) shiftErrors += count;
                }
                if (totalErrors > 5) {
                    if (leftErrors > rightErrors * 1.5) diagnosis = "왼손(자음) 소근육 훈련 요망";
                    else if (rightErrors > leftErrors * 1.5) diagnosis = "오른손(모음) 소근육 및 위치 인지 약함";
                    else if (shiftErrors > totalErrors * 0.3) diagnosis = "쌍자음(Shift) 동시 조작 취약";
                    else diagnosis = "전반적 위치 인지 훈련 필요";
                } else { diagnosis = "원활하게 훈련 중입니다."; }
            }

            let maxWpmStr = student.stats && student.stats.maxWpm > 0 ? student.stats.maxWpm + "타" : "-";

            tr.innerHTML = `
                <td style="font-weight:bold;">${student.name}</td>
                <td>
                    <select class="err-mode-sel" data-cls="${selectedClass}" data-idx="${index}">
                        <option value="stop" ${student.errorMode === 'stop' ? 'selected' : ''}>🛡️ 잠김</option>
                        <option value="hint" ${student.errorMode === 'hint' ? 'selected' : ''}>🚦 힌트</option>
                    </select>
                </td>
                <td style="text-align:left;">${checkboxes}</td>
                <td class="stats-col">${maxWpmStr}</td>
                <td class="weak-col">${weakStr}</td>
                <td class="diagnosis-col">${diagnosis}</td>
                <td><button class="delete-btn" data-cls="${selectedClass}" data-idx="${index}">삭제</button></td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.err-mode-sel').forEach(sel => {
            sel.addEventListener('change', (e) => { studentData[e.target.dataset.cls][e.target.dataset.idx].errorMode = e.target.value; window.saveData(); });
        });
        document.querySelectorAll('.menu-chk').forEach(chk => {
            chk.addEventListener('change', (e) => {
                let cls = e.target.dataset.cls, idx = e.target.dataset.idx, menu = e.target.dataset.menu;
                let menus = studentData[cls][idx].allowedMenus;
                if (e.target.checked) menus.push(menu); else studentData[cls][idx].allowedMenus = menus.filter(m => m !== menu);
                window.saveData();
            });
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if(confirm("정말 삭제하시겠습니까?")) {
                    studentData[e.target.dataset.cls].splice(e.target.dataset.idx, 1); 
                    window.saveData(); renderStudentTable(); updateStudentSelects();
                }
            });
        });
    }

    document.getElementById('admin-class').addEventListener('change', renderStudentTable);

    const classSelect = document.getElementById('student-class');
    const nameSelect = document.getElementById('student-name');
    const loginBtn = document.getElementById('student-login-btn');

    window.updateStudentSelects = function() {
        classSelect.value = ""; nameSelect.innerHTML = '<option value="">먼저 반을 선택하세요</option>';
        nameSelect.disabled = true; loginBtn.disabled = true;
    }

    classSelect.addEventListener('change', () => {
        let cls = classSelect.value;
        if (cls && studentData[cls].length > 0) {
            nameSelect.disabled = false; nameSelect.innerHTML = '<option value="">이름을 선택하세요</option>';
            studentData[cls].forEach((s, idx) => { nameSelect.innerHTML += `<option value="${idx}">${s.name}</option>`; });
        } else {
            nameSelect.innerHTML = '<option value="">등록된 학생이 없습니다</option>'; nameSelect.disabled = true;
        }
        loginBtn.disabled = true;
    });

    nameSelect.addEventListener('change', () => { loginBtn.disabled = nameSelect.value === ""; });
    nameSelect.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !loginBtn.disabled) loginBtn.click(); });

    loginBtn.addEventListener('click', () => {
        currentUserClass = classSelect.value;
        let idx = nameSelect.value;
        currentUser = studentData[currentUserClass][idx];
        
        document.getElementById('welcome-message').innerText = `${currentUser.name} 학생, 환영합니다!`;
        
        let menuGrid = document.getElementById('allowed-menus');
        menuGrid.innerHTML = '';
        currentUser.allowedMenus.forEach(menu => {
            let btn = document.createElement('button'); btn.innerText = menu; btn.onclick = () => startPractice(menu);
            menuGrid.appendChild(btn);
        });

        if (currentUser.allowedMenus.length === 0) menuGrid.innerHTML = '<p>현재 허용된 연습이 없습니다. 선생님께 문의하세요.</p>';
        showScreen('student-menu-screen');
    });

    document.getElementById('logout-btn').addEventListener('click', () => { updateStudentSelects(); showScreen('student-login-screen'); });

    function getStrokeCount(text) {
        if (!text) return 0;
        let jaso = Hangul.disassemble(text);
        let strokes = jaso.length;
        for (let i = 0; i < jaso.length; i++) { if (requiresShift.includes(jaso[i])) strokes++; }
        return strokes;
    }

    let currentWordList = []; let practiceQueue = []; let WORDS_PER_SESSION = 10; let currentWordIndex = 0; 
    let currentWord = ""; let activeTimeMs = 0; let wordStartTime = 0; let isPracticing = false;
    let totalAccumulatedStrokes = 0; let totalErrorCount = 0; let currentCombo = 0;   
    let requireEnter = false; let lastValidValue = ""; let isErrorState = false; let lastErrorValue = "";
    let isTransitioning = false; 

    const typingInput = document.getElementById('typing-input');
    const targetText = document.getElementById('target-text');
    const nextWordPreview = document.getElementById('next-word-preview');
    const wpmDisplay = document.getElementById('wpm-display');
    const accDisplay = document.getElementById('acc-display');
    const comboDisplay = document.getElementById('combo-display');
    const feedbackMsg = document.getElementById('feedback-msg');
    const progressDisplay = document.getElementById('progress-display');

    document.getElementById('practice-screen').addEventListener('click', (e) => { if(e.target.id !== 'end-practice-btn') typingInput.focus(); });

    function updateTargetTextDisplay(inputVal) {
        let validLen = inputVal.length; let html = "";
        for (let i = 0; i < currentWord.length; i++) {
            if (i < validLen - 1) html += `<span class="char-typed">${currentWord[i]}</span>`;
            else if (i === validLen - 1) html += `<span class="char-current">${currentWord[i]}</span>`;
            else if (i === 0 && validLen === 0) html += `<span class="char-current">${currentWord[i]}</span>`;
            else html += `<span class="char-pending">${currentWord[i]}</span>`;
        }
        targetText.innerHTML = html; updateKeyboardGuide(inputVal); 
    }

    function updateKeyboardGuide(inputVal) {
        document.querySelectorAll('.key').forEach(k => { k.classList.remove('active'); k.classList.remove('active-error'); });
        if (isErrorState) { let bsKey = document.querySelector('.key[data-key="backspace"]'); if (bsKey) bsKey.classList.add('active-error'); return; }
        if (requireEnter && inputVal === currentWord) { let enterKey = document.querySelector('.key[data-key="enter"]'); if (enterKey) enterKey.classList.add('active'); return; }
        
        let inputJaso = Hangul.disassemble(inputVal); let targetJaso = Hangul.disassemble(currentWord);
        if (inputJaso.length < targetJaso.length) {
            let nextJaso = targetJaso[inputJaso.length]; let keyCharCode = jasoToKeyMap[nextJaso];
            if (keyCharCode) {
                let keyEl = document.querySelector(`.key[data-key="${keyCharCode}"]`); if (keyEl) keyEl.classList.add('active');
                if (requiresShift.includes(nextJaso)) { let shiftKey = document.querySelector('.key[data-key="shift"]'); if (shiftKey) shiftKey.classList.add('active'); }
            }
        }
    }

    window.startPractice = function(menuName) {
        currentMode = menuName; currentWordList = practiceContents[menuName] || practiceContents["낱말 연습"];
        document.getElementById('practice-user-info').innerText = `${currentUser.name} (${menuName})`;
        
        if (menuName === "자리 연습") { WORDS_PER_SESSION = 100; requireEnter = false; }
        else if (menuName === "낱말 연습") { WORDS_PER_SESSION = 50; requireEnter = false; }
        else if (menuName === "문장 연습") { WORDS_PER_SESSION = 15; requireEnter = true; }
        else { WORDS_PER_SESSION = 10; requireEnter = true; } 
        
        practiceQueue = []; for(let i = 0; i < WORDS_PER_SESSION; i++) practiceQueue.push(currentWordList[Math.floor(Math.random() * currentWordList.length)]);
        currentWordIndex = 0; totalAccumulatedStrokes = 0; totalErrorCount = 0; currentCombo = 0;
        wpmDisplay.innerText = "0"; accDisplay.innerText = "100"; comboDisplay.innerText = "0";
        isPracticing = true; activeTimeMs = 0; wordStartTime = 0; isTransitioning = false;
        
        showScreen('practice-screen'); nextWord();
    }

    function clearIME() {
        const hidden = document.getElementById('hidden-ime-clear');
        hidden.focus(); setTimeout(() => { typingInput.value = ''; typingInput.focus(); }, 10);
    }

    function nextWord() {
        if (currentWordIndex >= WORDS_PER_SESSION) { endPracticeSession(true); return; }
        currentWord = practiceQueue[currentWordIndex]; currentWordIndex++;
        progressDisplay.innerText = `${currentWordIndex} / ${WORDS_PER_SESSION}`;
        
        if (currentWordIndex < WORDS_PER_SESSION) nextWordPreview.innerText = "다음: " + practiceQueue[currentWordIndex];
        else nextWordPreview.innerText = "다음: (마지막 문제)";

        clearIME(); 
        lastValidValue = ""; lastErrorValue = ""; isErrorState = false; wordStartTime = 0; 
        updateTargetTextDisplay(""); 
        typingInput.classList.remove('text-error', 'shake');
        feedbackMsg.style.color = 'black'; feedbackMsg.innerText = "타자를 시작하세요.";
        
        setTimeout(() => { isTransitioning = false; }, 30);
    }

    function processWordCompletion() {
        if (isTransitioning) return; 
        isTransitioning = true; 
        
        if (wordStartTime > 0) { activeTimeMs += (new Date().getTime() - wordStartTime); wordStartTime = 0; }
        totalAccumulatedStrokes += getStrokeCount(currentWord);
        currentCombo++; comboDisplay.innerText = currentCombo;
        nextWord(); 
    }

    typingInput.addEventListener('keydown', function(e) {
        if (!isPracticing || isTransitioning) return;
        if (currentUser.errorMode === 'stop' && isErrorState) {
            if (e.key !== 'Backspace' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
                e.preventDefault(); this.classList.add('shake'); setTimeout(() => this.classList.remove('shake'), 200); return;
            }
        }
        if (requireEnter && e.key === 'Enter') {
            if (this.value === currentWord && !isErrorState) { e.preventDefault(); processWordCompletion(); }
        }
    });

    typingInput.addEventListener('input', function(e) {
        if (!isPracticing || isTransitioning) { if(isTransitioning) this.value = lastValidValue; return; }

        let inputVal = this.value;
        if (inputVal.startsWith(' ') && currentWord[0] !== ' ') { this.value = ''; return; }
        if (wordStartTime === 0 && inputVal.length > 0) wordStartTime = new Date().getTime();

        if (inputVal.length === 0) {
            lastValidValue = ""; lastErrorValue = ""; isErrorState = false; updateTargetTextDisplay("");
            this.classList.remove('text-error', 'shake'); feedbackMsg.style.color = 'black'; feedbackMsg.innerText = "타자를 시작하세요."; return;
        }

        if (currentUser.errorMode === 'stop' && isErrorState) {
            if (inputVal.length > lastErrorValue.length || Hangul.disassemble(inputVal).length > Hangul.disassemble(lastErrorValue).length) {
                this.value = lastErrorValue; this.classList.add('shake'); setTimeout(() => this.classList.remove('shake'), 200); return;
            }
        }

        let inputJaso = Hangul.disassemble(inputVal); let targetJaso = Hangul.disassemble(currentWord);
        let mismatchIndex = -1; let isError = false;
        for (let i = 0; i < inputJaso.length; i++) { if (inputJaso[i] !== targetJaso[i]) { isError = true; mismatchIndex = i; break; } }

        if (isError) {
            if (!isErrorState) {
                totalErrorCount++; currentCombo = 0; comboDisplay.innerText = currentCombo;
                let expectedJaso = targetJaso[mismatchIndex];
                if (expectedJaso && expectedJaso !== ' ') currentUser.weakness[expectedJaso] = (currentUser.weakness[expectedJaso] || 0) + 1;
            }
            isErrorState = true; lastErrorValue = inputVal; 
            if (currentUser.errorMode === 'stop') {
                this.classList.add('text-error'); feedbackMsg.style.color = 'red';
                feedbackMsg.innerText = "틀렸습니다! 반드시 백스페이스(←)로 지우고 다시 치세요.";
            } else {
                this.classList.add('text-error'); feedbackMsg.style.color = 'red';
                feedbackMsg.innerText = "오타가 있습니다. 백스페이스(←)로 지우세요.";
            }
            updateKeyboardGuide(inputVal); 
        } else {
            isErrorState = false; lastValidValue = inputVal; updateTargetTextDisplay(inputVal); 
            this.classList.remove('text-error', 'shake');
            if (this.value === currentWord && requireEnter) {
                feedbackMsg.style.color = '#2196F3'; feedbackMsg.innerText = "엔터(Enter) 키를 눌러 다음으로 넘어가세요 ⏎";
            } else {
                feedbackMsg.style.color = 'black'; feedbackMsg.innerText = "잘하고 있습니다!";
            }
        }

        if (wordStartTime > 0) {
            let currentTime = new Date().getTime();
            let totalActiveMs = activeTimeMs + (currentTime - wordStartTime);
            let timeElapsedMin = totalActiveMs / 60000;
            let currentStrokes = getStrokeCount(isErrorState ? lastValidValue : inputVal);
            let totalCurrentExpected = totalAccumulatedStrokes + currentStrokes;
            
            if (timeElapsedMin > 0.016 || totalCurrentExpected > 2) { 
                let wpm = Math.floor(totalCurrentExpected / timeElapsedMin); wpmDisplay.innerText = wpm;
            }

            let accuracy = 100;
            if (totalCurrentExpected > 0) accuracy = Math.max(0, Math.floor(((totalCurrentExpected - totalErrorCount) / totalCurrentExpected) * 100));
            accDisplay.innerText = accuracy;
        }

        if (this.value === currentWord && !requireEnter && !isErrorState) {
            processWordCompletion();
        }
    });

    function endPracticeSession(isCompleted) {
        isPracticing = false; typingInput.value = ''; lastValidValue = '';
        let currentWpm = parseInt(wpmDisplay.innerText) || 0;
        if (currentWpm > currentUser.stats.maxWpm) currentUser.stats.maxWpm = currentWpm;
        window.saveData(); 

        if (isCompleted) {
            document.getElementById('final-wpm').innerText = wpmDisplay.innerText;
            document.getElementById('final-acc').innerText = accDisplay.innerText;
            showScreen('result-screen');
        } else {
            wpmDisplay.innerText = "0"; accDisplay.innerText = "100";
            showScreen('student-menu-screen');
        }
    }

    document.getElementById('end-practice-btn').addEventListener('click', () => endPracticeSession(false));
    document.getElementById('back-to-menu-btn').addEventListener('click', () => showScreen('student-menu-screen'));

    // 초기화 실행
    updateStudentSelects();
    
}); // DOMContentLoaded 끝
