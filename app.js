// DOM 요소
const mazeCanvas = document.getElementById('maze-layer');
const mazeCtx = mazeCanvas.getContext('2d');
const drawCanvas = document.getElementById('draw-layer');
const drawCtx = drawCanvas.getContext('2d', {willReadFrequently: true});
const wrapper = document.getElementById('canvas-wrapper');
const bufferCanvas = document.createElement('canvas');
const bufferCtx = bufferCanvas.getContext('2d');

// 상태 변수
let state = {
    isEasyMode: true,
    isDrawing: false,
    mode: 'pen',
    currentRGB: '#000000',
    currentOpacity: 0.5,
    mazeGrid: [],
    mazeEndPoint: {},
    currentSize: 30,
    savedPaths: [],
    currentPath: null,
    savedImageData: null
};

// --- 초기화 및 이벤트 리스너 등록 ---
document.addEventListener('DOMContentLoaded', () => {
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

    // 버튼 이벤트
    document.getElementById('btn-new-maze').addEventListener('click', generateNewMaze);
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

    // 윈도우 리사이즈
    window.addEventListener('resize', () => {
        if (state.mazeGrid.length > 0) {
            drawMaze(state.mazeGrid, state.currentSize);
            restoreDrawing();
        }
    });
}

// --- 핵심 로직 ---

function initApp() {
    if (loadSession()) {
        drawMaze(state.mazeGrid, state.currentSize);
        restoreDrawing();
    } else {
        generateNewMaze();
    }
}

function generateNewMaze() {
    let sizeInput = parseInt(document.getElementById('maze-size').value) || 30;
    state.currentSize = Math.max(5, Math.min(100, sizeInput));

    // MazeGenerator 사용 (maze.js)
    const mazeData = MazeGenerator.generate(state.currentSize);

    console.log(`목표: (${mazeData.endPoint.x}, ${mazeData.endPoint.y}), 거리: ${mazeData.maxDistance}`);

    state.mazeGrid = mazeData.grid;
    // 이지 모드면 우측 하단, 하드 모드면 가장 먼 곳
    state.mazeEndPoint = state.isEasyMode
        ? {x: state.currentSize - 1, y: state.currentSize - 1}
        : mazeData.endPoint;

    state.savedPaths = [];

    drawMaze(state.mazeGrid, state.currentSize);
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    saveSession();
}

function drawMaze(grid, size) {
    const maxWidth = wrapper.clientWidth - 40;
    const maxHeight = wrapper.clientHeight - 40;
    const cellSize = Math.floor(Math.min(maxWidth / size, maxHeight / size));
    const canvasWidth = cellSize * size;
    const canvasHeight = cellSize * size;

    // 캔버스 사이즈 조정
    [mazeCanvas, drawCanvas, bufferCanvas].forEach(canvas => {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
    });

    // 배경 및 시작/끝점 그리기
    mazeCtx.fillStyle = "white";
    mazeCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 시작점 (빨강)
    mazeCtx.fillStyle = "#FF5252";
    mazeCtx.fillRect(0, 0, cellSize, cellSize);

    // 도착점 (파랑)
    mazeCtx.fillStyle = "#448AFF";
    mazeCtx.fillRect(state.mazeEndPoint.x * cellSize, state.mazeEndPoint.y * cellSize, cellSize, cellSize);

    // 미로 벽 그리기
    mazeCtx.strokeStyle = "#333";
    mazeCtx.lineWidth = 2;
    mazeCtx.beginPath();

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cell = grid[y][x];
            const px = x * cellSize;
            const py = y * cellSize;

            if (cell.top) { mazeCtx.moveTo(px, py); mazeCtx.lineTo(px + cellSize, py); }
            if (cell.left) { mazeCtx.moveTo(px, py); mazeCtx.lineTo(px, py + cellSize); }
            if (cell.bottom) { mazeCtx.moveTo(px, py + cellSize); mazeCtx.lineTo(px + cellSize, py + cellSize); }
            if (cell.right) { mazeCtx.moveTo(px + cellSize, py); mazeCtx.lineTo(px + cellSize, py + cellSize); }
        }
    }
    mazeCtx.stroke();
}

// --- 드로잉 로직 ---

function getPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {x: clientX - rect.left, y: clientY - rect.top};
}

function startDraw(e) {
    if (e.cancelable) e.preventDefault();
    state.isDrawing = true;
    const pos = getPos(e);

    state.currentPath = {
        mode: state.mode,
        color: state.currentRGB,
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

        let lw = (drawCanvas.width / state.currentSize) * 0.2;
        bufferCtx.lineWidth = lw < 1 ? 1 : lw;
    } else {
        drawCtx.beginPath();
        drawCtx.moveTo(pos.x, pos.y);
    }
    draw(e);
}

function draw(e) {
    if (!state.isDrawing) return;
    const pos = getPos(e);
    state.currentPath.points.push({x: pos.x / drawCanvas.width, y: pos.y / drawCanvas.height});

    if (state.mode === 'pen') {
        // 버퍼에 먼저 그리고 메인 캔버스에 합성 (투명도 유지 효과)
        bufferCtx.lineTo(pos.x, pos.y);
        bufferCtx.stroke();

        drawCtx.putImageData(state.savedImageData, 0, 0);
        drawCtx.save();
        drawCtx.globalAlpha = state.currentOpacity;
        drawCtx.drawImage(bufferCanvas, 0, 0);
        drawCtx.restore();
    } else {
        // 지우개 모드
        drawCtx.globalCompositeOperation = 'destination-out';
        drawCtx.lineWidth = 20;
        drawCtx.lineCap = 'round';
        drawCtx.lineTo(pos.x, pos.y);
        drawCtx.stroke();
        drawCtx.beginPath();
        drawCtx.moveTo(pos.x, pos.y);
    }
}

function stopDraw() {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    state.savedPaths.push(state.currentPath);
    saveSession();
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
            drawCtx.lineWidth = 20;
        } else {
            drawCtx.globalCompositeOperation = 'source-over';
            drawCtx.strokeStyle = path.color;
            drawCtx.globalAlpha = state.currentOpacity;
            let lw = (w / state.currentSize) * 0.2;
            drawCtx.lineWidth = lw < 1 ? 1 : lw;
        }

        if (path.points.length > 0) {
            drawCtx.moveTo(path.points[0].x * w, path.points[0].y * h);
            for (let i = 1; i < path.points.length; i++) {
                drawCtx.lineTo(path.points[i].x * w, path.points[i].y * h);
            }
            drawCtx.stroke();
        }
    });
}

// --- 유틸리티 및 UI 핸들러 ---

function saveSession() {
    sessionStorage.setItem('mazeSession', JSON.stringify({
        size: state.currentSize,
        grid: state.mazeGrid,
        paths: state.savedPaths,
        endPoint: state.mazeEndPoint
    }));
}

function loadSession() {
    const dataStr = sessionStorage.getItem('mazeSession');
    if (dataStr) {
        const data = JSON.parse(dataStr);
        state.currentSize = data.size;
        state.mazeGrid = data.grid;
        state.mazeEndPoint = data.endPoint || { x: state.currentSize - 1, y: state.currentSize - 1 };
        state.savedPaths = data.paths || [];
        document.getElementById('maze-size').value = state.currentSize;
        return true;
    }
    return false;
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
    if (confirm('지울까요?')) {
        state.savedPaths = [];
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        saveSession();
    }
}

function downloadImage() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = mazeCanvas.width;
    tempCanvas.height = mazeCanvas.height;
    const tCtx = tempCanvas.getContext('2d');

    tCtx.fillStyle = "white";
    tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tCtx.drawImage(mazeCanvas, 0, 0);
    tCtx.drawImage(drawCanvas, 0, 0);

    const link = document.createElement('a');
    link.download = `maze_${state.currentSize}x${state.currentSize}.png`;
    link.href = tempCanvas.toDataURL();
    link.click();
}

function toggleDifficulty(e) {
    const menuText = document.querySelector('.menu-text');
    state.isEasyMode = !e.target.checked;

    if (state.isEasyMode) {
        console.log("이지 모드");
        menuText.textContent = '😄';
    } else {
        console.log("하드 모드");
        menuText.textContent = '😝';
    }
}