
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // UI Elements
    const uiContainer = document.querySelector('.ui-container');
    const currentTimeEl = document.getElementById('current-time');
    const highScoreEl = document.getElementById('high-score');
    const startMenu = document.getElementById('start-menu');
    const tutorialText = document.getElementById('tutorial-text');
    const countdownText = document.getElementById('countdown-text');
    const gameOverMenu = document.getElementById('game-over-menu');
    const finalScoreEl = document.getElementById('final-score');
    const restartButton = document.getElementById('restart-button');
    const pauseMenu = document.getElementById('pause-menu');

    // Game settings
    let canvasWidth, canvasHeight;
    const playerRadius = 15;
    const playerColor = '#4deeea';
    const arrowColor = '#ff6b6b';

    // Game state
    let player;
    let arrows = [];
    let keys = {};
    let isGameRunning = false;
    let isGameOver = false;
    let isPaused = false;
    let lastFrameTime;
    let elapsedTime = 0;
    let timeSinceLastSpawn = 0;
    let timeSinceLastPattern = 0;
    let warnings = [];
    let isPatternActive = false;
    let highScore = localStorage.getItem('dodgeScapeHighScore') || 0;
    highScoreEl.textContent = highScore;

    // --- Classes (Player, Arrow) remain the same as before ---
    class Player {
        constructor(x, y, radius, color) {
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.color = color;
            this.vx = 0; this.vy = 0;
            this.acceleration = 0.5;
            this.friction = 0.95;
            this.maxSpeed = 5.5;
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        update() {
            if (keys['w'] || keys['W'] || keys['ArrowUp']) this.vy -= this.acceleration;
            if (keys['s'] || keys['S'] || keys['ArrowDown']) this.vy += this.acceleration;
            if (keys['a'] || keys['A'] || keys['ArrowLeft']) this.vx -= this.acceleration;
            if (keys['d'] || keys['D'] || keys['ArrowRight']) this.vx += this.acceleration;
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed > this.maxSpeed) {
                this.vx = (this.vx / speed) * this.maxSpeed;
                this.vy = (this.vy / speed) * this.maxSpeed;
            }
            this.vx *= this.friction;
            this.vy *= this.friction;
            this.x += this.vx;
            this.y += this.vy;
            if (this.x - this.radius < 0) { this.x = this.radius; this.vx *= -0.5; }
            if (this.x + this.radius > canvasWidth) { this.x = canvasWidth - this.radius; this.vx *= -0.5; }
            if (this.y - this.radius < 0) { this.y = this.radius; this.vy *= -0.5; }
            if (this.y + this.radius > canvasHeight) { this.y = canvasHeight - this.radius; this.vy *= -0.5; }
        }
    }

    class Arrow {
        constructor(x, y, velocity, size, color, type = 'normal') {
            this.x = x; this.y = y; this.velocity = velocity; this.size = size; this.color = color;
            this.type = type;
            this.angle = Math.atan2(velocity.y, velocity.x);
            this.turnRate = 0.03; // Radians per frame for homing
            if (this.type === 'normal') {
                this.createdAt = elapsedTime; // Store creation time for lifetime check
            }
        }
        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.beginPath();
            ctx.moveTo(this.size / 2, 0);
            ctx.lineTo(-this.size / 2, -this.size / 3);
            ctx.lineTo(-this.size / 2, this.size / 3);
            ctx.closePath();
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.restore();
        }
        update() {
            // Homing logic for normal arrows
            if (this.type === 'normal' && player) {
                const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
                let currentAngle = Math.atan2(this.velocity.y, this.velocity.x);
                
                let angleDiff = targetAngle - currentAngle;
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                currentAngle += Math.min(this.turnRate, Math.abs(angleDiff)) * Math.sign(angleDiff);

                const speed = Math.sqrt(this.velocity.x**2 + this.velocity.y**2);
                this.velocity.x = Math.cos(currentAngle) * speed;
                this.velocity.y = Math.sin(currentAngle) * speed;
                this.angle = currentAngle;
            }

            this.x += this.velocity.x;
            this.y += this.velocity.y;
        }
    }

    // --- Game Flow & State Management ---
    function init() {
        setCanvasSize();
        uiContainer.style.display = 'none';
        gameOverMenu.style.display = 'none';
        pauseMenu.style.display = 'none';
        startMenu.style.display = 'flex';
        tutorialText.style.display = 'block';
        countdownText.style.display = 'none';
        window.addEventListener('resize', init);
        window.addEventListener('keydown', handleFirstKeyPress, { once: true });
    }

    function handleFirstKeyPress() {
        tutorialText.style.display = 'none';
        countdownText.style.display = 'block';
        runCountdown();
    }

    function runCountdown() {
        let count = 3;
        countdownText.textContent = count;
        const timer = setInterval(() => {
            count--;
            if (count > 0) {
                countdownText.textContent = count;
            } else if (count === 0) {
                countdownText.textContent = 'GO!';
            } else {
                clearInterval(timer);
                startMenu.style.display = 'none';
                startGame();
            }
        }, 1000);
    }

    function startGame() {
        setCanvasSize(); // Recalculate size in case of resize
        isGameRunning = true;
        isGameOver = false;
        isPaused = false;
        uiContainer.style.display = 'block';
        gameOverMenu.style.display = 'none';
        pauseMenu.style.display = 'none';
        
        player = new Player(canvasWidth / 2, canvasHeight / 2, playerRadius, playerColor);
        arrows = [];
        keys = {};
        warnings = [];
        isPatternActive = false;
        
        const now = performance.now();
        lastFrameTime = now;
        elapsedTime = 0;
        timeSinceLastSpawn = 0;
        timeSinceLastPattern = 0;
        
        // Remove and re-add game-specific listeners
        window.removeEventListener('keydown', handleFirstKeyPress);
        window.addEventListener('keydown', handleGameKeys);
        window.addEventListener('keyup', (e) => { keys[e.key] = false; });
        restartButton.addEventListener('click', () => window.location.reload()); // Simple reload for restart

        animate(now);
    }

    function endGame() {
        isGameRunning = false;
        isGameOver = true;
        finalScoreEl.textContent = parseFloat(elapsedTime).toFixed(2);
        if (elapsedTime > highScore) {
            highScore = parseFloat(elapsedTime).toFixed(2);
            localStorage.setItem('dodgeScapeHighScore', highScore);
            highScoreEl.textContent = highScore;
        }
        gameOverMenu.style.display = 'flex';
    }

    function togglePause() {
        if (!isGameRunning || isGameOver) return;
        isPaused = !isPaused;
        if (isPaused) {
            pauseMenu.style.display = 'flex';
        } else {
            pauseMenu.style.display = 'none';
            const now = performance.now();
            lastFrameTime = now;
            animate(now);
        }
    }

    // --- Input Handlers ---
    function handleGameKeys(e) {
        keys[e.key] = true;
        if (e.key === 'p' || e.key === 'P') togglePause();
        if ((e.key === 'r' || e.key === 'R') && isGameOver) window.location.reload();
    }

    // --- Core Gameplay Logic ---
    function setCanvasSize() {
        canvasWidth = window.innerWidth * 0.9;
        canvasHeight = window.innerHeight * 0.9;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
    }

    function updateGameTime(deltaTime) {
        if (deltaTime > 0) elapsedTime += deltaTime / 1000;
        currentTimeEl.textContent = parseFloat(elapsedTime).toFixed(2);
    }

    function spawnArrow() {
        let x, y;
        const edge = Math.floor(Math.random() * 4);
        const size = 20;
        const currentArrowSpeed = 2;

        switch (edge) {
            case 0: x = Math.random() * canvasWidth; y = 0 - size; break;
            case 1: x = canvasWidth + size; y = Math.random() * canvasHeight; break;
            case 2: x = Math.random() * canvasWidth; y = canvasHeight + size; break;
            case 3: x = 0 - size; y = Math.random() * canvasHeight; break;
        }

        const angle = Math.atan2(player.y - y, player.x - x);
        const velocity = { x: Math.cos(angle) * currentArrowSpeed, y: Math.sin(angle) * currentArrowSpeed };
        arrows.push(new Arrow(x, y, velocity, size, arrowColor, 'normal'));
    }



    function spawnBarrage(edge) {
        const arrowCount = 15;
        const speed = 3 + (elapsedTime * 0.09);
        const size = 18;
        const gapSize = 4;
        const startOfGap = Math.floor(arrowCount / 2) - Math.floor(gapSize / 2);
        const endOfGap = startOfGap + gapSize;

        for (let i = 0; i < arrowCount; i++) {
            if (i >= startOfGap && i < endOfGap) continue;

            let x, y, velocity;
            const isHorizontalEdge = edge === 0 || edge === 2;
            const length = isHorizontalEdge ? canvasWidth : canvasHeight;
            const positionAlongEdge = (length / arrowCount) * (i + 0.5);

            switch (edge) {
                case 0: x = positionAlongEdge; y = 0 - size; velocity = { x: 0, y: speed }; break;
                case 1: x = canvasWidth + size; y = positionAlongEdge; velocity = { x: -speed, y: 0 }; break;
                case 2: x = positionAlongEdge; y = canvasHeight + size; velocity = { x: 0, y: -speed }; break;
                case 3: x = 0 - size; y = positionAlongEdge; velocity = { x: speed, y: 0 }; break;
            }
            arrows.push(new Arrow(x, y, velocity, size, '#FFD700', 'pattern'));
        }
    }

    function triggerBarragePattern() {
        isPatternActive = true;
        const warningDuration = 1.5;
        const edge = Math.floor(Math.random() * 4);
        const size = 40; // Warning area thickness
        let rect;

        switch (edge) {
            case 0: rect = { x: 0, y: 0, width: canvasWidth, height: size }; break;
            case 1: rect = { x: canvasWidth - size, y: 0, width: size, height: canvasHeight }; break;
            case 2: rect = { x: 0, y: canvasHeight - size, width: canvasWidth, height: size }; break;
            case 3: rect = { x: 0, y: 0, width: size, height: canvasHeight }; break;
        }
        warnings.push({ ...rect, endTime: elapsedTime + warningDuration });

        setTimeout(() => {
            spawnBarrage(edge);
            isPatternActive = false;
        }, warningDuration * 1000);
    }

    function spawnCross() {
        const arrowsPerSide = 3;
        const speed = 2.5 + (elapsedTime * 0.13);
        const size = 20;
        const spacing = 40;

        for (let i = 0; i < arrowsPerSide; i++) {
            const offset = (i - Math.floor(arrowsPerSide / 2)) * spacing;
            arrows.push(new Arrow(canvasWidth / 2 + offset, 0 - size, { x: 0, y: speed }, size, '#ADD8E6', 'pattern'));
            arrows.push(new Arrow(canvasWidth / 2 + offset, canvasHeight + size, { x: 0, y: -speed }, size, '#ADD8E6', 'pattern'));
            arrows.push(new Arrow(0 - size, canvasHeight / 2 + offset, { x: speed, y: 0 }, size, '#ADD8E6', 'pattern'));
            arrows.push(new Arrow(canvasWidth + size, canvasHeight / 2 + offset, { x: -speed, y: 0 }, size, '#ADD8E6', 'pattern'));
        }
    }

    function triggerCrossPattern() {
        isPatternActive = true;
        const warningDuration = 1.5;
        const size = 40; // Warning area thickness
        const arrowsPerSide = 3;
        const spacing = 40;
        const totalWidth = (arrowsPerSide - 1) * spacing + size;

        // Horizontal warning
        warnings.push({
            x: 0,
            y: canvasHeight / 2 - totalWidth / 2,
            width: canvasWidth,
            height: totalWidth,
            endTime: elapsedTime + warningDuration
        });
        // Vertical warning
        warnings.push({
            x: canvasWidth / 2 - totalWidth / 2,
            y: 0,
            width: totalWidth,
            height: canvasHeight,
            endTime: elapsedTime + warningDuration
        });

        setTimeout(() => {
            spawnCross();
            isPatternActive = false;
        }, warningDuration * 1000);
    }

    function triggerRandomPattern() {
        const patterns = [triggerBarragePattern, triggerCrossPattern];
        const randomPattern = patterns[Math.floor(Math.random() * patterns.length)];
        randomPattern();
    }

    function checkCollision(arrow, player) {
        const dx = player.x - arrow.x;
        const dy = player.y - arrow.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < player.radius + arrow.size / 3;
    }

    // --- Main Loop ---
    function animate(timestamp) {
        if (isGameOver || isPaused) return;

        const deltaTime = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        requestAnimationFrame(animate);

        ctx.fillStyle = 'rgba(44, 62, 53, 0.4)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Draw warnings
        if (warnings.length > 0) {
            ctx.fillStyle = 'rgba(255, 80, 80, 0.3)';
            for (const warning of warnings) {
                ctx.fillRect(warning.x, warning.y, warning.width, warning.height);
            }
            // Remove expired warnings
            warnings = warnings.filter(w => w.endTime > elapsedTime);
        }


        player.update();
        player.draw();

        timeSinceLastSpawn += deltaTime;
        const currentSpawnInterval = Math.max(100, 800 - (elapsedTime * 10));
        if (timeSinceLastSpawn > currentSpawnInterval) {
            spawnArrow();
            timeSinceLastSpawn = 0;
        }

        timeSinceLastPattern += deltaTime;
        if (timeSinceLastPattern > 10000 && !isPatternActive) {
            triggerRandomPattern();
            timeSinceLastPattern = 0;
        }

        const ARROW_LIFETIME = 5; // seconds
        for (let i = arrows.length - 1; i >= 0; i--) {
            const arrow = arrows[i];
            arrow.update();
            arrow.draw();

            if (checkCollision(arrow, player)) {
                endGame();
                break; // Game over, no need to process more arrows
            }

            // Lifetime check for homing arrows
            if (arrow.type === 'normal' && (elapsedTime - arrow.createdAt > ARROW_LIFETIME)) {
                arrows.splice(i, 1);
                continue;
            }

            // Off-screen check
            if (arrow.x < -20 || arrow.x > canvasWidth + 20 || arrow.y < -20 || arrow.y > canvasHeight + 20) {
                arrows.splice(i, 1);
            }
        }
        
        updateGameTime(deltaTime);
    }

    // --- Initial Setup ---
    init();
});
