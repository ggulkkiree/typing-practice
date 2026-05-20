document.addEventListener('DOMContentLoaded', async () => {

    // ====================================================
    // 🚨 선생님 설정 구역 — 여기만 수정하세요!
    // ====================================================
    const GAS_URL = "https://script.google.com/macros/s/AKfycbxV6okoAMnBKIjw7Y36eJnb09Ztk48KRZw-fHwIdsIWZeYp0qbDkMitef_QmlXIul6eNg/exec";
    // ====================================================
    // ✅ 반 목록은 이제 하드코딩 없이 서버/로컬 데이터에서 자동으로 불러옵니다.
    // ====================================================

    let adminPassword = localStorage.getItem('adminPw') || '0000';

    // 빈 상태로 시작 — 서버 또는 로컬에서 채워짐
    let classData = {};
    let studentData = {};

    // 데이터가 전혀 없을 때 기본 반 하나를 생성하는 헬퍼
    function ensureAtLeastOneClass() {
        if (Object.keys(classData).length === 0) {
            classData["1학년 1반"] = { current: 0, target: 5000, reward: "상상체험실 가기", indivReward: "자유 휴식권", lastLoginDate: '' };
            studentData["1학년 1반"] = [];
        }
    }

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

            if (data && Object.keys(data).length > 0) {
                if (data.studentData && Object.keys(data.studentData).length > 0) studentData = data.studentData;
                if (data.classData && Object.keys(data.classData).length > 0) classData = data.classData;
                if (data.adminPassword) adminPassword = data.adminPassword;
            }

            // classData에 있는 반 기준으로 studentData 누락분 보정 (동적)
            Object.keys(classData).forEach(cls => {
                if (!studentData[cls]) studentData[cls] = [];
            });
            // 데이터가 전혀 없을 때 기본 반 보장
            ensureAtLeastOneClass();

            document.getElementById('server-status').innerText = "🟢 실시간 구글 시트 연결됨";
        } else {
            document.getElementById('server-status').innerText = "✅ 로컬 모드 (배포 시 URL 입력 필수)";
            document.getElementById('server-status').style.background = "#FFCA28";
            document.getElementById('server-status').style.color = "#3D2B1F";

            let rawData = localStorage.getItem('localStudentData');
            if (rawData) {
                let parsed = JSON.parse(rawData);
                if (parsed.studentData) studentData = parsed.studentData;
                if (parsed.classData) classData = parsed.classData;
            }
            // 데이터가 전혀 없을 때 기본 반 보장
            ensureAtLeastOneClass();
        }
    } catch (error) {
        console.error("데이터 불러오기 실패:", error);
        document.getElementById('server-status').innerText = "⚠️ 서버 연결 실패 (로컬 모드)";
        // 서버 오류 시에도 로컬 데이터 복구 시도
        try {
            let rawData = localStorage.getItem('localStudentData');
            if (rawData) {
                let parsed = JSON.parse(rawData);
                if (parsed.studentData) studentData = parsed.studentData;
                if (parsed.classData) classData = parsed.classData;
            }
        } catch (e) { console.error("로컬 데이터 복구 실패:", e); }
        ensureAtLeastOneClass();
    }

    // ====================================================
    // 2. 구글 서버(GAS) 데이터 저장 로직
    // ====================================================

    // 항상 로컬에 전체 저장 (오프라인 fallback)
    function saveLocal() {
        localStorage.setItem('adminPw', adminPassword);
        localStorage.setItem('localStudentData', JSON.stringify({
            studentData: studentData,
            classData: classData
        }));
    }

    // 🔑 핵심 함수: 특정 학생 1명의 데이터만 GAS에 병합 저장
    // → 동시 접속 시 다른 학생 데이터를 덮어쓰지 않음
    window.saveStudentPatch = function (cls, studentObj) {
        saveLocal();
        if (GAS_URL && GAS_URL !== "") {
            fetch(GAS_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'patchStudent',
                    cls: cls,
                    student: studentObj,
                    classInfo: classData[cls]   // 반 공동 점수도 함께 전송
                })
            }).catch(err => console.error("학생 패치 저장 오류:", err));
        }
    };

    // 교사 설정 변경(반 추가/삭제, 학생 추가/삭제 등) 시 전체 저장
    window.saveData = function () {
        saveLocal();
        if (GAS_URL && GAS_URL !== "") {
            fetch(GAS_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'saveData',
                    data: {
                        studentData: studentData,
                        classData: classData,
                        adminPassword: adminPassword
                    }
                })
            }).catch(err => console.error("구글 시트 전체 저장 오류:", err));
        }
    };

    function checkDailyReset() {
        const todayStr = new Date().toISOString().slice(0, 10);

        // [버그1 수정] "1학년 1반" 하드코딩 제거 → 모든 반 중 하나라도 날짜가 다르면 전체 초기화
        const needsReset = Object.keys(classData).some(c =>
            classData[c] && classData[c].lastLoginDate !== todayStr
        );

        if (needsReset) {
            console.log("새로운 날! 일일 데이터 초기화");

            Object.keys(studentData).forEach(c => {
                if (Array.isArray(studentData[c])) {
                    studentData[c].forEach(student => {
                        student.totalScore = 0;
                        student.earnedTicket = false;
                        student.completedMenus = [];
                    });
                }
            });

            Object.keys(classData).forEach(c => {
                classData[c].lastLoginDate = todayStr;
                // [버그2 수정] 반 공동 달성 점수도 날마다 0으로 리셋
                classData[c].current = 0;
            });

            window.saveData();
        }
    }

    checkDailyReset();

    // [\uac1c\uc120] \ubc18 \ub4dc\ub86d\ub2e4\uc6b4\uc744 classData \ud0a4 \uae30\ubc18\uc73c\ub85c \ub3d9\uc801 \uc0dd\uc131
    function populateClassSelects() {
        const classes = Object.keys(classData);
        const studentClassEl = document.getElementById('student-class');
        const adminClassEl = document.getElementById('admin-class');

        // \ud559\uc0dd \ub85c\uadf8\uc778 \ub4dc\ub86d\ub2e4\uc6b4
        studentClassEl.innerHTML = '<option value="">\ubc18\uc744 \uc120\ud0dd\ud558\uc138\uc694</option>';
        classes.forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls; opt.textContent = cls;
            studentClassEl.appendChild(opt);
        });

        // \uad00\ub9ac\uc790 \ub4dc\ub86d\ub2e4\uc6b4
        const prevAdminVal = adminClassEl.value;
        adminClassEl.innerHTML = '';
        classes.forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls; opt.textContent = cls;
            adminClassEl.appendChild(opt);
        });
        // \uc774\uc804 \uc120\ud0dd\uac12 \ubcf5\uc6d0
        if (prevAdminVal && classes.includes(prevAdminVal)) adminClassEl.value = prevAdminVal;
    }

    function updateAllUI() {
        if (document.getElementById('loading-screen').classList.contains('active')) {
            showScreen('student-login-screen');
            document.getElementById('admin-btn').style.display = 'block';
        }
        populateClassSelects(); // [\uac1c\uc120] \ubc18 \ub4dc\ub86d\ub2e4\uc6b4 \ub3d9\uc801 \uc0dd\uc131
        updateStudentSelects();
        if (document.getElementById('admin-screen').classList.contains('active')) renderStudentTable();
        if (document.getElementById('student-menu-screen').classList.contains('active')) renderMainMenu();
        if (document.getElementById('practice-screen').classList.contains('active')) updateClassGoalUI();
    }


    // ====================================================
    // 3. UI 및 모달 로직
    // ====================================================
    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

        const targetScreen = document.getElementById(id);
        if (!targetScreen) {
            console.error("🚨 앗! index.html에 이 화면이 없어요:", id);
            return;
        }
        targetScreen.classList.add('active');
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
        if (confirm(`[${cls}] 학생들의 '오늘 획득 점수'를 0으로 강제 초기화할까요?`)) {
            studentData[cls].forEach(s => { s.totalScore = 0; s.earnedTicket = false; s.completedMenus = []; });
            window.saveData(); showAlert("초기화 완료!");
        }
    });

    function updateStudentSelects() {
        const classSelect = document.getElementById('student-class');
        const nameSelect = document.getElementById('student-name');
        const loginBtn = document.getElementById('student-login-btn');

        if (!classSelect || !nameSelect || !loginBtn) return;

        classSelect.value = "";
        nameSelect.innerHTML = '<option value="">먼저 반을 선택하세요</option>';
        nameSelect.disabled = true;
        loginBtn.disabled = true;
    }

    function bindStudentLoginEvents() {
        const classSelect = document.getElementById('student-class');
        const nameSelect = document.getElementById('student-name');
        const loginBtn = document.getElementById('student-login-btn');

        if (!classSelect || !nameSelect || !loginBtn) {
            console.error("학생 로그인 관련 DOM 요소를 찾지 못했습니다.");
            return;
        }

        classSelect.addEventListener('change', () => {
            const cls = classSelect.value;
            if (cls && Array.isArray(studentData[cls]) && studentData[cls].length > 0) {
                nameSelect.disabled = false;
                nameSelect.innerHTML = '<option value="">이름을 선택하세요</option>';
                studentData[cls].forEach((s, idx) => { nameSelect.innerHTML += `<option value="${idx}">${s.name}</option>`; });
            } else {
                nameSelect.innerHTML = '<option value="">등록된 학생이 없습니다</option>';
                nameSelect.disabled = true;
            }
            loginBtn.disabled = true;
        });

        nameSelect.addEventListener('change', () => { loginBtn.disabled = nameSelect.value === ""; });

        loginBtn.addEventListener('click', () => {
            currentUserClass = classSelect.value;
            currentUser = studentData[currentUserClass][nameSelect.value];
            renderMainMenu();
            showScreen('student-menu-screen');
        });
    }

    updateAllUI();
    bindStudentLoginEvents();

    // ====================================================
    // 4. 교사 관리자 테이블
    // ====================================================
    const ALL_MENUS = ['기본자리', '왼손 윗자리', '왼손 아랫자리', '가운데 자리', '오른손 윗자리', '오른손 아랫자리', '낱말 연습', '문장 연습'];

    // ─── 반 추가 ───────────────────────────────────────
    document.getElementById('add-class-btn').addEventListener('click', () => {
        const newClassName = prompt('새 반 이름을 입력하세요\n(예: 2학년 1반)');
        if (!newClassName || !newClassName.trim()) return;
        const trimmed = newClassName.trim();
        if (classData[trimmed]) {
            showAlert(`"${trimmed}" 반은 이미 존재합니다!`);
            return;
        }
        classData[trimmed] = { current: 0, target: 5000, reward: "상상체험실 가기", indivReward: "자유 휴식권", lastLoginDate: '' };
        studentData[trimmed] = [];
        window.saveData();
        populateClassSelects();
        // 새로 만든 반을 드롭다운에서 선택
        document.getElementById('admin-class').value = trimmed;
        renderStudentTable();
        showAlert(`✅ "${trimmed}" 반이 추가되었습니다!`);
    });

    // ─── 반 삭제 ───────────────────────────────────────
    document.getElementById('delete-class-btn').addEventListener('click', () => {
        const selectedClass = document.getElementById('admin-class').value;
        if (!selectedClass) return;
        const classes = Object.keys(classData);
        if (classes.length <= 1) {
            showAlert('마지막 반은 삭제할 수 없습니다!');
            return;
        }
        if (!confirm(`"${selectedClass}" 반 전체(학생 ${studentData[selectedClass].length}명 포함)를 삭제할까요?\n이 작업은 되돌릴 수 없습니다!`)) return;
        delete classData[selectedClass];
        delete studentData[selectedClass];
        window.saveData();
        populateClassSelects();
        renderStudentTable();
        showAlert(`🗑️ "${selectedClass}" 반이 삭제되었습니다.`);
    });

    document.getElementById('add-student-btn').addEventListener('click', () => {
        let selectedClass = document.getElementById('admin-class').value;
        let newName = document.getElementById('admin-new-student').value.trim();
        if (newName) {
            studentData[selectedClass].push({ name: newName, errorMode: "stop", allowedMenus: ["자리 연습", "낱말 연습"], stats: { maxWpm: 0 }, weakness: {}, totalScore: 0, earnedTicket: false, completedMenus: [], mission: { type: 'wpm', val: 80 } });
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
            let checkboxes = UI_MENUS.map(menu => `<label class="checkbox-label" style="font-weight:900; display:inline-block; margin-right:6px; margin-bottom:3px; font-size:12px;"><input type="checkbox" class="menu-chk" data-cls="${selectedClass}" data-idx="${index}" data-menu="${menu}" ${student.allowedMenus.includes(menu) ? 'checked' : ''}> ${menu}</label>`).join('');

            let weakStr = "없음";
            if (student.weakness && Object.keys(student.weakness).length > 0) {
                let sortedWeakness = Object.entries(student.weakness).sort((a, b) => b[1] - a[1]);
                weakStr = sortedWeakness.slice(0, 3).map(x => x[0]).join(', ');
            }

            // WPM 기반 미션 표시
            const wpmTarget = (student.mission && student.mission.val) || 80;
            const maxWpm = student.stats?.maxWpm || 0;
            const todayScore = student.totalScore || 0;
            const ticketStatus = student.earnedTicket ? '✅ 달성' : (maxWpm > 0 ? `${maxWpm}타` : '-');
            const statusColor = student.earnedTicket ? '#5BC044' : '#888';

            tr.innerHTML = `
                <td style="font-weight:900; font-size:14px;">${student.name}<br>
                    <button class="ai-btn ai-analyze-btn" data-name="${student.name}" data-wpm="${maxWpm}" data-weak="${weakStr}" data-idx="${index}" style="margin-top:6px; padding:5px 8px; font-size:11px; border-radius:6px; width:100%;">✨ AI 진단</button>
                    <div id="ai-feedback-${index}" class="ai-feedback-box"></div>
                </td>
                <td>${window.getRankBadgeHTML(maxWpm)}<div style="margin-top:4px; font-weight:700; color:#5BC044; font-size:13px;">${maxWpm}타</div></td>
                <td style="text-align:center;">
                    <input type="number" class="wpm-goal-input" data-cls="${selectedClass}" data-idx="${index}" value="${wpmTarget}" min="10" max="500" step="10" style="width:60px; padding:6px; font-size:14px; font-weight:900; text-align:center; border:2px solid #FFE485; border-radius:8px;">
                    <div style="font-size:11px; color:#888; margin-top:3px;">타/분</div>
                </td>
                <td style="text-align:center; font-weight:900; font-size:13px;">
                    <div style="color:${statusColor}; font-size:16px; margin-bottom:3px;">${ticketStatus}</div>
                    <div style="font-size:11px; color:#888;">오늘 ${todayScore.toLocaleString()}점</div>
                </td>
                <td style="text-align:left;">
                    <select class="err-mode-sel" data-cls="${selectedClass}" data-idx="${index}" style="padding:4px; font-size:12px; margin-bottom:4px; width:100%; border:2px solid #FFE485; border-radius:6px;">
                        <option value="stop" ${student.errorMode === 'stop' ? 'selected' : ''}>🛡️ 오타 시 잠김</option>
                        <option value="hint" ${student.errorMode === 'hint' ? 'selected' : ''}>🚦 힌트만 주고 통과</option>
                    </select><br>${checkboxes}
                </td>
                <td><button class="delete-btn" data-cls="${selectedClass}" data-idx="${index}">삭제</button></td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.err-mode-sel').forEach(sel => { sel.addEventListener('change', (e) => { studentData[e.target.dataset.cls][e.target.dataset.idx].errorMode = e.target.value; window.saveData(); }); });
        document.querySelectorAll('.menu-chk').forEach(chk => { chk.addEventListener('change', (e) => { let cls = e.target.dataset.cls, idx = e.target.dataset.idx, menu = e.target.dataset.menu; let menus = studentData[cls][idx].allowedMenus; if (e.target.checked) menus.push(menu); else studentData[cls][idx].allowedMenus = menus.filter(m => m !== menu); window.saveData(); }); });
        document.querySelectorAll('.delete-btn').forEach(btn => { btn.addEventListener('click', (e) => { if (confirm("정말 삭제하시겠습니까?")) { studentData[e.target.dataset.cls].splice(e.target.dataset.idx, 1); window.saveData(); renderStudentTable(); } }); });
        // WPM 목표 입력창 이벤트 (저장 버튼과 함께 일괄 저장되므로 여기서는 로컬만 반영)
        document.querySelectorAll('.wpm-goal-input').forEach(inp => {
            inp.addEventListener('change', (e) => {
                const cls = e.target.dataset.cls, idx = e.target.dataset.idx;
                const val = parseInt(e.target.value) || 80;
                if (!studentData[cls][idx].mission) studentData[cls][idx].mission = { type: 'wpm', val: 80 };
                studentData[cls][idx].mission.val = Math.max(10, Math.min(500, val));
                e.target.value = studentData[cls][idx].mission.val;
            });
        });

        document.querySelectorAll('.ai-analyze-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const name = e.target.dataset.name; const wpm = e.target.dataset.wpm; const weak = e.target.dataset.weak; const idx = e.target.dataset.idx;
                const feedbackBox = document.getElementById(`ai-feedback-${idx}`);
                e.target.disabled = true; e.target.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 분석 중...`;
                
                // 0.5초 뒤 즉시 따뜻한 코멘트 노출
                setTimeout(() => {
                    const feedback = window.getLocalFeedback(name, wpm, weak);
                    feedbackBox.innerHTML = `<strong>🤖 AI 보조교사:</strong><br>${feedback}`;
                    feedbackBox.style.display = 'block';
                    e.target.innerHTML = `✨ AI 진단 및 칭찬`;
                    e.target.disabled = false;
                }, 500);
            });
        });

        updateChart();
    }

    // 반 선택 변경 시 설정 패널도 갱신
    document.getElementById('admin-class').addEventListener('change', () => {
        renderStudentTable();
        syncClassSettingsPanel();
    });

    // 반 설정 패널 동기화
    function syncClassSettingsPanel() {
        const cls = document.getElementById('admin-class').value;
        const cData = classData[cls];
        if (!cData) return;
        document.getElementById('setting-target').value = cData.target || 5000;
        document.getElementById('setting-reward').value = cData.reward || '상상체험실 가기';
        document.getElementById('setting-indiv-reward').value = cData.indivReward || '자유 휴식권';
    }

    // 반 설정 저장 버튼
    document.getElementById('save-class-settings-btn').addEventListener('click', () => {
        const cls = document.getElementById('admin-class').value;
        classData[cls].target = parseInt(document.getElementById('setting-target').value) || 5000;
        classData[cls].reward = document.getElementById('setting-reward').value.trim() || '상상체험실 가기';
        classData[cls].indivReward = document.getElementById('setting-indiv-reward').value.trim() || '자유 휴식권';

        // 학생별 WPM 목표도 일괄 저장
        document.querySelectorAll('.wpm-goal-input').forEach(inp => {
            const idx = inp.dataset.idx;
            const val = parseInt(inp.value) || 80;
            if (!studentData[cls][idx].mission) studentData[cls][idx].mission = { type: 'wpm', val: 80 };
            studentData[cls][idx].mission.val = Math.max(10, Math.min(500, val));
        });

        window.saveData();
        showAlert('✅ 반 설정이 저장되었습니다!');
    });

    // 초기 로드 시 설정 패널 동기화
    setTimeout(syncClassSettingsPanel, 100);

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
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, suggestedMax: 300, grid: { color: '#FFE485' }, ticks: { font: { size: 14, weight: 'bold', family: 'Noto Sans KR' }, color: '#FF6B35' } }, x: { grid: { display: false }, ticks: { font: { size: 16, weight: 'bold', family: 'Noto Sans KR' }, color: '#3D2B1F' } } }, plugins: { legend: { display: false }, title: { display: true, text: `👑 ${selectedClass} 타수 랭킹 👑`, font: { size: 24, family: 'Noto Sans KR', weight: '900' }, color: '#FF6B35', padding: { bottom: 20 } } } }
        });
    }

    // ====================================================
    // 5. 랭킹, 메뉴, 타자 연습 로직
    // ====================================================
    const BADGE_DEFS = [
        { req: 30,  name: "Lv.1 씨앗",    icon: "fa-seedling", color: "color-lv1",    tier: "seed"   },
        { req: 50,  name: "Lv.2 새싹",    icon: "fa-leaf",     color: "color-lv2",    tier: "sprout" },
        { req: 60,  name: "Lv.3 잎새",    icon: "fa-leaf",     color: "color-lv2",    tier: "sprout" },
        { req: 70,  name: "Lv.4 가지",    icon: "fa-leaf",     color: "color-lv3",    tier: "branch" },
        { req: 80,  name: "Lv.5 나무",    icon: "fa-tree",     color: "color-lv3",    tier: "branch" },
        { req: 90,  name: "Lv.6 숲",      icon: "fa-tree",     color: "color-lv3",    tier: "branch" },
        { req: 100, name: "동메달",        icon: "fa-award",    color: "color-bronze", tier: "bronze" },
        { req: 120, name: "동메달+",       icon: "fa-award",    color: "color-bronze", tier: "bronze" },
        { req: 140, name: "동메달++",      icon: "fa-award",    color: "color-bronze", tier: "bronze" },
        { req: 160, name: "동메달+++",     icon: "fa-award",    color: "color-bronze", tier: "bronze" },
        { req: 180, name: "동메달++++",    icon: "fa-award",    color: "color-bronze", tier: "bronze" },
        { req: 200, name: "은메달",        icon: "fa-medal",    color: "color-silver", tier: "silver" },
        { req: 250, name: "금메달",        icon: "fa-crown",    color: "color-gold",   tier: "gold"   },
        { req: 300, name: "전설의 타자",   icon: "fa-gem",      color: "color-ace",    tier: "legend" }
    ];

    window.getRankBadgeHTML = function (wpm) {
        if (wpm < 30) return `<span class="rank-badge rank-basic">연습생</span>`;
        let currentBadge = BADGE_DEFS[0];
        for (let i = 0; i < BADGE_DEFS.length; i++) { if (wpm >= BADGE_DEFS[i].req) currentBadge = BADGE_DEFS[i]; }
        let bClass = currentBadge.color.replace('color-', 'rank-');
        return `<span class="rank-badge ${bClass}"><i class="fa-solid ${currentBadge.icon}"></i> ${currentBadge.name}</span>`;
    };

    function updateClassGoalUI() {
        let cData = classData[currentUserClass];
        if (!cData) return;
        let students = studentData[currentUserClass] || [];
        let earnedCount = students.filter(s => s.earnedTicket).length;
        let totalCount = students.length;

        // 하이브리드 표시: X/Y명 달성 + 보너스 점수
        let memberEl = document.getElementById('class-member-status');
        if (memberEl) memberEl.textContent = `${earnedCount}/${totalCount}명 달성`;

        let rewardEl = document.getElementById('class-reward-display-menu');
        if (rewardEl) rewardEl.textContent = cData.reward || '상상체험실 가기';

        let bonusEl = document.getElementById('class-bonus-display');
        if (bonusEl) bonusEl.textContent = `${(cData.current || 0).toLocaleString()} / ${(cData.target || 5000).toLocaleString()}`;

        let percent = cData.target > 0 ? Math.min(100, (cData.current / cData.target) * 100).toFixed(1) : 0;
        document.querySelectorAll('.class-goal-fill').forEach(el => el.style.width = percent + '%');

        // 반 공동 보상 달성 체크
        let allEarned = totalCount > 0 && earnedCount >= totalCount;
        let bonusReached = cData.current >= cData.target;
        let goalContainer = document.getElementById('class-goal-menu-container');
        if (goalContainer) {
            if (allEarned && bonusReached) {
                goalContainer.style.borderColor = '#A855F7';
                goalContainer.style.background = '#FAF5FF';
            } else if (allEarned || bonusReached) {
                goalContainer.style.borderColor = '#5BC044';
                goalContainer.style.background = '#F0FFF4';
            } else {
                goalContainer.style.borderColor = '#FFE485';
                goalContainer.style.background = '#FFFFFF';
            }
        }
    }

    function renderMainMenu() {
        document.getElementById('welcome-message').innerText = `👋 ${currentUser.name} 님`;
        document.getElementById('user-rank-badge').innerHTML = window.getRankBadgeHTML(currentUser.stats.maxWpm);

        let missionBox = document.getElementById('individual-mission');
        const wpmTarget = currentUser.mission?.val ?? 80;

        if (currentUser.earnedTicket) {
            missionBox.innerHTML = `✅ 미션 완료! <strong>${wpmTarget}타 달성!</strong> 🎟️ 보너스 점수 적립 중!`;
            missionBox.classList.add('completed');
        } else {
            missionBox.innerHTML = `🎯 오늘 미션: <strong>${wpmTarget}타</strong> 달성하기!`;
            missionBox.classList.remove('completed');
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

    window.goToMenu = function () { renderMainMenu(); showScreen('student-menu-screen'); };

    document.getElementById('my-profile-btn').addEventListener('click', () => {
        document.getElementById('profile-student-name').innerText = currentUser.name;
        document.getElementById('profile-max-wpm').innerText = currentUser.stats.maxWpm;
        let container = document.getElementById('badge-container'); container.innerHTML = '';
        const wpm = currentUser.stats.maxWpm;
        BADGE_DEFS.forEach(badge => {
            let isUnlocked = wpm >= badge.req;
            // 방금 해금된 배지(이 배지는 달성, 다음 배지는 미달성)
            const badgeIdx = BADGE_DEFS.indexOf(badge);
            const isNewest = isUnlocked && (badgeIdx === BADGE_DEFS.length - 1 || wpm < BADGE_DEFS[badgeIdx + 1].req);

            let card = document.createElement('div');
            card.className = [
                'badge-card',
                isUnlocked ? `unlocked tier-${badge.tier}` : 'badge-locked',
                isNewest ? 'badge-newest' : ''
            ].join(' ');

            let iconHtml = isUnlocked
                ? `<i class="fa-solid ${badge.icon}"></i>`
                : `<i class="fa-solid fa-lock"></i>`;

            card.innerHTML = `
                <div class="badge-icon ${isUnlocked ? badge.color : ''}">${iconHtml}</div>
                <div class="badge-title">${badge.name}</div>
                <div class="badge-req">${badge.req}타 달성</div>
                ${isNewest ? '<div class="badge-now">✨ 현재 등급</div>' : ''}
            `;
            container.appendChild(card);
        });
        showScreen('slide-profile');
    });
    document.getElementById('back-from-profile-btn').addEventListener('click', window.goToMenu);

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
    const jasoToKeyMap = { 'ㅂ': 'q', 'ㅈ': 'w', 'ㄷ': 'e', 'ㄱ': 'r', 'ㅅ': 't', 'ㅛ': 'y', 'ㅕ': 'u', 'ㅑ': 'i', 'ㅐ': 'o', 'ㅔ': 'p', 'ㅁ': 'a', 'ㄴ': 's', 'ㅇ': 'd', 'ㄹ': 'f', 'ㅎ': 'g', 'ㅗ': 'h', 'ㅓ': 'j', 'ㅏ': 'k', 'ㅣ': 'l', 'ㅋ': 'z', 'ㅌ': 'x', 'ㅊ': 'c', 'ㅍ': 'v', 'ㅠ': 'b', 'ㅜ': 'n', 'ㅡ': 'm', 'ㅃ': 'q', 'ㅉ': 'w', 'ㄸ': 'e', 'ㄲ': 'r', 'ㅆ': 't', 'ㅒ': 'o', 'ㅖ': 'p', ',': 'comma', '.': 'period', ' ': 'space' };
    const requiresShift = ['ㅃ', 'ㅉ', 'ㄸ', 'ㄲ', 'ㅆ', 'ㅒ', 'ㅖ'];

    let currentWordList = []; let practiceQueue = []; let WORDS_PER_SESSION = 10; let currentWordIndex = 0;
    let currentWord = ""; let sessionStartTime = 0; let isPracticing = false;
    let totalAccumulatedStrokes = 0; let totalErrorCount = 0; let currentCombo = 0;
    let requireEnter = false; let lastValidValue = ""; let isErrorState = false; let lastErrorValue = "";
    let isTransitioning = false; let sessionPhysicalStrokes = 0; let lastInputJasoLength = 0; let lastInputValRaw = "";
    let isComposing = false; // [1단계] IME 조합 중 플래그

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

    document.getElementById('practice-screen').addEventListener('click', (e) => { if (e.target.id !== 'end-practice-btn') typingInput.focus(); });

    // ─────────────────────────────────────────────────────────
    // [1단계-A] 단어 바뀔 때 span을 1회 생성하고 노드를 캐시
    // ─────────────────────────────────────────────────────────
    let charSpans = [];

    function buildTargetSpans(word) {
        targetText.innerHTML = '';
        charSpans = [];
        for (let i = 0; i < word.length; i++) {
            const span = document.createElement('span');
            span.textContent = word[i];
            span.className = (i === 0) ? 'char-current' : 'char-pending';
            targetText.appendChild(span);
            charSpans.push(span);
        }
    }

    // [1단계-B] innerHTML 재생성 없이 classList만 교체
    function updateTargetTextDisplay(inputVal) {
        const validLen = inputVal.length;
        for (let i = 0; i < charSpans.length; i++) {
            if (i < validLen - 1) charSpans[i].className = 'char-typed';
            else if (i === validLen - 1) charSpans[i].className = 'char-current';
            else if (i === 0 && validLen === 0) charSpans[i].className = 'char-current';
            else charSpans[i].className = 'char-pending';
        }
    }

    window.startPractice = function (menuName, category) {
        currentMode = menuName; currentCategory = category || menuName;
        currentWordList = practiceContents[menuName] || practiceContents["낱말 연습"];

        if (classData[currentUserClass] && classData[currentUserClass].aiSentences) {
            classData[currentUserClass].aiSentences.forEach(s => {
                if (!practiceContents["문장 연습"].includes(s)) practiceContents["문장 연습"].push(s);
            });
        }
        if (classData[currentUserClass] && classData[currentUserClass].aiWords) {
            classData[currentUserClass].aiWords.forEach(w => {
                if (!practiceContents["낱말 연습"].includes(w)) practiceContents["낱말 연습"].push(w);
            });
        }

        document.getElementById('practice-user-info').innerText = `${currentUser.name} (${menuName})`;

        const practiceArea = document.querySelector('.practice-area');
        if (currentCategory === "문장 연습") { WORDS_PER_SESSION = 15; requireEnter = true; practiceArea.classList.add('sentence-mode'); }
        else if (currentCategory === "낱말 연습") { WORDS_PER_SESSION = 30; requireEnter = false; practiceArea.classList.remove('sentence-mode'); }
        else { WORDS_PER_SESSION = 50; requireEnter = false; practiceArea.classList.remove('sentence-mode'); }

        practiceQueue = []; for (let i = 0; i < WORDS_PER_SESSION; i++) practiceQueue.push(currentWordList[Math.floor(Math.random() * currentWordList.length)]);
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
        buildTargetSpans(currentWord); // [1단계] 단어마다 span 초기 생성
        typingInput.classList.remove('text-error', 'shake');
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

    typingInput.addEventListener('keydown', function (e) {
        if (!isPracticing || isTransitioning) return;
        if (currentUser.errorMode === 'stop' && isErrorState && e.key !== 'Backspace' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') { e.preventDefault(); this.classList.add('shake'); setTimeout(() => this.classList.remove('shake'), 200); return; }
        if (requireEnter && e.key === 'Enter' && this.value === currentWord && !isErrorState) { e.preventDefault(); processWordCompletion(); }
    });

    // ─────────────────────────────────────────────────────────
    // [1단계-C] 한글 IME Composition 이벤트 분리
    // ─────────────────────────────────────────────────────────
    typingInput.addEventListener('compositionstart', () => {
        isComposing = true;
    });

    typingInput.addEventListener('compositionend', () => {
        isComposing = false;
        // compositionend 후 일부 브라우저에서 input이 발화 안 될 수 있어 직접 처리
        handleInput(typingInput.value);

        // 🔑 자리 연습 자동 넘김: 단일 자소(ㅁ,ㄴ 등) 입력 시 즉시 다음으로
        if (currentCategory === "자리 연습" && isPracticing && !isTransitioning && !isErrorState) {
            const inputJaso = Hangul.disassemble(typingInput.value);
            const targetJaso = Hangul.disassemble(currentWord);
            if (inputJaso.length >= targetJaso.length) {
                let match = true;
                for (let i = 0; i < targetJaso.length; i++) {
                    if (inputJaso[i] !== targetJaso[i]) { match = false; break; }
                }
                if (match) {
                    processWordCompletion();
                }
            }
        }
    });

    // [1단계-D] input 이벤트: 조합 중에는 건너뜀
    typingInput.addEventListener('input', function () {
        if (isComposing) return;
        handleInput(this.value);
    });

    // ─────────────────────────────────────────────────────────
    // [1단계-D] 입력 처리 로직을 독립 함수로 분리
    // ─────────────────────────────────────────────────────────
    function handleInput(inputVal) {
        if (!isPracticing || isTransitioning) { if (isTransitioning) typingInput.value = lastValidValue; return; }
        if (inputVal.startsWith(' ') && currentWord[0] !== ' ') { typingInput.value = ''; return; }
        if (sessionStartTime === 0 && inputVal.length > 0) sessionStartTime = Date.now();

        if (inputVal.length === 0) {
            if (sessionPhysicalStrokes > 0) sessionPhysicalStrokes += 1;
            lastValidValue = ""; lastErrorValue = ""; isErrorState = false; updateTargetTextDisplay("");
            typingInput.classList.remove('text-error', 'shake'); feedbackMsg.style.color = '#8A8A8A'; feedbackMsg.innerText = "타자를 계속하세요.";
            if (totalAccumulatedStrokes === 0) sessionStartTime = 0;
            lastInputJasoLength = 0; lastInputValRaw = "";
            return;
        }

        if (currentUser.errorMode === 'stop' && isErrorState) {
            if (inputVal.length > lastErrorValue.length || Hangul.disassemble(inputVal).length > Hangul.disassemble(lastErrorValue).length) {
                typingInput.value = lastErrorValue; typingInput.classList.add('shake'); setTimeout(() => typingInput.classList.remove('shake'), 200); return;
            }
        }

        let currentJasoLen = getStrokeCount(inputVal);
        let strokeDiff = currentJasoLen - lastInputJasoLength;
        if (strokeDiff !== 0) sessionPhysicalStrokes += Math.abs(strokeDiff);
        else if (inputVal !== lastInputValRaw) sessionPhysicalStrokes += 1;
        lastInputJasoLength = currentJasoLen; lastInputValRaw = inputVal;

        let inputJaso = Hangul.disassemble(inputVal); let targetJaso = Hangul.disassemble(currentWord);
        let isError = false;
        for (let i = 0; i < inputJaso.length; i++) { if (inputJaso[i] !== targetJaso[i]) { isError = true; break; } }

        if (isError) {
            if (!isErrorState) { totalErrorCount++; currentCombo = 0; document.getElementById('combo-wrap').style.opacity = 0; }
            isErrorState = true; lastErrorValue = inputVal;
            typingInput.classList.add('text-error'); feedbackMsg.style.color = '#FF4757'; feedbackMsg.innerText = "틀렸습니다! 백스페이스(←)로 지우세요.";
        } else {
            isErrorState = false; lastValidValue = inputVal; updateTargetTextDisplay(inputVal);
            typingInput.classList.remove('text-error', 'shake'); feedbackMsg.style.color = '#5BC044';
            feedbackMsg.innerText = (typingInput.value === currentWord && requireEnter) ? "엔터(Enter) 키를 눌러 다음으로 넘어가세요 ⏎" : "잘하고 있습니다!";
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
        if (typingInput.value === currentWord && !requireEnter && !isErrorState) processWordCompletion();
    }

    function endPracticeSession(isCompleted) {
        isPracticing = false; typingInput.value = ''; lastValidValue = '';
        let currentWpm = currentCalculatedWpm;

        // [신기록 배너] 이전 최고 타수 기억 후 비교
        const previousMaxWpm = currentUser.stats.maxWpm;
        const isNewRecord = isCompleted && currentCategory !== "자리 연습" && currentWpm > previousMaxWpm && currentWpm > 0;

        if (isNewRecord) {
            currentUser.stats.maxWpm = currentWpm;
        }

        if (isCompleted) {
            if (!currentUser.completedMenus) currentUser.completedMenus = [];
            if (!currentUser.completedMenus.includes(currentMode)) currentUser.completedMenus.push(currentMode);
        }

        currentUser.totalScore += currentSessionScore;

        // 🔑 WPM 기반 티켓 체크 (오늘 세션 타수 기준)
        const wpmTarget = currentUser.mission?.val ?? 80;
        if (currentWpm >= wpmTarget && !currentUser.earnedTicket && isCompleted) {
            currentUser.earnedTicket = true;
            setTimeout(showTicketModal, 500);
        }

        // 티켓 획득 후 추가 연습만 반 공동 점수에 적립
        if (currentUser.earnedTicket) {
            classData[currentUserClass].current += currentSessionScore;
        }

        // 학생 1명 데이터만 GAS에 병합 저장 (동시 접속 안전)
        window.saveStudentPatch(currentUserClass, currentUser);

        if (isCompleted) {
            document.getElementById('result-main-stat').innerHTML = `<span id="final-wpm">${currentWpm}</span> 타/분`;
            document.getElementById('final-acc').innerText = accDisplay.innerText;
            document.getElementById('final-earned-score').innerText = currentSessionScore;

            // [신기록 배너] 보여주기
            const newRecordBanner = document.getElementById('new-record-banner');
            if (newRecordBanner) {
                if (isNewRecord) {
                    newRecordBanner.innerHTML = `🏆 신기록 달성! ${previousMaxWpm > 0 ? previousMaxWpm + '타 → ' : ''}${currentWpm}타`;
                    newRecordBanner.style.display = 'block';
                } else {
                    newRecordBanner.style.display = 'none';
                }
            }

            showScreen('result-screen');
        } else {
            window.goToMenu();
        }
    }
    document.getElementById('end-practice-btn').addEventListener('click', () => endPracticeSession(false));
    document.getElementById('back-to-menu-btn').addEventListener('click', () => {
        // WPM 기반 미션은 endPracticeSession에서 이미 체크됨 → 바로 메뉴로
        window.goToMenu();
    });

    document.getElementById('logout-btn').addEventListener('click', () => { updateStudentSelects(); showScreen('student-login-screen'); });

    // ====================================================
    // 6. 로컬 긍정 단어/문장 선물상자 및 진단 시스템 (CORS / 외부 API 문제 완벽 해결)
    // ====================================================
    const LOCAL_WORD_BANK = [
        "사랑", "희망", "행복", "친구", "미소", "용기", "배려", "기쁨", "감사", "평화",
        "믿음", "응원", "도전", "성장", "배움", "우정", "인사", "칭찬", "양보", "협동",
        "가족", "선물", "햇살", "바람", "구름", "하늘", "바다", "나무", "새싹", "꽃잎",
        "노래", "그림", "꿈나라", "천사", "별빛", "달님", "햇님", "마음", "생각", "온기",
        "따뜻", "친절", "정성", "노력", "열정", "성공", "보람", "행운", "기적", "축복",
        "하루", "선생님", "학교", "교실", "친구들", "우리", "함께", "나눔", "도움", "손길",
        "성실", "미덕", "진심", "다정", "포근", "안전", "건강", "튼튼", "씩씩", "용감",
        "정직", "지혜", "겸손", "끈기", "인내", "위로", "공감", "이해", "화합"
    ];

    const LOCAL_SENTENCE_BANK = [
        "오늘도 힘차게 시작해 봐요.",
        "너는 세상에서 가장 소중한 사람이야.",
        "천천히 해도 괜찮아, 잘하고 있어.",
        "너의 예쁜 미소가 모두를 행복하게 해.",
        "우리는 서로 도우며 함께 성장해요.",
        "너의 노력이 조금씩 열매를 맺고 있어.",
        "선생님은 언제나 너를 응원한단다.",
        "오늘 하루도 참 고마운 시간이에요.",
        "친구의 손을 잡고 함께 걸어가요.",
        "포기하지 않는 네 모습이 정말 멋져.",
        "따뜻한 말 한마디가 세상을 밝혀요.",
        "매일매일 조금씩 더 씩씩해지고 있어요.",
        "너는 아주 특별하고 빛나는 존재야.",
        "다정한 인사는 마음의 문을 열어줘요.",
        "마음속에 예쁜 꿈을 하나씩 심어봐요.",
        "힘들 때는 잠시 쉬어가도 괜찮단다.",
        "네가 있어서 우리 반이 참 행복해.",
        "할 수 있다는 믿음이 큰 힘이 돼요.",
        "주변을 둘러보면 사랑이 가득해요.",
        "오늘도 참 잘 해냈어, 최고야."
    ];

    window.getLocalFeedback = function(name, wpm, weak) {
        wpm = parseInt(wpm) || 0;
        let wpmComment = "";
        if (wpm >= 200) {
            wpmComment = `최고 타수가 무려 ${wpm}타라니, 우리 반 타자 챔피언이네요! 손가락이 날개 달린 새처럼 가볍고 빠르게 움직이는 모습이 상상돼요.`;
        } else if (wpm >= 100) {
            wpmComment = `최고 속도가 ${wpm}타를 넘어서며 정말 눈부시게 성장했군요! 성실하게 쌓아 올린 노력이 실력으로 반짝반짝 빛나고 있어요.`;
        } else if (wpm >= 50) {
            wpmComment = `최고 타수 ${wpm}타를 달성하며 차근차근 잘 나아가고 있어요! 포기하지 않고 자판을 두드리는 모습이 정말 씩씩하고 자랑스럽습니다.`;
        } else {
            wpmComment = `천천히 한 글자씩 정성스럽게 타자를 익히고 있는 모습이 정말 아름다워요! 포기하지 않고 도전하는 네 마음이 가장 큰 보물이야.`;
        }
        
        let weakComment = "";
        if (weak && weak !== "없음" && weak.trim() !== "") {
            weakComment = `요즘 '${weak}' 글쇠를 누를 때 조금 더 많은 집중력이 필요하지만, 지금처럼 차분히 연습하면 금방 손가락이 기억하게 될 거예요.`;
        } else {
            weakComment = `특별히 자주 틀리는 자판 없이 전체적으로 아주 안정감 있고 꼼꼼하게 키보드를 누르고 있군요! 대단해요.`;
        }
        return `${wpmComment} ${weakComment} 선생님은 언제나 너의 도전을 마음 다해 응원한단다.`;
    };

    document.getElementById('ai-generate-btn').addEventListener('click', () => {
        const type = document.getElementById('ai-type-select').value;
        const btn = document.getElementById('ai-generate-btn');
        const loading = document.getElementById('ai-loading');

        btn.disabled = true;
        loading.style.display = 'block';

        // 마법 상자에서 가져오는 느낌을 주기 위해 0.6초 뒤 실행
        setTimeout(() => {
            let items = [];
            const cls = document.getElementById('admin-class').value;
            const targetKey = type === 'word' ? 'aiWords' : 'aiSentences';
            const targetMenu = type === 'word' ? '낱말 연습' : '문장 연습';

            if (!classData[cls][targetKey]) classData[cls][targetKey] = [];

            if (type === 'word') {
                // 10개 랜덤 선택
                let tempBank = [...LOCAL_WORD_BANK];
                tempBank = tempBank.filter(w => !classData[cls][targetKey].includes(w));
                if (tempBank.length < 10) tempBank = [...LOCAL_WORD_BANK];
                
                tempBank.sort(() => 0.5 - Math.random());
                items = tempBank.slice(0, 10);
            } else {
                // 5개 랜덤 선택
                let tempBank = [...LOCAL_SENTENCE_BANK];
                tempBank = tempBank.filter(s => !classData[cls][targetKey].includes(s));
                if (tempBank.length < 5) tempBank = [...LOCAL_SENTENCE_BANK];
                
                tempBank.sort(() => 0.5 - Math.random());
                items = tempBank.slice(0, 5);
            }

            items.forEach(item => {
                if (!classData[cls][targetKey].includes(item)) classData[cls][targetKey].push(item);
                if (!practiceContents[targetMenu].includes(item)) practiceContents[targetMenu].push(item);
            });

            window.saveData();
            alert(`🎉 마법 꾸러미가 도착했습니다!\n\n추가된 내용:\n- ` + items.join('\n- '));
            
            btn.disabled = false;
            loading.style.display = 'none';
            closeModals();
        }, 600);
    });

}); // DOMContentLoaded 끝
