document.addEventListener('DOMContentLoaded', async () => {
    
    // ====================================================
    // 🚨 선생님 설정 구역 (완벽 장착 완료!)
    // ====================================================
    const GAS_URL = "https://script.google.com/macros/s/AKfycbwfg3ySJN-i8dcmtLvvpzP7UvO0p4WUU676eZNDhrexonHhEPFBGghlpiRDgI1sNKW0pA/exec"; 
    const apiKey = "AIzaSyAaCCMo_6N3Lhct_3IATBWqnqvfE3xrIpE"; 
    // ====================================================

    let adminPassword = localStorage.getItem('adminPw') || '0000';
    let classData = { 
        "1학년 1반": { current: 0, target: 5000, reward: "상상체험실 가기", indivReward: "자유 휴식권", lastLoginDate: '' }, 
        "1학년 2반": { current: 0, target: 5000, reward: "상상체험실 가기", indivReward: "자유 휴식권", lastLoginDate: '' } 
    };
    let studentData = { "1학년 1반": [], "1학년 2반": [] };
    
    let currentUser = null; 
    let currentUserClass = null; 
    let currentMode = null; 
    let currentCategory = null;
    let currentSessionScore = 0;
    let chartInstance = null;

    // ====================================================
    // 1. 구글 서버(GAS) 데이터 불러오기 로직
    // ====================================================
    try {
        if (GAS_URL && GAS_URL !== "") {
            let response = await fetch(GAS_URL);
            let data = await response.json();
            
            if(data && Object.keys(data).length > 0) {
                if(data.studentData && Object.keys(data.studentData).length > 0) studentData = data.studentData;
                if(data.classData && Object.keys(data.classData).length > 0) classData = data.classData;
                if(data.adminPassword) adminPassword = data.adminPassword;
            }
            
            // 🚨 [핵심 수정] 구글 시트가 완전히 비어있을 때(초기 상태) 화면이 멈추는 것을 방지하는 안전 장치
            if (!classData["1학년 1반"]) classData["1학년 1반"] = { current: 0, target: 5000, reward: "상상체험실 가기", indivReward: "자유 휴식권", lastLoginDate: '' };
            if (!classData["1학년 2반"]) classData["1학년 2반"] = { current: 0, target: 5000, reward: "상상체험실 가기", indivReward: "자유 휴식권", lastLoginDate: '' };
            if (!studentData["1학년 1반"]) studentData["1학년 1반"] = [];
            if (!studentData["1학년 2반"]) studentData["1학년 2반"] = [];

            document.getElementById('server-status').innerText = "🟢 실시간 구글 시트 연결됨";
        } else {
            document.getElementById('server-status').innerText = "✅ 로컬 모드 (배포 시 URL 입력 필수)";
            document.getElementById('server-status').style.background = "#FFCA28";
            document.getElementById('server-status').style.color = "#3D2B1F";
            
            // URL이 없으면 로컬 스토리지 데이터 사용
            let rawData = localStorage.getItem('localStudentData');
            if(rawData) {
                let parsed = JSON.parse(rawData);
                if(parsed.studentData) studentData = parsed.studentData;
                if(parsed.classData) classData = parsed.classData;
            } else {
                // 최초 더미 데이터
                studentData["1학년 1반"].push({ name: "김에이스", errorMode: "stop", allowedMenus: ["자리 연습", "낱말 연습", "문장 연습"], stats: { maxWpm: 0 }, weakness: {}, totalScore: 0, earnedTicket: false, completedMenus: [], mission: {type: 'score', val: 5000} });
            }
        }
    } catch (error) {
        console.error("데이터 불러오기 실패:", error);
        document.getElementById('server-status').innerText = "⚠️ 서버 연결 실패 (로컬 모드)";
    }

    // 매일 자정 리셋 체크
    checkDailyReset();
        const classSelect = document.getElementById('student-class');
        const nameSelect = document.getElementById('student-name');
        const loginBtn = document.getElementById('student-login-btn');
    updateAllUI();

    // ====================================================
    // 2. 구글 서버(GAS) 데이터 저장 로직
    // ====================================================
    window.saveData = function() {
        localStorage.setItem('adminPw', adminPassword);
        
        // 로컬 백업용
        localStorage.setItem('localStudentData', JSON.stringify({
            studentData: studentData,
            classData: classData
        }));

        if (GAS_URL && GAS_URL !== "") {
            // 구글 시트로 백그라운드 전송
            fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ 
                    data: {
                        studentData: studentData,
                        classData: classData,
                        adminPassword: adminPassword
                    } 
                })
            }).catch(err => console.error("구글 시트 저장 오류:", err));
        }
    };

    function checkDailyReset() {
        let todayStr = new Date().toISOString().slice(0, 10);
        let cls = "1학년 1반"; 
        if (classData[cls] && classData[cls].lastLoginDate !== todayStr) {
            console.log("새로운 날! 일일 데이터 초기화");
            Object.keys(studentData).forEach(c => {
                studentData[c].forEach(student => {
                    student.totalScore = 0;          
                    student.earnedTicket = false;    
                    student.completedMenus = [];     
                });
            });
            Object.keys(classData).forEach(c => {
                classData[c].lastLoginDate = todayStr;
            });
            window.saveData();
        }
    }

    function updateAllUI() {
        if(document.getElementById('loading-screen').classList.contains('active')) {
            showScreen('student-login-screen');
            document.getElementById('admin-btn').style.display = 'block';
        }
        updateStudentSelects();
        if (document.getElementById('admin-screen').classList.contains('active')) renderStudentTable();
        if (document.getElementById('student-menu-screen').classList.contains('active')) renderMainMenu();
        if (document.getElementById('practice-screen').classList.contains('active')) updateClassGoalUI();
    }

    // ====================================================
    // 3. UI 및 모달 로직
    // ====================================================
    function showScreen(screenId) { 
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); 
        document.getElementById(screenId).classList.add('active'); 
    }

    let pwActionTarget = ""; 
    function showPwModal(title, action) {
        document.getElementById('pw-modal-title').innerText = title; document.getElementById('pw-modal-input').value = "";
        pwActionTarget = action; document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('pw-modal').classList.remove('hidden'); document.getElementById('alert-modal').classList.add('hidden'); document.getElementById('ticket-modal').classList.add('hidden'); document.getElementById('ai-modal').classList.add('hidden');
        setTimeout(() => document.getElementById('pw-modal-input').focus(), 100);
    }

    function showAlert(msg) {
        document.getElementById('alert-modal-msg').innerText = msg; document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('alert-modal').classList.remove('hidden'); document.getElementById('pw-modal').classList.add('hidden'); document.getElementById('ticket-modal').classList.add('hidden'); document.getElementById('ai-modal').classList.add('hidden');
    }

    function showTicketModal() {
        document.getElementById('ticket-reward-name').innerText = classData[currentUserClass].indivReward || "자유 휴식권";
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('ticket-modal').classList.remove('hidden');
        document.getElementById('pw-modal').classList.add('hidden'); document.getElementById('alert-modal').classList.add('hidden'); document.getElementById('ai-modal').classList.add('hidden');
    }
    
    function showAiModal() {
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('ai-modal').classList.remove('hidden');
        document.getElementById('pw-modal').classList.add('hidden'); document.getElementById('alert-modal').classList.add('hidden'); document.getElementById('ticket-modal').classList.add('hidden');
        document.getElementById('ai-loading').style.display = "none";
    }

    function closeModals() { document.getElementById('modal-overlay').classList.add('hidden'); }
    document.getElementById('pw-modal-cancel').addEventListener('click', closeModals);
    document.getElementById('alert-modal-ok').addEventListener('click', closeModals);
    document.getElementById('ticket-modal-ok').addEventListener('click', () => { closeModals(); goToMenu(); });
    document.getElementById('ai-modal-cancel').addEventListener('click', closeModals);
    document.getElementById('ai-open-modal-btn').addEventListener('click', showAiModal);

    document.getElementById('pw-modal-submit').addEventListener('click', () => {
        let pw = document.getElementById('pw-modal-input').value;
        if (pwActionTarget === 'login' && pw === adminPassword) { closeModals(); showScreen('admin-screen'); renderStudentTable(); } 
        else if (pwActionTarget === 'change' && pw.trim() !== "") { adminPassword = pw; window.saveData(); showAlert("변경 완료"); }
        else { showAlert("오류: 비번을 확인하세요."); }
    });

    document.getElementById('pw-modal-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('pw-modal-submit').click(); });
    document.getElementById('admin-btn').addEventListener('click', () => showPwModal("관리자 로그인 (초기: 0000)", "login"));
    document.getElementById('close-admin-btn').addEventListener('click', () => { showScreen('student-login-screen'); updateStudentSelects(); });
    document.getElementById('change-pw-btn').addEventListener('click', () => showPwModal("새로운 비밀번호 입력", "change"));

    document.getElementById('reset-daily-btn').addEventListener('click', () => {
        let cls = document.getElementById('admin-class').value;
        if(confirm(`[${cls}] 학생들의 '오늘 획득 점수'를 0으로 강제 초기화할까요?`)) {
            studentData[cls].forEach(s => { s.totalScore = 0; s.earnedTicket = false; s.completedMenus = []; });
            window.saveData(); showAlert("초기화 완료!");
        }
    });
    
    function updateStudentSelects() {
        classSelect.value = ""; nameSelect.innerHTML = '<option value="">먼저 반을 선택하세요</option>';
        nameSelect.disabled = true; loginBtn.disabled = true;
    }

    classSelect.addEventListener('change', () => {
        let cls = classSelect.value;
        if (cls && studentData[cls] && studentData[cls].length > 0) {
            nameSelect.disabled = false; nameSelect.innerHTML = '<option value="">이름을 선택하세요</option>';
            studentData[cls].forEach((s, idx) => { nameSelect.innerHTML += `<option value="${idx}">${s.name}</option>`; });
        } else { nameSelect.innerHTML = '<option value="">등록된 학생이 없습니다</option>'; nameSelect.disabled = true; }
        loginBtn.disabled = true;
    });

    nameSelect.addEventListener('change', () => { loginBtn.disabled = nameSelect.value === ""; });
    loginBtn.addEventListener('click', () => {
        currentUserClass = classSelect.value;
        currentUser = studentData[currentUserClass][nameSelect.value];
        renderMainMenu(); showScreen('student-menu-screen');
    });

    document.getElementById('logout-btn').addEventListener('click', () => { updateStudentSelects(); showScreen('student-login-screen'); });
    
    // ====================================================
    // 4. 교사 관리자 테이블
    // ====================================================
    const ALL_MENUS = ['기본자리', '왼손 윗자리', '왼손 아랫자리', '가운데 자리', '오른손 윗자리', '오른손 아랫자리', '낱말 연습', '문장 연습'];

    document.getElementById('add-student-btn').addEventListener('click', () => {
        let selectedClass = document.getElementById('admin-class').value;
        let newName = document.getElementById('admin-new-student').value.trim();
        if (newName) {
            studentData[selectedClass].push({ name: newName, errorMode: "stop", allowedMenus: ["자리 연습", "낱말 연습"], stats: { maxWpm: 0 }, weakness: {}, totalScore: 0, earnedTicket: false, completedMenus: [], mission: {type: 'score', val: 5000} });
            window.saveData(); document.getElementById('admin-new-student').value = '';
            renderStudentTable();
        }
    });

    function renderStudentTable() {
        let selectedClass = document.getElementById('admin-class').value;
        let tbody = document.getElementById('student-list');
        tbody.innerHTML = '';

        studentData[selectedClass].forEach((student, index) => {
            let tr = document.createElement('tr');
            const UI_MENUS = ['자리 연습', '낱말 연습', '문장 연습'];
            let checkboxes = UI_MENUS.map(menu => `<label class="checkbox-label" style="font-weight:900; display:inline-block; margin-right:8px; margin-bottom:5px;"><input type="checkbox" class="menu-chk" data-cls="${selectedClass}" data-idx="${index}" data-menu="${menu}" ${student.allowedMenus.includes(menu) ? 'checked' : ''}> ${menu}</label>`).join('');

            let weakStr = "없음";
            if (student.weakness && Object.keys(student.weakness).length > 0) {
                let sortedWeakness = Object.entries(student.weakness).sort((a, b) => b[1] - a[1]);
                weakStr = sortedWeakness.slice(0, 3).map(x => x[0]).join(', ');
            }

            tr.innerHTML = `
                <td style="font-weight:900; font-size:16px;">${student.name}<br>
                    <button class="ai-btn ai-analyze-btn" data-name="${student.name}" data-wpm="${student.stats.maxWpm}" data-weak="${weakStr}" data-idx="${index}" style="margin-top:10px; padding:8px 12px; font-size:12px; border-radius:8px; width:100%;">✨ AI 진단 및 칭찬</button>
                    <div id="ai-feedback-${index}" class="ai-feedback-box"></div>
                </td>
                <td>${window.getRankBadgeHTML(student.stats.maxWpm)}<div style="margin-top:5px; font-weight:700; color:#5BC044;">${student.stats.maxWpm}타</div></td>
                <td style="text-align:left;">
                    <select class="err-mode-sel" data-cls="${selectedClass}" data-idx="${index}" style="padding: 5px; font-size:13px; margin-bottom:5px; width:100%; border:2px solid #FFE485; border-radius:8px;">
                        <option value="stop" ${student.errorMode === 'stop' ? 'selected' : ''}>🛡️ 오타 시 잠김 모드</option>
                        <option value="hint" ${student.errorMode === 'hint' ? 'selected' : ''}>🚦 힌트만 주고 통과</option>
                    </select><br>${checkboxes}
                </td>
                <td><button class="delete-btn" data-cls="${selectedClass}" data-idx="${index}">삭제</button></td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.err-mode-sel').forEach(sel => { sel.addEventListener('change', (e) => { studentData[e.target.dataset.cls][e.target.dataset.idx].errorMode = e.target.value; window.saveData(); }); });
        document.querySelectorAll('.menu-chk').forEach(chk => { chk.addEventListener('change', (e) => { let cls = e.target.dataset.cls, idx = e.target.dataset.idx, menu = e.target.dataset.menu; let menus = studentData[cls][idx].allowedMenus; if (e.target.checked) menus.push(menu); else studentData[cls][idx].allowedMenus = menus.filter(m => m !== menu); window.saveData(); }); });
        document.querySelectorAll('.delete-btn').forEach(btn => { btn.addEventListener('click', (e) => { if(confirm("정말 삭제하시겠습니까?")) { studentData[e.target.dataset.cls].splice(e.target.dataset.idx, 1); window.saveData(); renderStudentTable(); } }); });
        
        // AI 진단 버튼
        document.querySelectorAll('.ai-analyze-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!apiKey) {
                    alert("API 키가 설정되지 않아 AI 기능을 사용할 수 없습니다. 일반 기능은 정상 작동합니다!");
                    return;
                }
                const name = e.target.dataset.name; const wpm = e.target.dataset.wpm; const weak = e.target.dataset.weak; const idx = e.target.dataset.idx;
                const feedbackBox = document.getElementById(`ai-feedback-${idx}`);
                e.target.disabled = true; e.target.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 분석 중...`;
                const prompt = `당신은 특수교육 선생님입니다. 학생 '${name}'의 타자 기록(최고 속도: ${wpm}타/분, 가장 많이 틀리는 자음/모음: ${weak})을 바탕으로, 이 학생에게 직접 들려줄 따뜻하고 희망찬 칭찬과 조언을 2문장으로 짧게 작성해주세요.`;
                const feedback = await callGeminiAPI(prompt, false);
                if(feedback) { feedbackBox.innerHTML = `<strong>🤖 AI 보조교사:</strong><br>${feedback}`; feedbackBox.style.display = 'block'; }
                e.target.innerHTML = `✨ AI 진단 및 칭찬`; e.target.disabled = false;
            });
        });

        updateChart(); 
    }

    document.getElementById('admin-class').addEventListener('change', renderStudentTable);

    function updateChart() {
        let selectedClass = document.getElementById('admin-class').value;
        let students = studentData[selectedClass];
        let labels = students.map(s => s.name);
        let wpmData = students.map(s => s.stats ? s.stats.maxWpm : 0);

        if (chartInstance) { chartInstance.destroy(); } 
        const ctx = document.getElementById('wpmChart').getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: '최고 타수', data: wpmData, backgroundColor: 'rgba(91, 192, 68, 0.8)', borderColor: 'rgba(91, 192, 68, 1)', borderWidth: 3, borderRadius: 12 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, suggestedMax: 300, grid: { color: '#FFE485' }, ticks: { font: { size: 14, weight: 'bold', family: 'Noto Sans KR' }, color: '#FF6B35' } }, x: { grid: { display: false }, ticks: { font: { size: 16, weight: 'bold', family: 'Noto Sans KR' }, color: '#3D2B1F' } } }, plugins: { legend: { display: false }, title: { display: true, text: `👑 ${selectedClass} 타수 랭킹 👑`, font: {size: 24, family: 'Noto Sans KR', weight: '900'}, color: '#FF6B35', padding: {bottom: 20} } } }
        });
    }

    // ====================================================
    // 5. 랭킹, 메뉴, 타자 연습 로직
    // ====================================================
    const BADGE_DEFS = [
        { req: 30, name: "Lv.1 씨앗", icon: "fa-seedling", color: "color-lv1" }, { req: 50, name: "Lv.2 새싹", icon: "fa-leaf", color: "color-lv2" },
        { req: 60, name: "Lv.3 잎새", icon: "fa-leaf", color: "color-lv2" }, { req: 70, name: "Lv.4 가지", icon: "fa-leaf", color: "color-lv3" },
        { req: 80, name: "Lv.5 나무", icon: "fa-tree", color: "color-lv3" }, { req: 90, name: "Lv.6 숲", icon: "fa-tree", color: "color-lv3" },
        { req: 100, name: "동메달", icon: "fa-award", color: "color-bronze" }, { req: 120, name: "동메달+", icon: "fa-award", color: "color-bronze" },
        { req: 140, name: "동메달++", icon: "fa-award", color: "color-bronze" }, { req: 160, name: "동메달+++", icon: "fa-award", color: "color-bronze" },
        { req: 180, name: "동메달++++", icon: "fa-award", color: "color-bronze" }, { req: 200, name: "은메달", icon: "fa-medal", color: "color-silver" },
        { req: 250, name: "금메달", icon: "fa-crown", color: "color-gold" }, { req: 300, name: "전설의 타자", icon: "fa-gem", color: "color-ace" }
    ];

    window.getRankBadgeHTML = function(wpm) {
        if (wpm < 30) return `<span class="rank-badge rank-basic">연습생</span>`;
        let currentBadge = BADGE_DEFS[0];
        for(let i=0; i<BADGE_DEFS.length; i++) { if(wpm >= BADGE_DEFS[i].req) currentBadge = BADGE_DEFS[i]; }
        let bClass = currentBadge.color.replace('color-', 'rank-');
        return `<span class="rank-badge ${bClass}"><i class="fa-solid ${currentBadge.icon}"></i> ${currentBadge.name}</span>`;
    };

    function updateClassGoalUI() {
        let cData = classData[currentUserClass];
        if(!cData) return;
        let percent = Math.min(100, (cData.current / cData.target) * 100).toFixed(1);
        document.querySelectorAll('.class-goal-percent').forEach(el => el.innerHTML = `${percent}% 달성 중!`);
        document.querySelectorAll('.class-goal-fill').forEach(el => el.style.width = percent + '%');
    }

    function renderMainMenu() {
        document.getElementById('welcome-message').innerText = `👋 ${currentUser.name} 님`;
        document.getElementById('user-rank-badge').innerHTML = window.getRankBadgeHTML(currentUser.stats.maxWpm);
        
        let missionBox = document.getElementById('individual-mission');
        if(currentUser.earnedTicket) {
            missionBox.innerText = `✅ 오늘의 미션 완료! 보너스 점수 적립 중!`; missionBox.classList.add('completed');
        } else {
            missionBox.innerText = `오늘 모은 점수: ${currentUser.totalScore} 점`; missionBox.classList.remove('completed');
        }

        updateClassGoalUI();

        let menuGrid = document.getElementById('allowed-menus'); menuGrid.innerHTML = '';
        currentUser.allowedMenus.forEach(menu => {
            let btn = document.createElement('button'); btn.innerText = menu; 
            btn.onclick = () => { if (menu === "자리 연습") renderSubMenu(); else window.startPractice(menu, menu); };
            menuGrid.appendChild(btn);
        });
    }

    function renderSubMenu() {
        let menuGrid = document.getElementById('allowed-menus'); menuGrid.innerHTML = '';
        // ✨ 선생님의 요청에 맞춘 세분화된 자리 연습 하위 메뉴
        const subMenus = ['기본자리', '왼손 윗자리', '왼손 아랫자리', '가운데 자리', '오른손 윗자리', '오른손 아랫자리'];
        subMenus.forEach(menu => {
            let btn = document.createElement('button'); btn.innerText = menu; btn.style.padding = "20px"; btn.style.fontSize = "22px";
            if ((currentUser.completedMenus || []).includes(menu)) {
                btn.innerText = `✅ ` + menu; btn.style.background = "#FFF"; btn.style.color = "#5BC044"; btn.style.border = "3px solid #5BC044"; btn.style.boxShadow = "0 8px 0 #A9DB9A";
            }
            btn.onclick = () => window.startPractice(menu, "자리 연습");
            menuGrid.appendChild(btn);
        });
        let backBtn = document.createElement('button'); backBtn.innerText = "⬅️ 뒤로 가기"; backBtn.className = "secondary-btn"; backBtn.style.gridColumn = "1 / -1";
        backBtn.onclick = renderMainMenu; menuGrid.appendChild(backBtn);
    }

    window.goToMenu = function() { renderMainMenu(); showScreen('student-menu-screen'); };

    document.getElementById('my-profile-btn').addEventListener('click', () => {
        document.getElementById('profile-student-name').innerText = currentUser.name;
        document.getElementById('profile-max-wpm').innerText = currentUser.stats.maxWpm;
        let container = document.getElementById('badge-container'); container.innerHTML = '';
        BADGE_DEFS.forEach(badge => {
            let isUnlocked = currentUser.stats.maxWpm >= badge.req;
            let card = document.createElement('div'); card.className = `badge-card ${isUnlocked ? 'unlocked' : 'badge-locked'}`;
            let iconHtml = isUnlocked ? `<i class="fa-solid ${badge.icon}"></i>` : `<i class="fa-solid fa-lock"></i>`;
            card.innerHTML = `<div class="badge-icon ${isUnlocked ? badge.color : ''}">${iconHtml}</div><div class="badge-title">${badge.name}</div><div class="badge-req">${badge.req}타 달성</div>`;
            container.appendChild(card);
        });
        showScreen('slide-profile');
    });
    document.getElementById('back-from-profile-btn').addEventListener('click', window.goToMenu);

    // ✨ 완벽하게 개편된 자리 연습 및 기본 텍스트
    const practiceContents = {
        "기본자리": ["ㅁ", "ㄴ", "ㅇ", "ㄹ", "ㅓ", "ㅏ", "ㅣ"],
        "왼손 윗자리": ["ㅂ", "ㅈ", "ㄷ", "ㄱ", "ㅃ", "ㅉ", "ㄸ", "ㄲ"],
        "왼손 아랫자리": ["ㅋ", "ㅌ", "ㅊ", "ㅍ"],
        "가운데 자리": ["ㅅ", "ㅆ", "ㅛ", "ㅎ", "ㅗ", "ㅠ", "ㅜ"],
        "오른손 윗자리": ["ㅕ", "ㅑ", "ㅐ", "ㅔ"],
        "오른손 아랫자리": ["ㅡ", ",", "."],
        "낱말 연습": ["학교", "사과", "코끼리", "기차", "하늘", "바다", "토끼", "햇님", "꽃밭", "아빠", "엄마", "선생님", "컴퓨터", "마우스", "키보드", "의자", "가방", "연필", "우산", "안경", "자동차", "강아지", "고양이", "바나나", "포도", "딸기", "나비", "거미"],
        "문장 연습": ["나비가 꽃밭에 앉아 있습니다.", "나는 매일 학교에 갑니다.", "우리 모두 함께 노래해요.", "즐거운 타자 연습 시간입니다.", "차를 탈 때는 안전벨트를 매요.", "친구와 사이좋게 지냅니다.", "선생님 말씀에 귀 기울여요.", "일찍 자고 일찍 일어납니다.", "양치질을 깨끗하게 해요.", "운동장에서 신나게 뛰어놀아요."]
    };
    const jasoToKeyMap = { 'ㅂ':'q', 'ㅈ':'w', 'ㄷ':'e', 'ㄱ':'r', 'ㅅ':'t', 'ㅛ':'y', 'ㅕ':'u', 'ㅑ':'i', 'ㅐ':'o', 'ㅔ':'p', 'ㅁ':'a', 'ㄴ':'s', 'ㅇ':'d', 'ㄹ':'f', 'ㅎ':'g', 'ㅗ':'h', 'ㅓ':'j', 'ㅏ':'k', 'ㅣ':'l', 'ㅋ':'z', 'ㅌ':'x', 'ㅊ':'c', 'ㅍ':'v', 'ㅠ':'b', 'ㅜ':'n', 'ㅡ':'m', 'ㅃ':'q', 'ㅉ':'w', 'ㄸ':'e', 'ㄲ':'r', 'ㅆ':'t', 'ㅒ':'o', 'ㅖ':'p', ',': 'comma', '.': 'period', ' ':'space' };
    const requiresShift = ['ㅃ', 'ㅉ', 'ㄸ', 'ㄲ', 'ㅆ', 'ㅒ', 'ㅖ'];

    let currentWordList = []; let practiceQueue = []; let WORDS_PER_SESSION = 10; let currentWordIndex = 0; 
    let currentWord = ""; let sessionStartTime = 0; let isPracticing = false;
    let totalAccumulatedStrokes = 0; let totalErrorCount = 0; let currentCombo = 0;   
    let requireEnter = false; let lastValidValue = ""; let isErrorState = false; let lastErrorValue = "";
    let isTransitioning = false; let sessionPhysicalStrokes = 0; let lastInputJasoLength = 0; let lastInputValRaw = "";

    let isBlindMode = true; let currentCalculatedWpm = 0; 

    const typingInput = document.getElementById('typing-input');
    const targetText = document.getElementById('target-text');
    const wpmDisplay = document.getElementById('wpm-display');
    const accDisplay = document.getElementById('acc-display');
    const feedbackMsg = document.getElementById('feedback-msg');

    document.getElementById('badge-wpm').addEventListener('click', () => { isBlindMode = !isBlindMode; updateBlindDisplay(); });
    function updateBlindDisplay() { wpmDisplay.innerText = isBlindMode ? "🙈" : currentCalculatedWpm; }

    function getStrokeCount(text) {
        if (!text) return 0;
        let jaso = Hangul.disassemble(text); let strokes = jaso.length;
        for (let i = 0; i < jaso.length; i++) { if (requiresShift.includes(jaso[i])) strokes++; }
        return strokes;
    }

    document.getElementById('practice-screen').addEventListener('click', (e) => { if(e.target.id !== 'end-practice-btn') typingInput.focus(); });

    function updateTargetTextDisplay(inputVal) {
        let validLen = inputVal.length; let html = "";
        for (let i = 0; i < currentWord.length; i++) {
            if (i < validLen - 1) html += `<span class="char-typed">${currentWord[i]}</span>`;
            else if (i === validLen - 1) html += `<span class="char-current">${currentWord[i]}</span>`;
            else if (i === 0 && validLen === 0) html += `<span class="char-current">${currentWord[i]}</span>`;
            else html += `<span class="char-pending">${currentWord[i]}</span>`;
        }
        targetText.innerHTML = html;
    }

    window.startPractice = function(menuName, category) {
        currentMode = menuName; currentCategory = category || menuName;
        currentWordList = practiceContents[menuName] || practiceContents["낱말 연습"];
        
        // 구글 시트에 AI가 만든 단어나 문장이 저장되어있다면 불러와서 섞기
        if(classData[currentUserClass] && classData[currentUserClass].aiSentences) {
            classData[currentUserClass].aiSentences.forEach(s => {
                if(!practiceContents["문장 연습"].includes(s)) practiceContents["문장 연습"].push(s);
            });
        }
        if(classData[currentUserClass] && classData[currentUserClass].aiWords) {
            classData[currentUserClass].aiWords.forEach(w => {
                if(!practiceContents["낱말 연습"].includes(w)) practiceContents["낱말 연습"].push(w);
            });
        }
        
        document.getElementById('practice-user-info').innerText = `${currentUser.name} (${menuName})`;
        
        const practiceArea = document.querySelector('.practice-area');
        if (currentCategory === "문장 연습") { WORDS_PER_SESSION = 15; requireEnter = true; practiceArea.classList.add('sentence-mode'); } 
        else if (currentCategory === "낱말 연습") { WORDS_PER_SESSION = 30; requireEnter = false; practiceArea.classList.remove('sentence-mode'); } 
        else { WORDS_PER_SESSION = 50; requireEnter = false; practiceArea.classList.remove('sentence-mode'); }
        
        practiceQueue = []; for(let i = 0; i < WORDS_PER_SESSION; i++) practiceQueue.push(currentWordList[Math.floor(Math.random() * currentWordList.length)]);
        currentWordIndex = 0; totalAccumulatedStrokes = 0; totalErrorCount = 0; currentCombo = 0; currentSessionScore = 0;
        
        isBlindMode = true; currentCalculatedWpm = 0; updateBlindDisplay();
        accDisplay.innerText = "100"; document.getElementById('combo-wrap').style.opacity = 0;
        
        isPracticing = true; sessionStartTime = 0; isTransitioning = false; 
        sessionPhysicalStrokes = 0; lastInputJasoLength = 0; lastInputValRaw = "";
        document.getElementById('badge-wpm').style.display = 'inline-flex'; document.getElementById('badge-time').style.display = 'none';
        
        showScreen('practice-screen'); nextWord();
    }

    function clearIME() { const hidden = document.getElementById('hidden-ime-clear'); hidden.focus(); setTimeout(() => { typingInput.value = ''; typingInput.focus(); }, 10); }

    function nextWord() {
        if (currentWordIndex >= WORDS_PER_SESSION) { endPracticeSession(true); return; }
        currentWord = practiceQueue[currentWordIndex]; currentWordIndex++;
        document.getElementById('progress-display').innerText = `${currentWordIndex} / ${WORDS_PER_SESSION}`;
        document.getElementById('next-word-preview').innerText = currentWordIndex < WORDS_PER_SESSION ? "다음: " + practiceQueue[currentWordIndex] : "다음: (마지막 문제)";
        
        clearIME(); lastValidValue = ""; lastErrorValue = ""; isErrorState = false; 
        lastInputJasoLength = 0; lastInputValRaw = "";
        updateTargetTextDisplay(""); typingInput.classList.remove('text-error', 'shake');
        feedbackMsg.style.color = '#8A8A8A'; feedbackMsg.innerText = "타자를 시작하세요.";
        setTimeout(() => { isTransitioning = false; }, 30);
    }

    function processWordCompletion() {
        if (isTransitioning) return; 
        isTransitioning = true; 
        let strokes = getStrokeCount(currentWord);
        totalAccumulatedStrokes += strokes;
        currentCombo++;
        let comboWrap = document.getElementById('combo-wrap');
        if (currentCombo > 2) {
            comboWrap.style.opacity = 1; document.getElementById('combo-count').innerText = currentCombo; document.getElementById('combo-msg').innerText = "COMBO!";
        }
        currentSessionScore += (strokes * 10);
        nextWord(); 
    }

    typingInput.addEventListener('keydown', function(e) {
        if (!isPracticing || isTransitioning) return;
        if (currentUser.errorMode === 'stop' && isErrorState && e.key !== 'Backspace' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') { e.preventDefault(); this.classList.add('shake'); setTimeout(() => this.classList.remove('shake'), 200); return; }
        if (requireEnter && e.key === 'Enter' && this.value === currentWord && !isErrorState) { e.preventDefault(); processWordCompletion(); }
    });

    typingInput.addEventListener('input', function(e) {
        if (!isPracticing || isTransitioning) { if(isTransitioning) this.value = lastValidValue; return; }
        let inputVal = this.value;
        if (inputVal.startsWith(' ') && currentWord[0] !== ' ') { this.value = ''; return; }
        if (sessionStartTime === 0 && inputVal.length > 0) sessionStartTime = Date.now();

        if (inputVal.length === 0) {
            if (sessionPhysicalStrokes > 0) sessionPhysicalStrokes += 1; 
            lastValidValue = ""; lastErrorValue = ""; isErrorState = false; updateTargetTextDisplay("");
            this.classList.remove('text-error', 'shake'); feedbackMsg.style.color = '#8A8A8A'; feedbackMsg.innerText = "타자를 계속하세요."; 
            if (totalAccumulatedStrokes === 0) sessionStartTime = 0; 
            lastInputJasoLength = 0; lastInputValRaw = "";
            return;
        }

        if (currentUser.errorMode === 'stop' && isErrorState) {
            if (inputVal.length > lastErrorValue.length || Hangul.disassemble(inputVal).length > Hangul.disassemble(lastErrorValue).length) {
                this.value = lastErrorValue; this.classList.add('shake'); setTimeout(() => this.classList.remove('shake'), 200); return;
            }
        }

        let currentJasoLen = getStrokeCount(inputVal);
        let strokeDiff = currentJasoLen - lastInputJasoLength;
        if (strokeDiff !== 0) sessionPhysicalStrokes += Math.abs(strokeDiff);
        else if (inputVal !== lastInputValRaw) sessionPhysicalStrokes += 1;
        lastInputJasoLength = currentJasoLen; lastInputValRaw = inputVal;

        let inputJaso = Hangul.disassemble(inputVal); let targetJaso = Hangul.disassemble(currentWord);
        let mismatchIndex = -1; let isError = false;
        for (let i = 0; i < inputJaso.length; i++) { if (inputJaso[i] !== targetJaso[i]) { isError = true; mismatchIndex = i; break; } }

        if (isError) {
            if (!isErrorState) { totalErrorCount++; currentCombo = 0; document.getElementById('combo-wrap').style.opacity = 0; }
            isErrorState = true; lastErrorValue = inputVal; 
            this.classList.add('text-error'); feedbackMsg.style.color = '#FF4757'; feedbackMsg.innerText = "틀렸습니다! 백스페이스(←)로 지우세요.";
        } else {
            isErrorState = false; lastValidValue = inputVal; updateTargetTextDisplay(inputVal); 
            this.classList.remove('text-error', 'shake'); feedbackMsg.style.color = '#5BC044';
            feedbackMsg.innerText = (this.value === currentWord && requireEnter) ? "엔터(Enter) 키를 눌러 다음으로 넘어가세요 ⏎" : "잘하고 있습니다!";
        }

        if (sessionStartTime > 0) {
            let timeElapsedMin = (Date.now() - sessionStartTime) / 60000;
            if (timeElapsedMin > 0.016 || sessionPhysicalStrokes > 2) { 
                let wpm = Math.floor(sessionPhysicalStrokes / Math.max(timeElapsedMin, 0.0083));
                if (wpm > 2000) wpm = 2000;
                currentCalculatedWpm = wpm; updateBlindDisplay();
            }
            let totalCurrentExpected = totalAccumulatedStrokes + getStrokeCount(isErrorState ? lastValidValue : inputVal);
            let accuracy = 100;
            if (totalCurrentExpected > 0) accuracy = Math.max(0, Math.floor(((totalCurrentExpected - totalErrorCount) / totalCurrentExpected) * 100));
            accDisplay.innerText = accuracy;
        }
        if (this.value === currentWord && !requireEnter && !isErrorState) processWordCompletion();
    });

    function endPracticeSession(isCompleted) {
        isPracticing = false; typingInput.value = ''; lastValidValue = '';
        let currentWpm = currentCalculatedWpm;
        
        if (isCompleted && currentCategory !== "자리 연습" && currentWpm > currentUser.stats.maxWpm) { 
            currentUser.stats.maxWpm = currentWpm; 
        }
        
        if (isCompleted) {
            if (!currentUser.completedMenus) currentUser.completedMenus = [];
            if (!currentUser.completedMenus.includes(currentMode)) currentUser.completedMenus.push(currentMode);
        }

        currentUser.totalScore += currentSessionScore;
        classData[currentUserClass].current += currentSessionScore;
        
        // 미션 체크
        if(currentUser.totalScore >= 5000 && !currentUser.earnedTicket) {
            currentUser.earnedTicket = true;
            setTimeout(showTicketModal, 500); 
        }

        window.saveData(); // 데이터 저장

        if (isCompleted) {
            document.getElementById('result-main-stat').innerHTML = `<span id="final-wpm">${currentWpm}</span> 타/분`;
            document.getElementById('final-acc').innerText = accDisplay.innerText;
            document.getElementById('final-earned-score').innerText = currentSessionScore;
            showScreen('result-screen');
        } else {
            window.goToMenu();
        }
    }
    document.getElementById('end-practice-btn').addEventListener('click', () => endPracticeSession(false));
    document.getElementById('back-to-menu-btn').addEventListener('click', () => {
        if(currentUser.totalScore >= 5000 && !currentUser.earnedTicket) { currentUser.earnedTicket = true; window.saveData(); showTicketModal(); }
        else { window.goToMenu(); }
    });

    // ====================================================
    // 6. Gemini AI 연동 로직
    // ====================================================
    async function callGeminiAPI(prompt, isJson = false) {
        if(!apiKey) { alert("API 키가 설정되지 않아 AI 기능을 사용할 수 없습니다."); return null; }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        if(isJson) { payload.generationConfig = { responseMimeType: "application/json", responseSchema: { type: "ARRAY", items: { type: "STRING" } } }; }
        
        let retries = 0; const delays = [1000, 2000, 4000, 8000, 16000];
        while (retries < 5) {
            try {
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const result = await response.json();
                return result.candidates[0].content.parts[0].text;
            } catch (error) {
                retries++;
                if (retries >= 5) { alert("AI 응답 지연: " + error.message); return null; }
                await new Promise(r => setTimeout(r, delays[retries - 1]));
            }
        }
    }

    document.getElementById('ai-generate-btn').addEventListener('click', async () => {
        if(!apiKey) { alert("API 키가 없어 생성할 수 없습니다."); return; }
        
        const type = document.getElementById('ai-type-select').value;
        const btn = document.getElementById('ai-generate-btn'); 
        const loading = document.getElementById('ai-loading');
        btn.disabled = true; loading.style.display = 'block';
        
        let prompt = "";
        if(type === 'word') {
            prompt = `특수교육 학생들의 타자 연습을 위한 긍정적이고, 아름답고, 희망찬 2~4글자의 한글 단어 10개를 만들어주세요. 특수문자는 제외하고 한글만 사용하세요. 배열 형태의 JSON으로 반환해주세요. (예: ["사랑", "희망", "행복", "친구", "미소"])`;
        } else {
            prompt = `특수교육 학생들의 타자 연습을 위한 긍정적이고, 아름답고, 위로가 되는 따뜻한 짧은 문장 5개를 만들어주세요. 특수교육 학생들이 이해하기 쉽도록 아주 직관적이고 다정한 어투로 작성해주세요. 특수문자는 제외하고 한글, 띄어쓰기, 마침표만 사용하세요. 배열 형태의 JSON으로 반환해주세요.`;
        }
        
        const resultText = await callGeminiAPI(prompt, true);
        if(resultText) {
            try {
                const items = JSON.parse(resultText);
                const cls = document.getElementById('admin-class').value;
                const targetKey = type === 'word' ? 'aiWords' : 'aiSentences';
                const targetMenu = type === 'word' ? '낱말 연습' : '문장 연습';

                if(!classData[cls][targetKey]) classData[cls][targetKey] = [];
                
                items.forEach(item => {
                    if(!classData[cls][targetKey].includes(item)) classData[cls][targetKey].push(item);
                    if(!practiceContents[targetMenu].includes(item)) practiceContents[targetMenu].push(item);
                });
                
                window.saveData();
                alert(`성공적으로 추가되었습니다!\n\n추가된 내용:\n- ` + items.join('\n- '));
                closeModals();
            } catch(e) { alert("생성에 실패했습니다. 다시 시도해주세요."); }
        }
        btn.disabled = false; loading.style.display = 'none';
    });

}); // DOMContentLoaded 끝
