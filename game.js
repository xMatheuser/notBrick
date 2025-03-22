class CoopBrickBreaker {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Configurar tamanho do canvas para formato mais estreito/verticalizado
        this.canvas.width = 600;
        this.canvas.height = 700;
        
        this.gameState = {
            currentPlayer: 1,
            player1Score: 0,
            player2Score: 0,
            totalScore: 0,
            isGameOver: false,
            gameOverReason: null,
            level: 1,
            levelAnimation: {
                active: false,
                scale: 1,
                opacity: 0,
                startTime: 0
            }
        };

        // Ajustar paddle para ser mais fino
        this.paddle = {
            width: 100,
            height: 12, // Reduzido de 20 para 12
            x: this.canvas.width / 2 - 50,
            y: this.canvas.height - 30,
            speed: 8,
            baseWidth: 100,
            growthFactor: 0,
            isGrowing: false,
            growthAnimation: 0
        };

        this.ball = {
            x: this.canvas.width / 2,
            y: this.canvas.height - 50,
            radius: 8,
            speed: 3,
            dx: 0,
            dy: 0
        };

        this.maxSpeedIncrease = 1.20;

        // Ajustar configurações dos blocos para melhor layout
        this.brickSettings = {
            rows: 8,           // Alterado para 8 linhas iniciais
            cols: 10,          // Máximo de 10 colunas
            minCols: 5,        // Mínimo de 5 blocos por linha
            width: 50,
            height: 25,
            padding: 5,
            topOffset: 60,
            dangerZone: this.canvas.height - 100, // Aumentado de 150 para 100 para diminuir ainda mais a área
            dropSpeed: 2,      // Velocidade da animação de queda
            dropDistance: 0,   // Distância atual da animação
            isDropping: false, // Estado da animação
            targetY: 0         // Posição final dos blocos
        };

        // Inicializar arrays de blocos antes de qualquer outra coisa
        this.bricks = [];          // Array principal de blocos
        this.newBricks = [];       // Array para novos blocos em animação
        this.droppingBricks = [];  // Array para blocos em queda

        // Carregar blocos iniciais
        this.bricks = this.initializeBricks();

        this.ws = null;
        this.roomId = null;
        this.playerNumber = null;
        this.connectToServer();
        
        this.newBricks = []; // Array para blocos em animação
        this.animationDuration = 1000; // Duração da animação em ms
        
        this.guideLine = {
            maxBounces: 5, // Número máximo de reflexões a mostrar
            isVisible: false,
            points: [] // Array de pontos para desenhar a linha guia
        };

        // Adicionar configurações de power-up
        this.powerUps = [];
        this.powerUpConfig = {
            size: 15,
            speed: 2,
            spawnChance: 0.15, // Reduzido para 15% para balance
            types: {
                cloneBall: { weight: 0.4, color: '#00FF00' },
                growPaddle: { weight: 0.3, color: '#FFA500' },
                guns: { weight: 0.3, color: '#FF0000' }
            }
        };

        // Adicionar array de bolas clones
        this.balls = [{
            x: this.canvas.width / 2,
            y: this.canvas.height - 50,
            radius: 8,
            speed: 3,
            dx: 0,
            dy: 0,
            isOriginal: true
        }];

        // Adicionar sistema de combo
        this.combo = {
            count: 0,
            active: false,
            scale: 1,
            opacity: 1,
            position: {
                x: this.canvas.width / 2,
                y: this.canvas.height / 2
            },
            particles: [],
            lastUpdateTime: 0,
            milestones: [5, 10, 20], // Marcos para efeitos especiais
            sounds: {
                hit: new Audio('sounds/hit.mp3'),
                milestone: new Audio('sounds/milestone.mp3'),
                end: new Audio('sounds/combo-end.mp3')
            }
        };

        // Adicionar array de partículas para efeitos visuais
        this.particles = [];

        // Atualizar configurações da linha de progresso para usar o DOM
        this.progressLine = {
            height: 400, // Altura total da linha
            maxLevel: 10, // Número máximo de níveis para preencher a linha completamente
            markerY: 0,   // Posição atual do marcador
            targetY: 0,   // Posição alvo do marcador
            animation: {
                active: false,
                progress: 0,
                duration: 1000, // Duração da animação em ms
                startY: 0,
                endY: 0
            }
        };

        // Modificar controle de direção da bola
        this.ballDirection = {
            angle: -Math.PI/2, // Ângulo padrão (para cima)
            baseX: 0,          // Posição base para cálculo do ângulo
            isAiming: false    // Estado de mira
        };

        // Adicionar sistema de projéteis
        this.projectiles = [];
        this.projectileSpeed = 8;
        this.projectileSize = 4;
        this.gunsActive = false;
        this.gunsTimer = null;
        this.gunsStartTime = 0; // Add this line
        this.gunCooldown = 0;
        this.gunCooldownTime = 500; // 500ms entre disparos

        // Adicionar event listener para tiro (tecla espaço)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.gunsActive && this.gunCooldown <= 0) {
                this.fireGuns();
            }
        });

        this.init();
    }

    connectToServer() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || 'localhost';
        const wsUrl = `${wsProtocol}//${host}:8080`;
        
        this.ws = new WebSocket(wsUrl);
        
        // Adicionar tratamento de erro na conexão
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            alert('Erro na conexão com o servidor. Por favor, tente novamente.');
        };

        this.ws.onopen = () => {
            this.roomId = new URLSearchParams(window.location.search).get('room') || 
                         Math.random().toString(36).substring(7);
            this.ws.send(JSON.stringify({
                type: 'join',
                roomId: this.roomId
            }));
            
            // Update URL with room ID
            if (!window.location.search) {
                window.history.pushState({}, '', `?room=${this.roomId}`);
            }
        };

        this.ws.onmessage = (event) => {
            try {
                // Ensure we're getting a string before parsing
                const data = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
                console.log('Received message:', data);
                
                switch(data.type) {
                    case 'joined':
                        this.playerNumber = data.player;
                        this.setupControls();
                        break;
                    case 'gameUpdate':
                        this.handleGameUpdate(data);
                        break;
                    case 'switchPlayer':
                        this.gameState.currentPlayer = data.currentPlayer;
                        this.startTurn();
                        this.setupControls();
                        break;
                    case 'levelUp':
                        this.ball.speed = data.ballSpeed;
                        break;
                    case 'error':
                        console.error('Server error:', data.message);
                        alert(data.message);
                        break;
                }
            } catch (error) {
                console.error('Error processing message:', error);
                console.error('Raw message:', event.data);
            }
        };
    }

    handleGameUpdate(data) {
        if (this.gameState.currentPlayer !== this.playerNumber) {
            this.paddle.x = data.paddleX;
    
            // Safely process balls
            if (Array.isArray(data.balls)) {
                this.balls = data.balls.map(ballData => ({
                    ...ballData,
                    isOriginal: ballData.isOriginal
                }));
            } else {
                console.warn('data.balls is undefined or not an array.');
            }
    
            // Continue processing other parts of the update
            if (Array.isArray(data.bricks)) {
                this.bricks = data.bricks;
            }
    
            if (data.guideLine) {
                this.guideLine = data.guideLine;
            }
    
            if (Array.isArray(data.powerUps)) {
                this.powerUps = data.powerUps;
            }
    
            if (data.scores) {
                this.gameState.player1Score = data.scores.player1Score;
                this.gameState.player2Score = data.scores.player2Score;
                this.gameState.totalScore = data.scores.totalScore;
                this.updateScoreDisplay();
            }
    
            if (data.level) {
                this.gameState.level = data.level;
                this.gameState.levelAnimation = {
                    active: true,
                    scale: 2,
                    opacity: 0,
                    startTime: Date.now()
                };
    
                // Update progress marker when the level changes
                this.updateProgressMarker();
            }
    
            if (Array.isArray(data.projectiles)) {
                this.projectiles = data.projectiles;
            }
    
            if (data.gunsState) {
                this.gunsActive = data.gunsState.active;
                if (this.gunsTimer) clearTimeout(this.gunsTimer);
                if (this.gunsActive) {
                    this.gunsStartTime = Date.now() - (30000 - data.gunsState.remainingTime);
                    this.gunsTimer = setTimeout(() => {
                        this.gunsActive = false;
                        this.gunsTimer = null;
                    }, data.gunsState.remainingTime);
                }
            }
        }
    }
    

    initializeBricks() {
        const bricks = [];
        for (let row = 0; row < this.brickSettings.rows; row++) {
            // Gerar número aleatório de colunas para esta linha
            const numCols = Math.floor(Math.random() * 
                (this.brickSettings.cols - this.brickSettings.minCols + 1)) + 
                this.brickSettings.minCols;
            
            // Criar array com todas as posições possíveis
            const positions = Array.from({length: this.brickSettings.cols}, (_, i) => i);
            // Embaralhar e pegar apenas o número desejado de posições
            this.shuffleArray(positions);
            const selectedPositions = positions.slice(0, numCols);
            
            for (let pos of selectedPositions) {
                const brick = this.createBrick(pos, row);
                bricks.push(brick);
            }
        }
        return bricks;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    createBrick(col, row) {
        const { width, height, padding, topOffset } = this.brickSettings;
        
        // Centralizar os blocos na tela
        const totalWidth = (width + padding) * this.brickSettings.cols - padding;
        const startX = (this.canvas.width - totalWidth) / 2;
        
        // Calcular posição x,y do bloco com centralização
        const x = startX + col * (width + padding);
        const y = row * (height + padding) + topOffset;
        
        // Decidir força do bloco baseado em probabilidades
        // Quanto maior o nível, maior a chance de blocos mais fortes
        const levelFactor = Math.min(1, this.gameState.level / 20); // Aumenta gradualmente até nível 20
        const rand = Math.random();
        
        let strength;
        if (rand < 0.6) { // 60% chance de bloco normal
            strength = 1;
        } else if (rand < 0.8) { // 20% chance de bloco forte
            strength = Math.min(10, Math.ceil(Math.random() * 3 + (levelFactor * 2)));
        } else { // 20% chance de bloco muito forte
            strength = Math.min(10, Math.ceil(Math.random() * 5 + (levelFactor * 5)));
        }
        
        // Ajustar pontos baseado na força
        const points = strength * 10;
        
        return {
            x,
            y,
            width,
            height,
            strength,
            points,
            createdAt: Date.now(),
            opacity: 0,
            isHit: false,
            hitTime: 0,
            originalX: x,
            originalY: y
        };
    }

    init() {
        this.setupControls();
        this.startTurn();
        this.updateProgressMarker(); // Inicializar o marcador de progresso
        this.gameLoop();
    }

    setupControls() {
        // Remover os event listeners antigos e adicionar apenas se for o jogador atual
        if (this.gameState.currentPlayer === this.playerNumber) {
            document.addEventListener('mousemove', this.handleMouseMove);
            document.addEventListener('click', this.handleClick);
        } else {
            document.removeEventListener('mousemove', this.handleMouseMove);
            document.removeEventListener('click', this.handleClick);
        }
    }

    calculateTrajectory() {
        const mainBall = this.balls.find(ball => ball.isOriginal);
        if (mainBall && mainBall.dy === 0 && this.gameState.currentPlayer === this.playerNumber) {
            this.guideLine.isVisible = true;
            this.guideLine.points = [];
            
            // Simular a trajetória usando o ângulo atual
            let simX = mainBall.x;
            let simY = mainBall.y;
            let simDx = mainBall.speed * Math.cos(this.ballDirection.angle);
            let simDy = mainBall.speed * Math.sin(this.ballDirection.angle);
            let bounces = 0;
            
            // Criar cópia dos blocos para simulação
            let simBricks = this.bricks.map(brick => ({...brick}));
            
            this.guideLine.points.push({x: simX, y: simY});
            
            while (bounces < this.guideLine.maxBounces) {
                // Calcular próxima posição
                let nextX = simX + simDx;
                let nextY = simY + simDy;
                
                // Verificar colisão com paredes
                if (nextX + this.ball.radius > this.canvas.width || 
                    nextX - this.ball.radius < 0) {
                    simDx *= -1;
                    nextX = simX + simDx;
                }
                if (nextY - this.ball.radius < 0) {
                    simDy *= -1;
                    nextY = simY + simDy;
                    bounces++;
                }
                
                // Verificar colisão com blocos
                let collision = false;
                for (let i = simBricks.length - 1; i >= 0; i--) {
                    const brick = simBricks[i];
                    if (this.detectCollisionPoint(nextX, nextY, this.ball.radius, brick)) {
                        simDy *= -1;
                        nextY = simY + simDy;
                        collision = true;
                        simBricks.splice(i, 1); // Remover bloco da simulação
                        bounces++;
                        break;
                    }
                }
                
                // Adicionar ponto à trajetória
                this.guideLine.points.push({x: nextX, y: nextY});
                
                simX = nextX;
                simY = nextY;
                
                // Parar se atingir a altura do paddle ou após colisão com bloco
                if (simY > this.paddle.y || collision) break;
            }
        } else {
            this.guideLine.isVisible = false;
        }
    }

    // Adicionar novo método para detecção de colisão com ponto
    detectCollisionPoint(x, y, radius, rect) {
        return x + radius > rect.x &&
               x - radius < rect.x + rect.width &&
               y + radius > rect.y &&
               y - radius < rect.y + rect.height;
    }

    handleMouseMove = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        
        if (this.gameState.currentPlayer === this.playerNumber) {
            const mainBall = this.balls.find(ball => ball.isOriginal);
            
            // Se a bola ainda não foi lançada
            if (mainBall && mainBall.dy === 0) {
                if (!this.ballDirection.isAiming) {
                    // Iniciar estado de mira
                    this.ballDirection.isAiming = true;
                    this.ballDirection.baseX = relativeX;
                    // Posicionar paddle e bola no centro
                    this.paddle.x = (this.canvas.width - this.paddle.width) / 2;
                    mainBall.x = this.paddle.x + this.paddle.width / 2;
                } else {
                    // Calcular ângulo baseado na diferença horizontal
                    const deltaX = relativeX - this.ballDirection.baseX;
                    const maxDelta = 200; // Distância máxima para ângulo máximo
                    const normalizedDelta = Math.max(-1, Math.min(1, deltaX / maxDelta));
                    
                    // Calcular ângulo com amplitude de 100 graus (-130° até -40°)
                    // -130° = -2.27 radianos, -40° = -0.70 radianos
                    // Amplitude = 1.57 radianos (90 graus)
                    const baseAngle = -Math.PI * 0.722; // -130°
                    const amplitude = Math.PI * 0.556; // 100°
                    this.ballDirection.angle = baseAngle + (normalizedDelta + 1) * (amplitude / 2);
                    
                    // Garantir que o ângulo está dentro dos limites seguros
                    this.ballDirection.angle = Math.min(-0.70, Math.max(-2.27, this.ballDirection.angle));
                    
                    this.calculateTrajectory();
                }
            } else {
                // Movimento normal do paddle quando a bola já foi lançada
                this.ballDirection.isAiming = false;
                
                // Calcular nova posição do paddle
                let newPaddleX = relativeX - this.paddle.width / 2;
                
                // Limitar a posição do paddle dentro da área jogável
                newPaddleX = Math.max(0, Math.min(newPaddleX, this.canvas.width - this.paddle.width));
                
                this.paddle.x = newPaddleX;
            }
        }
    }

    handleClick = () => {
        if (this.balls[0].dy === 0 && this.gameState.currentPlayer === this.playerNumber) {
            const ball = this.balls[0];
            const speed = ball.speed;
            
            // Usar o ângulo calculado para definir a direção da bola
            ball.dx = speed * Math.cos(this.ballDirection.angle);
            ball.dy = speed * Math.sin(this.ballDirection.angle);
            
            this.guideLine.isVisible = false;
            this.ballDirection.isAiming = false;
        }
    }

    startTurn() {
        // Resetar para apenas a bola original
        this.balls = [{
            x: this.paddle.x + this.paddle.width / 2,
            y: this.canvas.height - 50,
            radius: 8,
            speed: 3,
            dx: 0,
            dy: 0,
            isOriginal: true
        }];

        // Exibir mensagem indicando de quem é a vez
        const isMyTurn = this.gameState.currentPlayer === this.playerNumber;
        document.getElementById('currentTurn').textContent = 
            isMyTurn ? 'Sua vez de jogar!' : `Vez do Jogador ${this.gameState.currentPlayer}`;
    }

    switchPlayer() {
        this.endCombo(); // Adicionar aqui
        this.gameState.currentPlayer = this.gameState.currentPlayer === 1 ? 2 : 1;
        this.startTurn();
        
        // Atualizar controles quando mudar de jogador
        this.setupControls();
        
        // Notificar outros jogadores sobre a mudança de turno e estado dos blocos
        this.ws.send(JSON.stringify({
            type: 'switchPlayer',
            currentPlayer: this.gameState.currentPlayer,
            bricks: this.bricks // Adicionar estado atual dos blocos
        }));

        this.moveBricksDown();
        this.addNewBricksRow();
    }

    moveBricksDown() {
        const { height, padding } = this.brickSettings;
        const moveAmount = height + padding;

        // Mover todos os tijolos para baixo
        this.bricks.forEach(brick => {
            brick.y += moveAmount;
            
            // Verificar se algum tijolo atingiu a zona de perigo
            if (brick.y + brick.height >= this.brickSettings.dangerZone) {
                this.handleGameOver('blocks');
            }
        });
    }

    addNewBricksRow() {
        const { cols } = this.brickSettings;
        const timestamp = Date.now();
        
        // Adicionar nova linha de tijolos no topo
        for (let j = 0; j < cols; j++) {
            const brick = this.createBrick(j, 0);
            brick.createdAt = timestamp;
            this.bricks.unshift(brick);
        }
    }

    handleGameOver(reason) {
        this.gameState.isGameOver = true;
        this.gameState.gameOverReason = reason;
        this.ball.dx = 0;
        this.ball.dy = 0;

        // Notificar outros jogadores
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'gameOver',
                reason: reason,
                score: this.gameState.totalScore
            }));
        }
    }

    gameLoop = () => {
        this.update();
        this.draw();
        requestAnimationFrame(this.gameLoop);
    }

    update() {
        // Atualizar power-ups
        this.updatePowerUps();

        // Atualizar todas as bolas
        this.updateBalls();

        // Atualizar projéteis
        this.updateProjectiles();

        // Atualizar cooldown das armas
        if (this.gunCooldown > 0) {
            this.gunCooldown -= 16; // Aproximadamente 60 FPS
        }

        // Atualizar animação dos blocos em queda
        if (this.brickSettings.isDropping) {
            let allSettled = true;
            const dropSpeed = this.brickSettings.dropSpeed;
            
            for (let brick of this.droppingBricks) {
                const distance = brick.targetY - brick.currentY;
                if (Math.abs(distance) > 0.1) {
                    brick.currentY += Math.min(dropSpeed, distance);
                    brick.y = Math.round(brick.currentY);
                    allSettled = false;
                }
            }

            if (allSettled) {
                // Adicionar blocos ao jogo quando a animação terminar
                this.bricks.push(...this.droppingBricks);
                this.droppingBricks = [];
                this.brickSettings.isDropping = false;
            }
        }

        if (this.gameState.currentPlayer === this.playerNumber && this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({
                    type: 'gameUpdate',
                    paddleX: this.paddle.x,
                    balls: this.balls,  // Enviar array completo de bolas
                    bricks: this.bricks,
                    guideLine: this.guideLine,
                    powerUps: this.powerUps,  // Incluir power-ups na sincronização
                    scores: {  // Adicionar scores ao update
                        player1Score: this.gameState.player1Score,
                        player2Score: this.gameState.player2Score,
                        totalScore: this.gameState.totalScore
                    },
                    // Adicionar estado dos projéteis e armas
                    projectiles: this.projectiles,
                    gunsState: {
                        active: this.gunsActive,
                        remainingTime: this.gunsActive ? (30000 - (Date.now() - this.gunsStartTime)) : 0
                    }
                }));
            } catch (error) {
                console.error('Error sending update:', error);
            }
        }
    }

    updatePowerUps() {
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            powerUp.y += this.powerUpConfig.speed;

            // Verificar colisão com paddle
            if (this.detectCollision(
                {x: powerUp.x + powerUp.width/2, y: powerUp.y + powerUp.height/2, radius: powerUp.width/2},
                this.paddle
            )) {
                this.activatePowerUp(powerUp);
                this.powerUps.splice(i, 1);
            }

            // Remover power-ups que saíram da tela
            if (powerUp.y > this.canvas.height) {
                this.powerUps.splice(i, 1);
            }
        }
    }

    updateBalls() {
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            if (ball.dy !== 0) {
                // Atualizar posição
                ball.x += ball.dx;
                ball.y += ball.dy;

                // Colisões com paredes
                if (ball.x + ball.radius > this.canvas.width || ball.x - ball.radius < 0) {
                    ball.dx *= -1;
                }
                if (ball.y - ball.radius < 0) {
                    ball.dy *= -1;
                }

                // Colisão com paddle
                if (ball.y + ball.radius > this.paddle.y &&
                    ball.x > this.paddle.x &&
                    ball.x < this.paddle.x + this.paddle.width) {
                    ball.dy = -ball.speed;
                }

                // Remover bolas clones que caíram
                if (ball.y + ball.radius > this.canvas.height) {
                    if (!ball.isOriginal) {
                        this.balls.splice(i, 1);
                    } else {
                        this.endCombo(); // Adicionar aqui
                        this.switchPlayer();
                    }
                }

                // Verificar colisões com blocos
                this.checkBallBrickCollisions(ball);
            }
        }
    }

    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.y -= this.projectileSpeed;

            // Remover projéteis que saíram da tela
            if (proj.y + this.projectileSize < 0) {
                this.projectiles.splice(i, 1);
                continue;
            }

            // Verificar colisão com blocos
            for (let j = this.bricks.length - 1; j >= 0; j--) {
                const brick = this.bricks[j];
                if (this.detectCollision(
                    { x: proj.x, y: proj.y, radius: this.projectileSize },
                    brick
                )) {
                    // Remover projétil
                    this.projectiles.splice(i, 1);
                    
                    // Reduzir força do bloco
                    brick.strength--;
                    if (brick.strength <= 0) {
                        this.addScore(brick.points);
                        this.updateCombo();
                        this.bricks.splice(j, 1);

                        if (this.bricks.length === 0) {
                            this.addNewLevel();
                        }
                    }
                    break;
                }
            }
        }
    }

    checkBallBrickCollisions(ball) {
        for (let i = this.bricks.length - 1; i >= 0; i--) {
            const brick = this.bricks[i];
            if (this.detectCollision(ball, brick)) {
                ball.dy *= -1;
                
                // Add hit animation
                brick.isHit = true;
                brick.hitTime = Date.now();
                brick.originalX = brick.x;
                brick.originalY = brick.y;
                
                // Reduce strength and check if destroyed
                brick.strength--;
                
                // Handle brick destruction
                if (brick.strength <= 0) {
                    // Spawn power-up chance
                    if (Math.random() < this.powerUpConfig.spawnChance) {
                        this.powerUps.push(this.createPowerUp(
                            brick.x + brick.width/2 - this.powerUpConfig.size/2,
                            brick.y + brick.height/2 - this.powerUpConfig.size/2
                        ));
                    }

                    this.addScore(brick.points);
                    this.updateCombo();
                    this.bricks.splice(i, 1);

                    if (this.bricks.length === 0) {
                        this.addNewLevel();
                    }
                }
                break; // Exit loop after first collision
            }
        }
    }

    createPowerUp(x, y) {
        // Escolher tipo baseado nos pesos
        const rand = Math.random();
        const type = rand < this.powerUpConfig.types.cloneBall.weight ? 'cloneBall' : 
                     rand < this.powerUpConfig.types.cloneBall.weight + this.powerUpConfig.types.growPaddle.weight ? 'growPaddle' : 'guns';
        
        return {
            x,
            y,
            width: this.powerUpConfig.size,
            height: this.powerUpConfig.size,
            type: type,
            color: this.powerUpConfig.types[type].color
        };
    }

    fireGuns() {
        if (!this.gunsActive || this.gunCooldown > 0) return;

        // Adicionar dois projéteis nas extremidades do paddle
        this.projectiles.push(
            { x: this.paddle.x + 10, y: this.paddle.y },
            { x: this.paddle.x + this.paddle.width - 10, y: this.paddle.y }
        );

        // Definir cooldown
        this.gunCooldown = this.gunCooldownTime;
    }

    activatePowerUp(powerUp) {
        if (powerUp.type === 'guns') {
            this.gunsActive = true;
            
            if (this.gunsTimer) clearTimeout(this.gunsTimer);
            
            this.gunsStartTime = Date.now(); // Store start time separately
            this.gunsTimer = setTimeout(() => {
                this.gunsActive = false;
                this.gunsTimer = null;
                
                // Notificar outros jogadores que as armas foram desativadas
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'gameUpdate',
                        gunsState: {
                            active: false,
                            remainingTime: 0
                        }
                    }));
                }
            }, 30000);
        } else if (powerUp.type === 'cloneBall') {
            const originalBall = this.balls.find(ball => ball.isOriginal);
            if (originalBall && originalBall.dy !== 0) {
                // Criar offset aleatório para posição da bola clone
                const offset = {
                    x: (Math.random() * 40 - 20), // offset de -20 a +20 pixels
                    y: (Math.random() * 40 - 20)  // offset de -20 a +20 pixels
                };

                const clone = {
                    x: originalBall.x + offset.x,
                    y: originalBall.y + offset.y,
                    radius: originalBall.radius,
                    speed: originalBall.speed,
                    dx: originalBall.dx,
                    dy: originalBall.dy,
                    isOriginal: false
                };

                // Verificar se a nova posição está dentro dos limites do canvas
                clone.x = Math.max(clone.radius, Math.min(this.canvas.width - clone.radius, clone.x));
                clone.y = Math.max(clone.radius, Math.min(this.canvas.height - clone.radius, clone.y));

                this.balls.push(clone);
            }
        } else if (powerUp.type === 'growPaddle') {
            const maxGrowth = 0.20; // 20% máximo
            const growthStep = 0.05; // 5% por power-up

            if (this.paddle.growthFactor < maxGrowth) {
                this.paddle.growthFactor = Math.min(
                    this.paddle.growthFactor + growthStep,
                    maxGrowth
                );
                this.paddle.isGrowing = true;
                this.paddle.growthAnimation = 0;
                
                // Efeito de partículas
                this.createPaddleGrowthEffect();
            }
        }
    }

    createPaddleGrowthEffect() {
        const numParticles = 15;
        for (let i = 0; i < numParticles; i++) {
            const x = this.paddle.x + Math.random() * this.paddle.width;
            const y = this.paddle.y + this.paddle.height / 2;
            
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 3,
                vy: -Math.random() * 2 - 1,
                life: 1,
                color: '#FFA500'
            });
        }
    }

    addNewLevel() {
        const timestamp = Date.now();
        this.gameState.level++;
        
        // Atualizar display e animação de nível
        document.getElementById('levelDisplay').textContent = `Level ${this.gameState.level}`;
        this.gameState.levelAnimation = {
            active: true,
            scale: 2,
            opacity: 0,
            startTime: timestamp
        };

        // Gerar novas linhas com quantidade aleatória de blocos
        const numNewRows = Math.floor(Math.random() * 3) + 2; // 2-4 novas linhas
        
        // Preparar blocos para animação
        this.droppingBricks = [];
        for (let i = 0; i < numNewRows; i++) {
            const numCols = Math.floor(Math.random() * 
                (this.brickSettings.cols - this.brickSettings.minCols + 1)) + 
                this.brickSettings.minCols;
            
            const positions = Array.from({length: this.brickSettings.cols}, (_, i) => i);
            this.shuffleArray(positions);
            const selectedPositions = positions.slice(0, numCols);
            
            for (let pos of selectedPositions) {
                const brick = this.createBrick(pos, -numNewRows + i);
                brick.targetY = brick.y + (numNewRows * (this.brickSettings.height + this.brickSettings.padding));
                brick.currentY = brick.y;
                brick.createdAt = timestamp;
                this.droppingBricks.push(brick);
            }
        }

        this.brickSettings.isDropping = true;
        this.brickSettings.dropDistance = 0;

        // Atualizar velocidade da bola
        const newSpeed = this.ball.speed * 1.01;
        if (newSpeed <= this.maxSpeedIncrease * 3) {
            this.ball.speed = newSpeed;
        }

        this.updateProgressMarker();
        
        // Notificar outros jogadores
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'levelUp',
                ballSpeed: this.ball.speed,
                level: this.gameState.level,
                droppingBricks: this.droppingBricks
            }));
        }
    }

    // Novo método para atualizar o marcador de progresso no DOM
    updateProgressMarker() {
        const progressMarker = document.getElementById('progressMarker');
        const currentLevel = this.gameState.level;
        const maxLevel = this.progressLine.maxLevel;
        
        // Calcular a porcentagem de progresso (de 0 a 100)
        const progressPercentage = Math.min(100, (currentLevel / maxLevel) * 100);
        
        // Definir a posição bottom do marcador (invertido: 0% no fundo, 100% no topo)
        progressMarker.style.bottom = `${progressPercentage}%`;
        
        // Adicionar efeito de brilho mais intenso para níveis mais altos
        const glowIntensity = 5 + (progressPercentage / 10);
        progressMarker.style.boxShadow = `0 0 ${glowIntensity}px rgba(255, 255, 255, 0.7)`;
    }

    addScore(points) {
        if (this.gameState.currentPlayer === 1) {
            this.gameState.player1Score += points;
        } else {
            this.gameState.player2Score += points;
        }
        this.gameState.totalScore += points;
        this.updateScoreDisplay();
    }

    updateScoreDisplay() {
        document.getElementById('score1').textContent = this.gameState.player1Score;
        document.getElementById('score2').textContent = this.gameState.player2Score;
        document.getElementById('totalScore').textContent = 
            `Total Score: ${this.gameState.totalScore}`;
        // Atualizar também o nível no HTML
        document.getElementById('levelDisplay').textContent = `Level ${this.gameState.level}`;
    }

    detectCollision(ball, rect) {
        return ball.x + ball.radius > rect.x &&
               ball.x - ball.radius < rect.x + rect.width &&
               ball.y + ball.radius > rect.y &&
               ball.y - ball.radius < rect.y + rect.height;
    }

    getBrickColor(strength) {
        // Color scheme based on strength levels
        if (strength === 1) {
            return '#0095DD'; // Original blue for strength 1
        } else if (strength <= 3) {
            return '#2ecc71'; // Green for low strength (2-3)
        } else if (strength <= 5) {
            return '#f1c40f'; // Yellow for medium strength (4-5)
        } else if (strength <= 7) {
            return '#e67e22'; // Orange for high strength (6-7)
        } else if (strength <= 9) {
            return '#e74c3c'; // Red for very high strength (8-9)
        } else {
            return '#9b59b6'; // Purple for maximum strength (10)
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
        // Validar as coordenadas do paddle
        const paddleX = isFinite(this.paddle.x) ? this.paddle.x : 0;
        const paddleY = isFinite(this.paddle.y) ? this.paddle.y : this.canvas.height - this.paddle.height;
        const paddleWidth = isFinite(this.paddle.baseWidth) ? this.paddle.baseWidth : 100;
    
        // Criar gradiente para o paddle
        const paddleGradient = this.ctx.createLinearGradient(
            paddleX,
            paddleY,
            paddleX,
            paddleY + this.paddle.height
        );
        paddleGradient.addColorStop(0, '#4169E1');
        paddleGradient.addColorStop(0.5, '#0095DD');
        paddleGradient.addColorStop(1, '#1E90FF');
    
        // Desenhar paddle
        this.ctx.beginPath();
        this.ctx.roundRect(paddleX, paddleY, paddleWidth, this.paddle.height, [10, 10, 5, 5]);
        this.ctx.fillStyle = paddleGradient;
        this.ctx.fill();
        this.ctx.closePath();

        // Adicionar borda brilhante
        this.ctx.strokeStyle = '#87CEEB';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        if (this.paddle.isGrowing) {
            const animationDuration = 500; // Duração da animação de crescimento em ms
            const animationProgress = Math.min(1, (Date.now() - this.paddle.growthAnimation) / animationDuration);
            const currentWidth = this.paddle.baseWidth * (1 + this.paddle.growthFactor * animationProgress);
            
            // Gradiente com ajuste para a nova largura
            const paddleGradient = this.ctx.createLinearGradient(
                this.paddle.x,
                this.paddle.y,
                this.paddle.x,
                this.paddle.y + this.paddle.height
            );
            paddleGradient.addColorStop(0, '#4169E1');
            paddleGradient.addColorStop(0.5, '#0095DD');
            paddleGradient.addColorStop(1, '#1E90FF');

            // Desenhar paddle com bordas arredondadas
            this.ctx.beginPath();
            this.ctx.roundRect(
                this.paddle.x,
                this.paddle.y,
                currentWidth,
                this.paddle.height,
                [10, 10, 5, 5]
            );
            this.ctx.fillStyle = paddleGradient;
            this.ctx.fill();
            this.ctx.closePath();

            // Adicionar borda brilhante
            this.ctx.strokeStyle = '#87CEEB';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Adicionar brilho durante a animação de crescimento
            const glow = this.ctx.createRadialGradient(
                this.paddle.x + currentWidth/2, this.paddle.y + this.paddle.height/2,
                0, this.paddle.x + currentWidth/2, this.paddle.y + this.paddle.height/2,
                currentWidth/2
            );
            glow.addColorStop(0, 'rgba(255, 165, 0, 0.3)');
            glow.addColorStop(1, 'rgba(255, 165, 0, 0)');
            this.ctx.fillStyle = glow;
            this.ctx.fillRect(
                this.paddle.x - 10, 
                this.paddle.y - 10,
                currentWidth + 20,
                this.paddle.height + 20
            );
        } else {
            const currentWidth = this.paddle.baseWidth * (1 + this.paddle.growthFactor);
            
            // Mesmo gradiente para estado normal
            const paddleGradient = this.ctx.createLinearGradient(
                this.paddle.x,
                this.paddle.y,
                this.paddle.x,
                this.paddle.y + this.paddle.height
            );
            paddleGradient.addColorStop(0, '#4169E1');
            paddleGradient.addColorStop(0.5, '#0095DD');
            paddleGradient.addColorStop(1, '#1E90FF');

            // Desenhar paddle com bordas arredondadas
            this.ctx.beginPath();
            this.ctx.roundRect(
                this.paddle.x,
                this.paddle.y,
                currentWidth,
                this.paddle.height,
                [10, 10, 5, 5]
            );
            this.ctx.fillStyle = paddleGradient;
            this.ctx.fill();
            this.ctx.closePath();

            // Adicionar borda brilhante
            this.ctx.strokeStyle = '#87CEEB';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }


        // Desenhar todas as bolas
        this.balls.forEach(ball => {
            this.ctx.beginPath();
            this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = ball.isOriginal ? '#0095DD' : '#00FF00';
            this.ctx.fill();
            this.ctx.closePath();
        });

        // Draw bricks with animation and hit effects
        this.bricks.forEach(brick => {
            const age = Date.now() - brick.createdAt;
            brick.opacity = Math.min(1, age / this.animationDuration);
            
            this.ctx.globalAlpha = brick.opacity;
            
            // Apply hit animation if brick was just hit
            if (brick.isHit) {
                const hitDuration = 200; // 200ms animation
                const timeSinceHit = Date.now() - brick.hitTime;
                
                if (timeSinceHit < hitDuration) {
                    const magnitude = Math.sin((timeSinceHit / hitDuration) * Math.PI * 4) * 2;
                    brick.x = brick.originalX + magnitude;
                    brick.y = brick.originalY + magnitude;
                } else {
                    brick.isHit = false;
                    brick.x = brick.originalX;
                    brick.y = brick.originalY;
                }
            }
            
            // Draw brick background with color based on strength
            this.ctx.fillStyle = this.getBrickColor(brick.strength);
            this.ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
            
            // Draw strength number with improved visibility
            if (brick.strength >= 1) {
                this.ctx.globalAlpha = 1;
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                this.ctx.shadowBlur = 2;
                this.ctx.font = 'bold 16px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                const centerX = brick.x + brick.width / 2;
                const centerY = brick.y + brick.height / 2;
                this.ctx.fillText(brick.strength, centerX, centerY);
                this.ctx.shadowBlur = 0;
            }
            
            // Draw border effect for hit bricks
            if (brick.isHit) {
                const timeSinceHit = Date.now() - brick.hitTime;
                const hitOpacity = Math.max(0, 1 - (timeSinceHit / 200));
                this.ctx.strokeStyle = `rgba(255, 255, 255, ${hitOpacity})`;
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
            }
        });

        // Reset global alpha for other drawings
        this.ctx.globalAlpha = 1;
        
        // Desenhar zona de perigo (atualizado)
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'; // Reduzido opacity de 0.2 para 0.1
        this.ctx.fillRect(0, this.brickSettings.dangerZone, 
                         this.canvas.width, this.canvas.height - this.brickSettings.dangerZone);
        
        // Adicionar linha tracejada na borda da danger zone
        this.ctx.beginPath();
        this.ctx.setLineDash([10, 5]); // Define o padrão da linha tracejada
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)'; // Vermelho mais forte para a linha
        this.ctx.lineWidth = 2;
        this.ctx.moveTo(0, this.brickSettings.dangerZone);
        this.ctx.lineTo(this.canvas.width, this.brickSettings.dangerZone);
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset o padrão da linha

        // Desenhar linha guia
        if (this.guideLine.isVisible) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.guideLine.points[0].x, this.guideLine.points[0].y);
            
            for (let i = 1; i < this.guideLine.points.length; i++) {
                this.ctx.lineTo(this.guideLine.points[i].x, this.guideLine.points[i].y);
            }
            
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.setLineDash([5, 5]); // Linha pontilhada
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.setLineDash([]); // Resetar estilo da linha
        }

        // Draw power-ups with distinct visuals
        this.powerUps.forEach(powerUp => {
            this.ctx.beginPath();
            this.ctx.arc(
                powerUp.x + powerUp.width/2,
                powerUp.y + powerUp.height/2,
                powerUp.width/2,
                0,
                Math.PI * 2
            );
            
            // Adicionar gradiente brilhante para power-ups
            const gradient = this.ctx.createRadialGradient(
                powerUp.x + powerUp.width/2,
                powerUp.y + powerUp.height/2,
                0,
                powerUp.x + powerUp.width/2,
                powerUp.y + powerUp.height/2,
                powerUp.width/2
            );
            gradient.addColorStop(0, powerUp.color);
            gradient.addColorStop(1, '#FFFFFF');
            
            this.ctx.fillStyle = gradient;
            this.ctx.fill();
            
            // Adicionar símbolo de acordo com o tipo
            this.ctx.beginPath();
            if (powerUp.type === 'growPaddle') {
                // Desenhar símbolo de seta expandindo
                this.ctx.moveTo(powerUp.x + 5, powerUp.y + powerUp.height/2);
                this.ctx.lineTo(powerUp.x + powerUp.width - 5, powerUp.y + powerUp.height/2);
                this.ctx.moveTo(powerUp.x + powerUp.width - 8, powerUp.y + powerUp.height/2 - 3);
                this.ctx.lineTo(powerUp.x + powerUp.width - 5, powerUp.y + powerUp.height/2);
                this.ctx.lineTo(powerUp.x + powerUp.width - 8, powerUp.y + powerUp.height/2 + 3);
            }
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });

        // Desenhar partículas
        this.particles.forEach((particle, index) => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.life -= 0.02;

            if (particle.life <= 0) {
                this.particles.splice(index, 1);
                return;
            }

            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255, 165, 0, ${particle.life})`;
            this.ctx.fill();
            this.ctx.closePath();
        });

        // Desenhar combo
        if (this.combo.active) {
            const now = Date.now();
            const deltaTime = (now - this.combo.lastUpdateTime) / 1000;
            this.combo.lastUpdateTime = now;

            // Atualizar escala e opacidade
            this.combo.scale = Math.max(1, this.combo.scale - deltaTime * 2);
            
            // Efeito de pulso suave
            const pulse = Math.sin(now * 0.01) * 0.1 + 1;

            this.ctx.save();
            this.ctx.textAlign = 'center';
            this.ctx.font = 'bold 32px Arial'; // Reduzido de 48px para 32px
            
            // Adicionar sombra e brilho
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = 'rgba(255, 255, 0, 0.5)';
            
            // Desenhar texto do combo com efeito de escala
            const scale = this.combo.scale * pulse;
            this.ctx.translate(this.canvas.width / 2, 100);
            this.ctx.scale(scale, scale);
            
            // Gradiente para o texto
            const gradient = this.ctx.createLinearGradient(0, -20, 0, 20);
            gradient.addColorStop(0, '#ffff00');
            gradient.addColorStop(1, '#ffa500');
            this.ctx.fillStyle = gradient;
            
            this.ctx.fillText(`Combo x${this.combo.count}`, 0, 0);
            
            this.ctx.restore();

            // Atualizar e desenhar partículas
            for (let i = this.combo.particles.length - 1; i >= 0; i--) {
                const p = this.combo.particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.life -= deltaTime;

                if (p.life <= 0) {
                    this.combo.particles.splice(i, 1);
                    continue;
                }

                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(255, 255, 0, ${p.life})`;
                this.ctx.fill();
            }
        }

        // Desenhar mensagem de game over
        if (this.gameState.isGameOver) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.font = '48px Arial';
            this.ctx.fillStyle = '#FF0000';
            this.ctx.textAlign = 'center';
            
            const message = this.gameState.gameOverReason === 'blocks' 
                ? 'Game Over! Os blocos atingiram a zona crítica!' 
                : 'Game Over!';
            
            this.ctx.fillText(message, this.canvas.width/2, this.canvas.height/2);
            this.ctx.font = '24px Arial';
            this.ctx.fillText(`Pontuação Final: ${this.gameState.totalScore}`, 
                            this.canvas.width/2, this.canvas.height/2 + 50);
        }
        
        // Animação de novo nível
        if (this.gameState.levelAnimation.active) {
            const animation = this.gameState.levelAnimation;
            const elapsed = (Date.now() - animation.startTime) / 1000; // Tempo em segundos
            
            // Duração total da animação: 2 segundos
            if (elapsed < 2) {
                // Calcular opacidade e escala
                animation.opacity = elapsed < 1 ? elapsed : 2 - elapsed;
                animation.scale = 1.5 + Math.sin(elapsed * Math.PI) * 0.5;
                
                // Desenhar texto animado
                this.ctx.save();
                this.ctx.textAlign = 'center';
                this.ctx.font = 'bold 48px Arial';
                
                // Adicionar sombra
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
                
                // Criar gradiente
                const gradient = this.ctx.createLinearGradient(
                    0, this.canvas.height/2 - 30,
                    0, this.canvas.height/2 + 30
                );
                gradient.addColorStop(0, '#FFF');
                gradient.addColorStop(1, '#4169E1');
                
                this.ctx.fillStyle = gradient;
                this.ctx.globalAlpha = animation.opacity;
                
                // Aplicar transformação de escala
                this.ctx.translate(this.canvas.width/2, this.canvas.height/2);
                this.ctx.scale(animation.scale, animation.scale);
                this.ctx.fillText(`Level ${this.gameState.level}!`, 0, 0);
                
                this.ctx.restore();
            } else {
                this.gameState.levelAnimation.active = false;
            }
        }

        // Adicionar indicador visual do ângulo quando estiver mirando
        if (this.ballDirection.isAiming && this.guideLine.isVisible) {
            const mainBall = this.balls.find(ball => ball.isOriginal);
            if (mainBall) {
                this.ctx.beginPath();
                this.ctx.arc(mainBall.x, mainBall.y, 30, -Math.PI, 0, true);
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                this.ctx.setLineDash([5, 5]);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
        }

        // Desenhar blocos em queda
        if (this.brickSettings.isDropping) {
            this.droppingBricks.forEach(brick => {
                const age = Date.now() - brick.createdAt;
                brick.opacity = Math.min(1, age / this.animationDuration);
                
                this.ctx.globalAlpha = brick.opacity;
                this.ctx.fillStyle = brick.strength > 1 ? '#FF0000' : '#0095DD';
                this.ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
            });
        }

        // Desenhar armas no paddle quando ativas
        if (this.gunsActive) {
            this.ctx.fillStyle = '#FF0000';
            // Arma esquerda
            this.ctx.fillRect(this.paddle.x + 5, this.paddle.y - 5, 10, 5);
            // Arma direita
            this.ctx.fillRect(this.paddle.x + this.paddle.width - 15, this.paddle.y - 5, 10, 5);
        }

        // Desenhar projéteis
        this.ctx.fillStyle = '#FF0000';
        this.projectiles.forEach(proj => {
            this.ctx.beginPath();
            this.ctx.arc(proj.x, proj.y, this.projectileSize, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // Reset global alpha
        this.ctx.globalAlpha = 1;
    }

    updateCombo() {
        this.combo.count++;
        this.combo.active = true;
        this.combo.scale = 1.5; // Iniciar animação de escala
        this.combo.opacity = 1;
        this.combo.lastUpdateTime = Date.now();
        
        // Tocar som de hit
        try {
            const hitSound = this.combo.sounds.hit;
            if (hitSound) {
                hitSound.currentTime = 0;
                hitSound.play().catch(e => console.log('Audio play failed:', e));
            }
        } catch (e) {
            console.log('Audio error:', e);
        }

        // Verificar milestones
        if (this.combo.milestones.includes(this.combo.count)) {
            this.createComboEffect();
            try {
                const milestoneSound = this.combo.sounds.milestone;
                if (milestoneSound) {
                    milestoneSound.currentTime = 0;
                    milestoneSound.play().catch(e => console.log('Audio play failed:', e));
                }
            } catch (e) {
                console.log('Audio error:', e);
            }
        }

        // Criar partículas
        const numParticles = this.combo.count >= 10 ? 10 : 5;
        for (let i = 0; i < numParticles; i++) {
            this.combo.particles.push({
                x: this.canvas.width / 2,
                y: 100,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1
            });
        }
    }

    createComboEffect() {
        // Criar flash na tela
        const flash = document.createElement('div');
        flash.style.position = 'absolute';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
        flash.style.pointerEvents = 'none';
        flash.style.transition = 'opacity 0.3s';
        document.querySelector('.game-container').appendChild(flash);
        
        // Remover o flash após a animação
        setTimeout(() => flash.remove(), 300);

        // Criar explosão de partículas
        const numParticles = 20;
        const centerX = this.canvas.width / 2;
        const centerY = 100; // Posição do texto do combo

        for (let i = 0; i < numParticles; i++) {
            const angle = (Math.PI * 2 * i) / numParticles;
            const speed = 5 + Math.random() * 5;
            
            this.combo.particles.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.5,
                size: 3 + Math.random() * 3,
                color: Math.random() > 0.5 ? '#ffff00' : '#ffa500'
            });
        }
    }

    endCombo() {
        if (this.combo.count > 0) {
            // Adicionar pontuação do combo
            const comboBonus = this.combo.count * 100;
            this.gameState.totalScore += comboBonus;
            
            // Atualizar display e enviar update imediato dos scores
            this.updateScoreDisplay();
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'gameUpdate',
                    scores: {
                        player1Score: this.gameState.player1Score,
                        player2Score: this.gameState.player2Score,
                        totalScore: this.gameState.totalScore
                    }
                }));
            }

            // Tocar som de fim de combo
            try {
                const endSound = this.combo.sounds.end;
                if (endSound) {
                    endSound.currentTime = 0;
                    endSound.play().catch(e => console.log('Audio play failed:', e));
                }
            } catch (e) {
                console.log('Audio error:', e);
            }

            // Criar efeito final
            for (let i = 0; i < 20; i++) {
                this.combo.particles.push({
                    x: this.canvas.width / 2,
                    y: 100,
                    vx: (Math.random() - 0.5) * 15,
                    vy: (Math.random() - 0.5) * 15,
                    life: 1.5
                });
            }

            // Resetar combo
            this.combo.count = 0;
            this.combo.active = false;
        }
    }
}

// Start the game when the page loads
window.onload = () => {
    new CoopBrickBreaker();
};
