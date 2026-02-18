// DOM 요소
const mazeCanvas = document.getElementById('maze-layer');
const mazeCtx = mazeCanvas.getContext('2d');
const drawCanvas = document.getElementById('draw-layer');
const drawCtx = drawCanvas.getContext('2d', {willReadFrequently: true});
const wrapper = document.getElementById('canvas-wrapper');
const bufferCanvas = document.createElement('canvas');
const bufferCtx = bufferCanvas.getContext('2d');
const shapeSelect = document.getElementById('maze-shape'); // 모양 선택 엘리먼트

// 상태 변수
let state = {
    isEasyMode: true,
    isDrawing: false,
    mode: 'pen',
    currentRGB: '#000000',
    currentOpacity: 0.5,
    mazeGrid: [],
    mazeStartPoint: {},
    mazeEndPoint: {},
    currentSize: 30,
    currentShape: 'square', // 현재 모양 상태
    savedPaths: [],
    currentPath: null,
    savedImageData: null
};

// --- 초기화 및 이벤트 리스너 등록 ---
document.addEventListener('DOMContentLoaded', () => {
    // 초기 난이도 UI 동기화
    document.getElementById('easyModeToggle').checked = !state.isEasyMode;
    toggleDifficulty({target: document.getElementById('easyModeToggle')});

    initApp();
    setupEventListeners();
});

function setupEventListeners() {
    // 캔버스 드로잉 이벤트
    drawCanvas.addEventListener('mousedown', startDraw);
    drawCanvas.addEventListener('mousemove', draw);
    drawCanvas.addEventListener('mouseup', stopDraw);
    drawCanvas.addEventListener('touchstart', startDraw, {passive: false});
    drawCanvas.addEventListener('touchmove', draw, {passive: false});
    drawCanvas.addEventListener('touchend', stopDraw);
    drawCanvas.addEventListener('mouseleave', stopDraw); // 마우스가 캔버스 밖으로 나갔을 때 처리

    // 버튼 및 입력 이벤트
    document.getElementById('btn-new-maze').addEventListener('click', generateNewMaze);
    // 모양 변경 시 자동 새 미로 생성 (선택사항)
    shapeSelect.addEventListener('change', generateNewMaze);

    document.getElementById('btn-pen').addEventListener('click', () => setMode('pen'));
    document.getElementById('btn-eraser').addEventListener('click', () => setMode('eraser'));
    document.getElementById('btn-reset').addEventListener('click', resetAll);
    document.getElementById('btn-download').addEventListener('click', downloadImage);

    // 색상 선택기
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => setColor(e.target));
    });

    // 난이도 토글
    document.getElementById('easyModeToggle').addEventListener('change', toggleDifficulty);
}

// --- 핵심 로직 ---

function initApp() {
    if (loadSession()) {
        drawMaze(state.mazeGrid, state.currentSize, state.currentShape);
        restoreDrawing();
    } else {
        generateNewMaze();
    }
}

// --- 핵심 로직 부분 수정 ---

function generateNewMaze() {
    let sizeInput = parseInt(document.getElementById('maze-size').value) || 30;
    // 동심원은 그리드보다 작게 시작해도 큼 (반지름이므로)
    let minSize = (shapeSelect.value === 'polar') ? 5 : ((shapeSelect.value !== 'square') ? 15 : 10);
    let maxSize = 100;
    if (shapeSelect.value === 'triangle') {
        maxSize = 50;
    } else if (shapeSelect.value === 'polar') {
        maxSize = 60;
    }
    state.currentSize = Math.max(minSize, Math.min(maxSize, sizeInput));
    document.getElementById('maze-size').value = state.currentSize;

    state.currentShape = shapeSelect.value;

    const mazeData = MazeGenerator.generate(state.currentSize, state.currentShape);

    console.log(`모양: ${mazeData.shape}, 목표: ${mazeData.maxDistance}`);

    state.mazeGrid = mazeData.grid; // Grid 혹은 Polar Rows
    state.mazeType = mazeData.type; // 'grid' 또는 'polar'
    state.mazeStartPoint = mazeData.startPoint;

    if (!state.isEasyMode) {
        state.mazeEndPoint = mazeData.endPoint;
    } else {
        console.log('mazeType: ', state.mazeType);
        if (state.mazeType === 'polar') {
            // 동심원 Easy 모드: 그냥 마지막 링의 임의의 지점
            let lastRow = state.mazeGrid[state.mazeGrid.length-1];
            let endCell = lastRow[Math.floor(lastRow.length/2)];
            state.mazeEndPoint = { r: endCell.r, i: endCell.i };
        } else if (state.currentShape === 'square') {
            state.mazeEndPoint = { x: state.currentSize-1, y: state.currentSize-1 };
            console.log('square endPoint', state.mazeEndPoint);
        } else if (state.currentShape === 'circle') {
            const padding = state.currentSize > 81 ? 4 : state.currentSize > 41 ? 3 : 2;
            state.mazeEndPoint = { x: state.mazeStartPoint.x, y: state.currentSize-padding };
        } else if (state.currentShape === 'triangle') {
            state.mazeEndPoint = { x: state.mazeStartPoint.x, y: state.currentSize-3 };
        } else {
            state.mazeEndPoint = mazeData.endPoint;
        }
    }

    state.savedPaths = [];

    // 그리기 분기
    renderMaze();
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    saveSession();
}


// --- app.js 수정 부분 ---

function renderMaze() {
    // 'polar' 혹은 'triangle' 타입은 Radial 방식의 그리기 함수 사용
    if (state.mazeType === 'polar') {
        drawRadialMaze(state.mazeGrid, state.currentSize, state.currentShape);
    } else {
        drawMaze(state.mazeGrid, state.currentSize, state.currentShape);
    }
}

// [통합] Radial Maze 그리기 (원형/삼각형 공용)
// [수정] Radial Maze 그리기 (크기 및 위치 보정 적용)
function drawRadialMaze(rows, ringCount, shape) {
    if (!rows || !rows.length) return;

    const padding = 20;
    const minDimension = Math.min(wrapper.clientWidth, wrapper.clientHeight) - (padding * 2);
    const canvasSize = minDimension + (padding * 2);

    [mazeCanvas, drawCanvas, bufferCanvas].forEach(canvas => {
        canvas.width = canvasSize;
        canvas.height = canvasSize;
    });

    // 클리핑 해제
    mazeCanvas.style.clipPath = 'none';

    // --- [핵심 수정 부분] 크기(Scale)와 중심점(Center Y) 보정 ---
    let scaleFactor = 1.0;
    let centerYRatio = 0.5;

    if (shape === 'triangle') {
        // 삼각형은 원에 내접하면 작아 보이므로 1.22배확대
        scaleFactor = 1.22;
        // 크기가 커진 만큼 무게중심을 화면 중앙보다 약간 아래(0.6)로 내려서 배치
        centerYRatio = 0.62;
    }

    const cx = canvasSize / 2;
    const cy = canvasSize * centerYRatio;

    // 반지름 간격 계산 (스케일 적용)
    const ringWidth = ((minDimension / 2) / ringCount) * scaleFactor;
    // -------------------------------------------------------

    mazeCtx.fillStyle = "white";
    mazeCtx.fillRect(0, 0, canvasSize, canvasSize);

    // 1. 시작점(중심) 표시
    mazeCtx.beginPath();
    if (shape === 'triangle') {
        // 중심 삼각형 그리기
        const p1 = getPolyCoordinate(ringWidth * 0.6, 0, 3, cx, cy, shape);
        const p2 = getPolyCoordinate(ringWidth * 0.6, 1, 3, cx, cy, shape);
        const p3 = getPolyCoordinate(ringWidth * 0.6, 2, 3, cx, cy, shape);
        mazeCtx.moveTo(p1.x, p1.y);
        mazeCtx.lineTo(p2.x, p2.y);
        mazeCtx.lineTo(p3.x, p3.y);
        mazeCtx.closePath();
    } else {
        mazeCtx.arc(cx, cy, ringWidth * 0.6, 0, 2 * Math.PI);
    }
    mazeCtx.fillStyle = "#FF5252"; // Start Color
    mazeCtx.fill();

    // 2. 도착점 표시
    if (state.mazeEndPoint) {
        const er = state.mazeEndPoint.r;
        const ei = state.mazeEndPoint.i;
        if (er > 0) {
            const cellCount = rows[er].length;
            const innerR = er * ringWidth;
            const outerR = (er + 1) * ringWidth;

            mazeCtx.beginPath();

            // 도착 셀의 4개 코너 좌표 계산
            const pIn1 = getPolyCoordinate(innerR, ei, cellCount, cx, cy, shape);
            const pIn2 = getPolyCoordinate(innerR, ei + 1, cellCount, cx, cy, shape);
            const pOut2 = getPolyCoordinate(outerR, ei + 1, cellCount, cx, cy, shape);
            const pOut1 = getPolyCoordinate(outerR, ei, cellCount, cx, cy, shape);

            mazeCtx.moveTo(pIn1.x, pIn1.y);
            mazeCtx.lineTo(pIn2.x, pIn2.y);
            mazeCtx.lineTo(pOut2.x, pOut2.y);
            mazeCtx.lineTo(pOut1.x, pOut1.y);
            mazeCtx.closePath();

            mazeCtx.fillStyle = "#448AFF"; // End Color
            mazeCtx.fill();
        }
    }

    mazeCtx.strokeStyle = "#333";
    mazeCtx.lineWidth = 1;
    mazeCtx.lineCap = 'round';

    // 3. 벽 그리기
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const cellCount = row.length;
        const innerRadius = r * ringWidth;
        const outerRadius = (r + 1) * ringWidth;

        for (let i = 0; i < cellCount; i++) {
            const cell = row[i];

            // 좌표 계산
            const pIn1 = getPolyCoordinate(innerRadius, i, cellCount, cx, cy, shape);
            const pIn2 = getPolyCoordinate(innerRadius, i + 1, cellCount, cx, cy, shape);
            // 바깥쪽 좌표 (CW 벽 그릴 때 사용)
            const pOut2 = getPolyCoordinate(outerRadius, i + 1, cellCount, cx, cy, shape);

            mazeCtx.beginPath();

            // In Wall (안쪽 벽) - r=0은 그리지 않음
            if (r > 0 && cell.in) {
                mazeCtx.moveTo(pIn1.x, pIn1.y);
                if (shape === 'polar') {
                    // 원형은 arc 사용
                    const theta = (2 * Math.PI) / cellCount;
                    mazeCtx.arc(cx, cy, innerRadius, i * theta, (i + 1) * theta);
                } else {
                    // 삼각형은 직선
                    mazeCtx.lineTo(pIn2.x, pIn2.y);
                }
                mazeCtx.stroke();
            }

            // CW Wall (시계방향 벽 = 오른쪽 벽)
            if (r > 0 && cell.cw) {
                mazeCtx.beginPath();
                mazeCtx.moveTo(pIn2.x, pIn2.y);
                mazeCtx.lineTo(pOut2.x, pOut2.y);
                mazeCtx.stroke();
            }
        }
    }

    // 가장 바깥 테두리
    mazeCtx.beginPath();
    if (shape === 'triangle') {
        const lastRowLen = rows[rows.length-1].length;
        const maxR = rows.length * ringWidth;
        const t1 = getPolyCoordinate(maxR, 0, lastRowLen, cx, cy, shape);
        mazeCtx.moveTo(t1.x, t1.y);
        for(let i=1; i<=lastRowLen; i++) {
            const t = getPolyCoordinate(maxR, i, lastRowLen, cx, cy, shape);
            mazeCtx.lineTo(t.x, t.y);
        }
    } else {
        mazeCtx.arc(cx, cy, rows.length * ringWidth, 0, 2 * Math.PI);
    }
    mazeCtx.stroke();
}

// [핵심] 좌표 계산 함수 (원형 vs 삼각형 분기)
function getPolyCoordinate(radius, index, totalCells, cx, cy, shape) {
    if (shape === 'polar') {
        const theta = (2 * Math.PI * index) / totalCells;
        return {
            x: cx + Math.cos(theta) * radius,
            y: cy + Math.sin(theta) * radius
        };
    }
    else if (shape === 'triangle') {
        // 정삼각형 꼭짓점 계산 (-90도(위), 30도(우하), 150도(좌하))
        // index가 totalCells 범위 내에서 어디에 위치하느냐에 따라 선형 보간(Lerp)

        // 정삼각형의 꼭짓점 3개
        const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
        const v = angles.map(a => ({
            x: cx + Math.cos(a) * radius,
            y: cy + Math.sin(a) * radius
        }));

        // 현재 인덱스가 전체의 몇 퍼센트인지 (0 ~ 3)
        // 변이 3개이므로 3등분
        // totalCells는 항상 3의 배수라고 가정 (생성 로직에서 보장)
        const sideCells = totalCells / 3;

        // 현재 점이 속한 변(0, 1, 2)과 변 내에서의 진행도(t)
        // index가 totalCells와 같을 경우(한바퀴 돈 끝점) 처리
        const safeIndex = index % totalCells;

        const sideIndex = Math.floor(safeIndex / sideCells);
        const segmentIndex = safeIndex % sideCells;
        const t = segmentIndex / sideCells;

        const startV = v[sideIndex];
        const endV = v[(sideIndex + 1) % 3];

        // 선형 보간 (Linear Interpolation)
        return {
            x: startV.x + (endV.x - startV.x) * t,
            y: startV.y + (endV.y - startV.y) * t
        };
    }
}


// 4. 리사이즈 이벤트 수정 (renderMaze 호출)
window.addEventListener('resize', () => {
    if (state.mazeGrid) { // length check 제거 (객체일수도, 배열일수도)
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(() => {
            renderMaze(); // 통합 렌더링 함수 호출
            restoreDrawing();
        }, 200);
    }
});

// 5. downloadImage 수정 (동심원 클리핑 로직 추가)
function downloadImage() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = mazeCanvas.width;
    tempCanvas.height = mazeCanvas.height;
    const tCtx = tempCanvas.getContext('2d');

    tCtx.fillStyle = "#e0e0e0";
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tCtx.save();
    tCtx.beginPath();

    // [수정] 클리핑 로직 분기
    if (state.currentShape === 'polar') {
        // 동심원은 그냥 전체 원형
        const r = tempCanvas.width / 2 - 2; // 약간 여유
        tCtx.arc(tempCanvas.width/2, tempCanvas.height/2, r, 0, Math.PI*2);
    } else if (state.currentShape === 'circle') {
        tCtx.ellipse(tempCanvas.width/2, tempCanvas.height/2, tempCanvas.width*0.48, tempCanvas.height*0.48, 0, 0, Math.PI*2);
    } else if (state.currentShape === 'triangle') {
        tCtx.moveTo(tempCanvas.width * 0.5, tempCanvas.height * 0.02);
        tCtx.lineTo(tempCanvas.width * 0.98, tempCanvas.height * 0.96);
        tCtx.lineTo(tempCanvas.width * 0.02, tempCanvas.height * 0.96);
        tCtx.closePath();
    } else {
        tCtx.rect(0, 0, tempCanvas.width, tempCanvas.height);
    }
    tCtx.clip();

    tCtx.fillStyle = "white";
    tCtx.fill();
    tCtx.drawImage(mazeCanvas, 0, 0);
    tCtx.restore();

    tCtx.drawImage(drawCanvas, 0, 0);

    const link = document.createElement('a');
    link.download = `maze_${state.currentShape}_${state.currentSize}.png`;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
}

// 6. saveSession 수정 (type 정보 저장 추가)
function saveSession() {
    sessionStorage.setItem('mazeSession', JSON.stringify({
        size: state.currentSize,
        shape: state.currentShape,
        type: state.mazeType, // 추가됨
        grid: state.mazeGrid,
        start: state.mazeStartPoint,
        end: state.mazeEndPoint,
        paths: state.savedPaths,
        isEasy: state.isEasyMode
    }));
}

// 7. loadSession 수정 (type 정보 로드 추가)
function loadSession() {
    const dataStr = sessionStorage.getItem('mazeSession');
    if (dataStr) {
        try {
            const data = JSON.parse(dataStr);
            // 유효성 검사 (Polar는 grid 구조가 다르므로 배열 체크만)
            if (!data.grid || !Array.isArray(data.grid) || data.grid.length === 0 || data.grid.length !== data.size) {
                console.warn("손상된 세션 데이터 감지. 초기화합니다.");
                if (data.grid.length === 0) {
                    console.log("세션 데이터의 grid가 비어 있습니다.");
                }
                if (data.grid.length !== data.size) {
                    console.log("세션 데이터의 grid 크기가 size와 일치하지 않습니다.");
                    console.log(`세션 데이터의 grid 크기: ${data.grid.length}, size: ${data.size}`);
                }
                return false;
            }

            state.currentSize = data.size || 30;
            state.currentShape = data.shape || 'square';
            state.mazeType = data.type || 'grid'; // 없을 경우 grid 호환
            state.mazeGrid = data.grid;
            state.mazeStartPoint = data.start;
            state.mazeEndPoint = data.end;
            state.savedPaths = data.paths || [];
            state.isEasyMode = data.isEasy ?? false;

            document.getElementById('maze-size').value = state.currentSize;
            document.getElementById('maze-shape').value = state.currentShape;

            const easyToggle = document.getElementById('easyModeToggle');
            if(easyToggle) {
                easyToggle.checked = !state.isEasyMode;
                toggleDifficulty({target: easyToggle});
            }
            return true;
        } catch (e) {
            console.error(e);
            sessionStorage.removeItem('mazeSession');
            return false;
        }
    }
    return false;
}

// --- 드로잉 로직 (이전과 동일하거나 소폭 수정) ---

function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    // 터치 이벤트 처리 강화
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        // touchend 이벤트의 경우
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    }
    else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    return {x: clientX - rect.left, y: clientY - rect.top};
}

function startDraw(e) {
    if (e.cancelable && e.type !== 'mousedown') e.preventDefault(); // 마우스 이벤트 제외하고 preventDefault
    state.isDrawing = true;
    const pos = getPos(e);

    state.currentPath = {
        mode: state.mode,
        color: state.currentRGB,
        // 상대 좌표로 저장
        points: [{x: pos.x / drawCanvas.width, y: pos.y / drawCanvas.height}]
    };

    if (state.mode === 'pen') {
        drawCtx.globalCompositeOperation = 'source-over';
        state.savedImageData = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);

        bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
        bufferCtx.beginPath();
        bufferCtx.moveTo(pos.x, pos.y);
        bufferCtx.lineCap = 'round';
        bufferCtx.lineJoin = 'round';
        bufferCtx.strokeStyle = state.currentRGB;

        let lw = (drawCanvas.width / state.currentSize) * 0.25; // 선 두께 약간 증가
        bufferCtx.lineWidth = lw < 2 ? 2 : lw;
    } else {
        // 지우개
        drawCtx.globalCompositeOperation = 'destination-out';
        drawCtx.lineWidth = (drawCanvas.width / state.currentSize) * 1.5; // 지우개 크기 상대적으로 설정
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.beginPath();
        drawCtx.moveTo(pos.x, pos.y);
        drawCtx.stroke(); // 클릭 시점에도 지워지도록
    }
    // draw(e) 호출 불필요 (mousemove/touchmove에서 처리)
}

function draw(e) {
    if (!state.isDrawing) return;
    if (e.cancelable && e.type !== 'mousemove') e.preventDefault();

    const pos = getPos(e);
    // 범위 밖으로 나가면 드로잉 종료 처리
    if (pos.x < 0 || pos.x > drawCanvas.width || pos.y < 0 || pos.y > drawCanvas.height) {
        stopDraw(e);
        return;
    }

    state.currentPath.points.push({x: pos.x / drawCanvas.width, y: pos.y / drawCanvas.height});

    if (state.mode === 'pen') {
        bufferCtx.lineTo(pos.x, pos.y);
        bufferCtx.stroke();

        drawCtx.putImageData(state.savedImageData, 0, 0);
        drawCtx.save();
        drawCtx.globalAlpha = state.currentOpacity;
        drawCtx.drawImage(bufferCanvas, 0, 0);
        drawCtx.restore();
    } else {
        drawCtx.lineTo(pos.x, pos.y);
        drawCtx.stroke();
    }
}

function stopDraw(e) {
    if (!state.isDrawing) return;
    if (e && e.cancelable && e.type !== 'mouseup' && e.type !== 'mouseleave') e.preventDefault();
    state.isDrawing = false;
    if (state.currentPath && state.currentPath.points.length > 1) {
        state.savedPaths.push(state.currentPath);
        saveSession();
    }
    state.currentPath = null;
}

function restoreDrawing() {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    const w = drawCanvas.width;
    const h = drawCanvas.height;

    state.savedPaths.forEach(path => {
        drawCtx.beginPath();
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';

        if (path.mode === 'eraser') {
            drawCtx.globalCompositeOperation = 'destination-out';
            drawCtx.globalAlpha = 1.0;
            drawCtx.lineWidth = (w / state.currentSize) * 1.5;
        } else {
            drawCtx.globalCompositeOperation = 'source-over';
            drawCtx.strokeStyle = path.color;
            drawCtx.globalAlpha = state.currentOpacity;
            let lw = (w / state.currentSize) * 0.25;
            drawCtx.lineWidth = lw < 2 ? 2 : lw;
        }

        if (path.points.length > 0) {
            drawCtx.moveTo(path.points[0].x * w, path.points[0].y * h);
            for (let i = 1; i < path.points.length; i++) {
                drawCtx.lineTo(path.points[i].x * w, path.points[i].y * h);
            }
            drawCtx.stroke();
        }
    });
    // 드로잉 복구 후 다시 기본 합성 모드로
    drawCtx.globalCompositeOperation = 'source-over';
}

// --- 유틸리티 및 UI 핸들러 ---

function saveSession() {
    sessionStorage.setItem('mazeSession', JSON.stringify({
        size: state.currentSize,
        shape: state.currentShape,
        grid: state.mazeGrid,
        start: state.mazeStartPoint,
        end: state.mazeEndPoint,
        paths: state.savedPaths,
        isEasy: state.isEasyMode
    }));
}


// 2. drawMaze 함수 교체: 입력된 size 값 대신 실제 grid 배열의 크기를 기준으로 그립니다.
function drawMaze(grid, size, shape) {
    // [수정] 방어 코드: 그리드가 없으면 그리지 않고 중단
    if (!grid || !grid.length) return;

    const maxWidth = wrapper.clientWidth - 40;
    const maxHeight = wrapper.clientHeight - 40;

    // [수정] size 인자 대신 실제 데이터 길이(grid.length)를 사용하여 계산
    const realSize = grid.length;
    const cellSize = Math.floor(Math.min(maxWidth / realSize, maxHeight / realSize));
    const canvasWidth = cellSize * realSize;
    const canvasHeight = cellSize * realSize;

    [mazeCanvas, drawCanvas, bufferCanvas].forEach(canvas => {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
    });

    let clipPath = 'none';
    if (shape === 'circle') {
        clipPath = `circle(48% at 50% 50%)`;
    } else if (shape === 'triangle') {
        clipPath = `polygon(50% 2%, 98% 96%, 2% 96%)`;
    }
    mazeCanvas.style.clipPath = clipPath;

    mazeCtx.fillStyle = "transparent";
    mazeCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // [수정] 실제 데이터가 있는 만큼만 반복 (안전한 반복문)
    mazeCtx.fillStyle = "white";
    for (let y = 0; y < grid.length; y++) {
        if (!grid[y]) continue; // 행 데이터가 없으면 건너뜀

        for (let x = 0; x < grid[y].length; x++) {
            const cell = grid[y][x];
            // cell이 존재하고 isActive일 때만 그림
            if (cell && cell.isActive) {
                mazeCtx.fillRect(x * cellSize, y * cellSize, cellSize + 1, cellSize + 1);
            }
        }
    }

    if (state.mazeStartPoint) {
        mazeCtx.fillStyle = "#FF5252";
        mazeCtx.fillRect(state.mazeStartPoint.x * cellSize, state.mazeStartPoint.y * cellSize, cellSize, cellSize);
    }

    if (state.mazeEndPoint) {
        mazeCtx.fillStyle = "#448AFF";
        mazeCtx.fillRect(state.mazeEndPoint.x * cellSize, state.mazeEndPoint.y * cellSize, cellSize, cellSize);
    }

    mazeCtx.strokeStyle = "#333";
    mazeCtx.lineWidth = 1;
    mazeCtx.beginPath();

    // [수정] 벽 그리기 반복문도 안전하게 변경
    for (let y = 0; y < grid.length; y++) {
        if (!grid[y]) continue;

        for (let x = 0; x < grid[y].length; x++) {
            const cell = grid[y][x];
            if (!cell || !cell.isActive) continue;

            const px = x * cellSize;
            const py = y * cellSize;

            mazeCtx.lineCap = 'square';

            if (cell.top) { mazeCtx.moveTo(px, py); mazeCtx.lineTo(px + cellSize, py); }
            if (cell.left) { mazeCtx.moveTo(px, py); mazeCtx.lineTo(px, py + cellSize); }
            if (cell.bottom) { mazeCtx.moveTo(px, py + cellSize); mazeCtx.lineTo(px + cellSize, py + cellSize); }
            if (cell.right) { mazeCtx.moveTo(px + cellSize, py); mazeCtx.lineTo(px + cellSize, py + cellSize); }
        }
    }
    mazeCtx.stroke();
}


function setMode(newMode) {
    state.mode = newMode;
    document.getElementById('btn-pen').classList.toggle('active', state.mode === 'pen');
    document.getElementById('btn-eraser').classList.toggle('active', state.mode === 'eraser');
}

function setColor(element) {
    setMode('pen');
    state.currentRGB = element.dataset.color;
    document.querySelectorAll('.color-dot').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
}

function resetAll() {
    if (confirm('그림을 모두 지울까요?')) {
        state.savedPaths = [];
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        saveSession();
    }
}

function toggleDifficulty(e) {
    const menuText = document.querySelector('.menu-text');
    // 체크박스가 해제되어 있으면 Easy Mode
    state.isEasyMode = !e.target.checked;
    console.log("Mode: ", state.isEasyMode);

    if (state.isEasyMode) {
        menuText.textContent = '😄'; // Easy
        // 이지 모드 로직 (여기서는 시작점 근처가 목표가 되도록 해야 하나,
        // 기존 로직상 endPoint가 이미 멀리 설정되어 있어 UI 표시만 변경함.
        // 필요시 generateNewMaze에서 로직 분기 필요)
    } else {
        menuText.textContent = '😝'; // Hard
    }
    // 난이도 변경 시 세션 저장
    saveSession();
}