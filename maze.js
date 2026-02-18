/**
 * 미로 생성 알고리즘 (DFS 방식 + 최장 거리 탐색)
 */
const MazeGenerator = {
    generate(size) {
        let grid = [];
        // 1. 그리드 초기화
        for (let y = 0; y < size; y++) {
            let row = [];
            for (let x = 0; x < size; x++) {
                row.push({
                    x, y,
                    top: true, right: true, bottom: true, left: true,
                    visited: false,
                    isStart: false, isEnd: false
                });
            }
            grid.push(row);
        }

        let stack = [];
        let current = grid[0][0];
        current.visited = true;
        current.isStart = true;
        stack.push(current);

        const directions = [
            {dx: 0, dy: -1, wall: 'top', opp: 'bottom'},
            {dx: 0, dy: 1, wall: 'bottom', opp: 'top'},
            {dx: -1, dy: 0, wall: 'left', opp: 'right'},
            {dx: 1, dy: 0, wall: 'right', opp: 'left'}
        ];

        let maxDistance = 0;
        let farthestCell = current;

        // 2. DFS 탐색
        while (stack.length > 0) {
            current = stack[stack.length - 1];

            // 최장 거리 갱신 (Hard 모드용)
            if (stack.length > maxDistance) {
                maxDistance = stack.length;
                farthestCell = current;
            }

            let neighbors = [];
            for (let d of directions) {
                let nx = current.x + d.dx;
                let ny = current.y + d.dy;
                if (nx >= 0 && nx < size && ny >= 0 && ny < size && !grid[ny][nx].visited) {
                    neighbors.push({cell: grid[ny][nx], dir: d});
                }
            }

            if (neighbors.length > 0) {
                let chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
                current[chosen.dir.wall] = false;
                chosen.cell[chosen.dir.opp] = false;
                chosen.cell.visited = true;
                stack.push(chosen.cell);
            } else {
                stack.pop();
            }
        }

        farthestCell.isEnd = true;

        return {
            grid: grid,
            endPoint: { x: farthestCell.x, y: farthestCell.y },
            maxDistance: maxDistance
        };
    }
};