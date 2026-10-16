// ============================================================
//  FLAPPY BALL — YANA SEKINLASHTIRILGAN FIZIKA
// ============================================================
(function () {
    'use strict';

    // ---------------- SOZLAMALAR ----------------
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    const STORAGE_KEY = 'flappyBallHighScore';
    const SOUND_KEY = 'flappyBallSound';

    // ⭐⭐ YANGI FIZIKA — JUDA SEKIN
    const GRAVITY = 0.12;              // 0.25 edi → yana 2x sekin
    const JUMP_POWER = -4.0;           // -5.5 edi → yumshoqroq
    const MAX_FALL_SPEED = 4.0;        // 7 edi → tushish cheklangan
    const BASE_PIPE_SPEED = 1.2;       // 1.8 edi → quvurlar sekinroq
    const BASE_PIPE_GAP = 200;         // 180 edi → kattaroq teshik
    const PIPE_WIDTH = 60;
    const BASE_SPAWN_INTERVAL = 130;   // 100 edi → quvurlar kamroq

    // ---------------- DOM ----------------
    const scoreEl = document.getElementById('score');
    const highScoreEl = document.getElementById('highScore');
    const levelEl = document.getElementById('level');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlayText = document.getElementById('overlayText');
    const startBtn = document.getElementById('startBtn');
    const soundBtn = document.getElementById('soundBtn');
    const restartBtn = document.getElementById('restartBtn');
    const clearRecordBtn = document.getElementById('clearRecordBtn');

    // ---------------- O'YIN HOLATI ----------------
    let ball = { x: 100, y: H / 2, r: 16, vy: 0 };
    let pipes = [];
    let particles = [];
    let clouds = [];
    let score = 0;
    let highScore = 0;
    let level = 1;
    let pipeGap = BASE_PIPE_GAP;
    let pipeSpeed = BASE_PIPE_SPEED;
    let spawnTimer = 0;
    let spawnInterval = BASE_SPAWN_INTERVAL;
    let groundOffset = 0;
    let gameState = 'ready'; // 'ready' | 'playing' | 'over'
    let animationId = null;
    let frameCount = 0;

    // ---------------- OVOZ ----------------
    let audioCtx = null;
    let soundEnabled = true;

    function initAudio() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) { /* ignore */ }
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playTone(freq, duration, type, volume, delay) {
        if (!soundEnabled) return;
        initAudio();
        if (!audioCtx) return;
        type = type || 'sine';
        volume = volume || 0.12;
        delay = delay || 0;

        const t0 = audioCtx.currentTime + delay;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + duration + 0.02);
    }

    const SFX = {
        flap: function () { playTone(520, 0.06, 'sine', 0.08, 0); },
        score: function () {
            playTone(880, 0.08, 'square', 0.10, 0);
            playTone(1180, 0.10, 'square', 0.10, 0.06);
        },
        hit: function () {
            playTone(200, 0.12, 'sawtooth', 0.15, 0);
            playTone(120, 0.25, 'sawtooth', 0.15, 0.10);
        },
        over: function () {
            playTone(400, 0.14, 'triangle', 0.13, 0);
            playTone(300, 0.14, 'triangle', 0.13, 0.13);
            playTone(200, 0.30, 'triangle', 0.13, 0.26);
        },
        record: function () {
            playTone(523, 0.09, 'square', 0.12, 0);
            playTone(659, 0.09, 'square', 0.12, 0.09);
            playTone(784, 0.09, 'square', 0.12, 0.18);
            playTone(1047, 0.30, 'square', 0.12, 0.27);
        },
        click: function () { playTone(800, 0.04, 'sine', 0.07, 0); },
        levelUp: function () {
            playTone(659, 0.10, 'triangle', 0.12, 0);
            playTone(880, 0.10, 'triangle', 0.12, 0.10);
            playTone(1175, 0.20, 'triangle', 0.12, 0.20);
        }
    };

    // ---------------- LOCALSTORAGE ----------------
    function loadHighScore() {
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            highScore = v ? parseInt(v, 10) : 0;
            if (isNaN(highScore)) highScore = 0;
        } catch (e) { highScore = 0; }
        highScoreEl.textContent = highScore;
    }

    function saveHighScore() {
        try { localStorage.setItem(STORAGE_KEY, String(highScore)); } catch (e) { /* ignore */ }
    }

    function loadSoundPref() {
        try {
            const v = localStorage.getItem(SOUND_KEY);
            soundEnabled = (v === null) ? true : (v === '1');
        } catch (e) { soundEnabled = true; }
        updateSoundBtn();
    }

    function saveSoundPref() {
        try { localStorage.setItem(SOUND_KEY, soundEnabled ? '1' : '0'); } catch (e) { /* ignore */ }
    }

    function updateSoundBtn() {
        soundBtn.textContent = soundEnabled ? '🔊 Ovoz' : '🔇 Ovoz';
        soundBtn.classList.toggle('muted', !soundEnabled);
    }

    function clearHighScore() {
        if (confirm('Rekordni rostdan ham tozalamoqchimisiz?')) {
            highScore = 0;
            try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
            highScoreEl.textContent = 0;
            SFX.click();
        }
    }

    // ---------------- OBYEKTLAR YARATISH ----------------
    function createPipes() {
        pipes = [];
        const gapY = 120 + Math.random() * (H - 340);
        pipes.push({
            x: W,
            gapY: gapY,
            gapH: pipeGap,
            width: PIPE_WIDTH,
            scored: false
        });
    }

    function createClouds() {
        clouds = [];
        for (let i = 0; i < 5; i++) {
            clouds.push({
                x: Math.random() * W,
                y: 40 + Math.random() * 200,
                r: 20 + Math.random() * 25,
                speed: 0.2 + Math.random() * 0.4,
                alpha: 0.15 + Math.random() * 0.2
            });
        }
    }

    function spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 4;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                life: 1.0,
                decay: 0.02 + Math.random() * 0.03,
                size: 2 + Math.random() * 4,
                color: color || '#ffd93b'
            });
        }
    }

    // ---------------- O'YINNI BOSHLASH ----------------
    function resetGame() {
        ball = { x: 100, y: H / 2, r: 16, vy: 0 };
        pipes = [];
        particles = [];
        score = 0;
        level = 1;
        pipeGap = BASE_PIPE_GAP;
        pipeSpeed = BASE_PIPE_SPEED;
        spawnTimer = 0;
        spawnInterval = BASE_SPAWN_INTERVAL;
        groundOffset = 0;
        frameCount = 0;

        scoreEl.textContent = '0';
        levelEl.textContent = '1';

        createClouds();
        createPipes();

        gameState = 'ready';
        hideOverlay();
        draw();
    }

    function startGame() {
        initAudio();
        gameState = 'playing';
        hideOverlay();
        if (!animationId) {
            gameLoop();
        }
    }

    // ---------------- YANGILANISH ----------------
    function update() {
        frameCount++;

        // Bulutlar
        for (let i = 0; i < clouds.length; i++) {
            clouds[i].x -= clouds[i].speed;
            if (clouds[i].x < -50) {
                clouds[i].x = W + 50;
                clouds[i].y = 40 + Math.random() * 200;
            }
        }

        // Zarrachalar
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }

        if (gameState === 'playing') {
            // ⭐ Ball fizikasi — juda sekin
            ball.vy += GRAVITY;

            // Maksimal tushish tezligini cheklash
            if (ball.vy > MAX_FALL_SPEED) {
                ball.vy = MAX_FALL_SPEED;
            }
            // Maksimal ko'tarilish tezligini ham cheklash
            if (ball.vy < -8) {
                ball.vy = -8;
            }

            ball.y += ball.vy;

            // Tepaga urilish
            if (ball.y - ball.r < 0) {
                ball.y = ball.r;
                ball.vy = 0;
            }

            // Pastga urilish
            if (ball.y + ball.r >= H - 40) {
                ball.y = H - 40 - ball.r;
                endGame();
                return;
            }

            // Quvurlar harakatlanishi
            for (let i = 0; i < pipes.length; i++) {
                pipes[i].x -= pipeSpeed;

                // Hisob oshirish
                if (!pipes[i].scored && pipes[i].x + pipes[i].width < ball.x - ball.r) {
                    pipes[i].scored = true;
                    score++;
                    scoreEl.textContent = score;
                    SFX.score();
                    spawnParticles(ball.x, ball.y, '#ffd93b', 8);

                    // Har 5 balldan daraja oshadi — qiyinlik sekin ortadi
                    if (score % 5 === 0) {
                        level++;
                        levelEl.textContent = level;
                        // Tezlik juda sekin ortadi
                        pipeSpeed = Math.min(3.0, BASE_PIPE_SPEED + (level - 1) * 0.08);
                        // Teshik juda sekin kichrayadi
                        pipeGap = Math.max(160, BASE_PIPE_GAP - (level - 1) * 3);
                        // Spawn interval sekin qisqaradi
                        spawnInterval = Math.max(90, BASE_SPAWN_INTERVAL - (level - 1) * 2);
                        SFX.levelUp();
                    }

                    // Rekord
                    if (score > highScore) {
                        const wasBeaten = highScore > 0 && (score - 1) <= highScore;
                        highScore = score;
                        highScoreEl.textContent = highScore;
                        saveHighScore();
                        if (wasBeaten) SFX.record();
                    }
                }
            }

            // Yangi quvur qo'shish
            spawnTimer++;
            if (spawnTimer >= spawnInterval) {
                spawnTimer = 0;
                const gapY = 100 + Math.random() * (H - 300);
                pipes.push({
                    x: W,
                    gapY: gapY,
                    gapH: pipeGap,
                    width: PIPE_WIDTH,
                    scored: false
                });
            }

            // Keraksiz quvurlarni olib tashlash
            for (let i = pipes.length - 1; i >= 0; i--) {
                if (pipes[i].x + pipes[i].width < -10) {
                    pipes.splice(i, 1);
                }
            }

            // Kolliziya tekshiruvi
            for (let i = 0; i < pipes.length; i++) {
                const p = pipes[i];

                const ballLeft = ball.x - ball.r;
                const ballRight = ball.x + ball.r;
                const pipeLeft = p.x;
                const pipeRight = p.x + p.width;

                if (ballRight > pipeLeft && ballLeft < pipeRight) {
                    // Yuqori quvur
                    if (ball.y - ball.r < p.gapY) {
                        endGame();
                        return;
                    }
                    // Pastki quvur
                    if (ball.y + ball.r > p.gapY + p.gapH) {
                        endGame();
                        return;
                    }
                }
            }

            // Yer siljishi
            groundOffset = (groundOffset + pipeSpeed) % 40;
        }
    }

    // ---------------- O'YIN TUGASHI ----------------
    function endGame() {
        gameState = 'over';
        SFX.hit();
        setTimeout(function () { SFX.over(); }, 180);

        spawnParticles(ball.x, ball.y, '#ff6b6b', 20);

        if (score > highScore) {
            highScore = score;
            highScoreEl.textContent = highScore;
            saveHighScore();
        }

        overlayTitle.textContent = "O'yin tugadi! 🎈";
        overlayText.textContent = 'Hisob: ' + score + '  |  Rekord: ' + highScore;
        startBtn.textContent = 'Qaytadan';
        showOverlay();
    }

    // ---------------- CHIZISH ----------------
    function drawBackground() {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#1a2a6c');
        grad.addColorStop(0.5, '#2a5298');
        grad.addColorStop(1, '#4a90e2');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        for (let i = 0; i < clouds.length; i++) {
            const c = clouds[i];
            ctx.fillStyle = 'rgba(255, 255, 255, ' + c.alpha + ')';
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 0.7, c.y + 5, c.r * 0.75, 0, Math.PI * 2);
            ctx.arc(c.x - c.r * 0.7, c.y + 8, c.r * 0.65, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for (let i = 0; i < 30; i++) {
            const sx = (i * 137 + frameCount * 0.2) % W;
            const sy = (i * 71) % 100;
            ctx.fillRect(sx, sy, 1.5, 1.5);
        }
    }

    function drawPipes() {
        for (let i = 0; i < pipes.length; i++) {
            const p = pipes[i];

            const grad = ctx.createLinearGradient(p.x, 0, p.x + p.width, 0);
            grad.addColorStop(0, '#2ecc71');
            grad.addColorStop(0.5, '#27ae60');
            grad.addColorStop(1, '#1e8449');

            // Yuqori quvur
            ctx.fillStyle = grad;
            ctx.fillRect(p.x, 0, p.width, p.gapY);
            ctx.strokeStyle = '#145a32';
            ctx.lineWidth = 3;
            ctx.strokeRect(p.x, 0, p.width, p.gapY);

            ctx.fillStyle = '#27ae60';
            ctx.fillRect(p.x - 5, p.gapY - 20, p.width + 10, 20);
            ctx.strokeRect(p.x - 5, p.gapY - 20, p.width + 10, 20);

            // Pastki quvur
            const bottomY = p.gapY + p.gapH;
            const bottomH = H - 40 - bottomY;
            ctx.fillStyle = grad;
            ctx.fillRect(p.x, bottomY, p.width, bottomH);
            ctx.strokeRect(p.x, bottomY, p.width, bottomH);

            ctx.fillStyle = '#27ae60';
            ctx.fillRect(p.x - 5, bottomY, p.width + 10, 20);
            ctx.strokeRect(p.x - 5, bottomY, p.width + 10, 20);
        }
    }

    function drawBall() {
        // Soya
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.ellipse(ball.x, H - 42, ball.r, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glow
        ctx.save();
        ctx.shadowColor = '#ffd93b';
        ctx.shadowBlur = 20;

        const grad = ctx.createRadialGradient(
            ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, ball.r * 0.2,
            ball.x, ball.y, ball.r
        );
        grad.addColorStop(0, '#fff4a3');
        grad.addColorStop(0.5, '#ffd93b');
        grad.addColorStop(1, '#f39c12');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = '#c98000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.stroke();

        // Ko'zlar
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ball.x - 5, ball.y - 4, 4, 0, Math.PI * 2);
        ctx.arc(ball.x + 5, ball.y - 4, 4, 0, Math.PI * 2);
        ctx.fill();

        // Qorachiqlar ball tezligiga qarab harakatlanadi
        const eyeOffsetY = Math.max(-2, Math.min(2, ball.vy * 0.3));
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(ball.x - 5, ball.y - 3 + eyeOffsetY, 2, 0, Math.PI * 2);
        ctx.arc(ball.x + 5, ball.y - 3 + eyeOffsetY, 2, 0, Math.PI * 2);
        ctx.fill();

        // Og'iz
        ctx.strokeStyle = '#8b5a00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y + 5, 4, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
    }

    function drawGround() {
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(0, H - 40, W, 40);

        ctx.fillStyle = '#27ae60';
        ctx.fillRect(0, H - 40, W, 8);

        ctx.fillStyle = '#6b4520';
        for (let x = -groundOffset; x < W; x += 40) {
            ctx.fillRect(x, H - 20, 20, 4);
            ctx.fillRect(x + 10, H - 10, 15, 3);
        }

        ctx.fillStyle = '#2ecc71';
        for (let x = -groundOffset; x < W; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, H - 40);
            ctx.lineTo(x + 5, H - 48);
            ctx.lineTo(x + 10, H - 40);
            ctx.fill();
        }
    }

    function drawParticles() {
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawScore() {
        if (gameState === 'playing' || gameState === 'over') {
            ctx.font = 'bold 48px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillText(score, W / 2 + 2, 22);

            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 4;
            ctx.strokeText(score, W / 2, 20);
            ctx.fillText(score, W / 2, 20);
        }
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        drawBackground();
        drawPipes();
        drawGround();
        drawBall();
        drawParticles();
        drawScore();
    }

    // ---------------- O'YIN LOOP ----------------
    function gameLoop() {
        update();
        draw();
        animationId = requestAnimationFrame(gameLoop);
    }

    // ---------------- BOSHQARISH ----------------
    function flap() {
        if (gameState === 'ready') {
            startGame();
            ball.vy = JUMP_POWER;
            SFX.flap();
            spawnParticles(ball.x, ball.y + ball.r, '#ffd93b', 5);
            return;
        }
        if (gameState === 'playing') {
            ball.vy = JUMP_POWER;
            SFX.flap();
            spawnParticles(ball.x, ball.y + ball.r, '#ffd93b', 5);
        } else if (gameState === 'over') {
            resetGame();
            startGame();
            ball.vy = JUMP_POWER;
            SFX.flap();
        }
    }

    document.addEventListener('keydown', function (e) {
        if (e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            e.preventDefault();
            flap();
        }
    });

    canvas.addEventListener('click', function () {
        flap();
    });

    canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        flap();
    }, { passive: false });

    // ---------------- TUGMALAR ----------------
    startBtn.addEventListener('click', function () {
        initAudio();
        SFX.click();
        if (gameState === 'over' || gameState === 'ready') {
            resetGame();
            startGame();
        }
    });

    restartBtn.addEventListener('click', function () {
        SFX.click();
        resetGame();
        startGame();
    });

    soundBtn.addEventListener('click', function () {
        soundEnabled = !soundEnabled;
        saveSoundPref();
        updateSoundBtn();
        if (soundEnabled) { initAudio(); SFX.click(); }
    });

    clearRecordBtn.addEventListener('click', clearHighScore);

    // ---------------- OVERLAY ----------------
    function showOverlay() {
        overlay.classList.remove('hidden');
    }

    function hideOverlay() {
        overlay.classList.add('hidden');
    }

    // ---------------- ISHGA TUSHIRISH ----------------
    loadHighScore();
    loadSoundPref();
    resetGame();

    if (!animationId) {
        gameLoop();
    }

    overlayTitle.textContent = 'Flappy Ball';
    overlayText.textContent = 'Boshlash uchun bosing yoki SPACE tugmasini bosing';
    startBtn.textContent = 'Boshlash';
    showOverlay();

})();