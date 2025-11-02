/**
 * BlockCraft Adventure 2.0 - Main Game Controller
 * The ultimate block building experience
 */

// Game state
const GameState = {
    LOADING: 'loading',
    MENU: 'menu',
    SINGLE_PLAYER: 'single_player',
    MULTIPLAYER: 'multiplayer',
    PAUSED: 'paused'
};

// Game configuration
const GameConfig = {
    version: '2.0.0',
    worldSize: {
        width: 10000,
        height: 10000,
        depth: 256
    },
    chunkSize: 16,
    renderDistance: 10,
    maxFPS: 120,
    physics: {
        gravity: -9.81,
        friction: 0.1,
        airResistance: 0.02
    },
    performance: {
        chunkThreads: 4,
        maxEntities: 1000,
        maxParticles: 500
    }
};

// Main game class
class BlockCraftAdventure {
    constructor() {
        this.state = GameState.LOADING;
        this.canvas = null;
        this.renderer = null;
        this.world = null;
        this.player = null;
        this.ui = null;
        this.audio = null;
        this.settings = null;
        this.multiplayer = null;
        this.workers = {};
        this.lastTime = 0;
        this.frameCount = 0;
        this.fps = 0;
        this.fpsUpdateTime = 0;
        this.isInitialized = false;
        
        // Initialize the game
        this.init();
    }
    
    async init() {
        try {
            // Show loading screen
            this.showLoadingScreen();
            
            // Initialize settings
            this.settings = new SettingsManager();
            await this.settings.load();
            
            // Initialize audio
            this.audio = new AudioManager(this.settings);
            
            // Initialize UI
            this.ui = new UIManager(this);
            
            // Initialize multiplayer
            this.multiplayer = new MultiplayerManager(this);
            
            // Initialize workers
            this.initWorkers();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Hide loading screen and show main menu
            setTimeout(() => {
                this.hideLoadingScreen();
                this.setState(GameState.MENU);
                this.ui.showMainMenu();
            }, 2000);
            
            this.isInitialized = true;
            console.log(`BlockCraft Adventure ${GameConfig.version} initialized successfully`);
        } catch (error) {
            console.error('Failed to initialize game:', error);
            this.showError('Failed to initialize game. Please refresh the page.');
        }
    }
    
    showLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.add('active');
        
        // Simulate loading progress
        const progressFill = document.querySelector('.progress-fill');
        let progress = 0;
        const loadingInterval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress >= 100) {
                progress = 100;
                clearInterval(loadingInterval);
            }
            progressFill.style.width = `${progress}%`;
        }, 200);
    }
    
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        loadingScreen.classList.remove('active');
    }
    
    initWorkers() {
        // Initialize world generator worker
        this.workers.worldGenerator = new Worker('js/workers/world-generator.js');
        this.workers.worldGenerator.onmessage = (e) => {
            if (e.data.type === 'chunkGenerated') {
                this.world.receiveChunk(e.data.chunk);
            }
        };
        
        // Initialize physics worker
        this.workers.physics = new Worker('js/workers/physics-worker.js');
        this.workers.physics.onmessage = (e) => {
            if (e.data.type === 'physicsUpdate') {
                this.world.receivePhysicsUpdate(e.data.update);
            }
        };
        
        // Initialize pathfinding worker
        this.workers.pathfinding = new Worker('js/workers/pathfinding.js');
        this.workers.pathfinding.onmessage = (e) => {
            if (e.data.type === 'pathFound') {
                this.world.receivePath(e.data.path);
            }
        };
    }
    
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => this.handleResize());
        
        // Before unload
        window.addEventListener('beforeunload', (e) => {
            if (this.state === GameState.SINGLE_PLAYER || this.state === GameState.MULTIPLAYER) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
        
        // Error handling
        window.addEventListener('error', (e) => {
            console.error('Game error:', e.error);
            this.showError('An error occurred. Please refresh the page.');
        });
        
        // Setup UI event listeners
        this.ui.setupEventListeners();
    }
    
    handleResize() {
        if (this.renderer) {
            this.renderer.resize();
        }
    }
    
    setState(newState) {
        const prevState = this.state;
        this.state = newState;
        
        // Handle state transitions
        switch (newState) {
            case GameState.SINGLE_PLAYER:
                this.startSinglePlayer();
                break;
            case GameState.MULTIPLAYER:
                this.startMultiplayer();
                break;
            case GameState.PAUSED:
                this.pauseGame();
                break;
            case GameState.MENU:
                this.returnToMenu();
                break;
        }
        
        console.log(`Game state changed from ${prevState} to ${newState}`);
    }
    
    async startSinglePlayer(worldName = null, worldSeed = null, worldType = 'default') {
        try {
            // Initialize renderer
            this.canvas = document.getElementById('game-canvas');
            this.renderer = new Renderer(this.canvas, this.settings);
            
            // Initialize world
            this.world = new World(
                GameConfig.worldSize,
                GameConfig.chunkSize,
                worldSeed,
                worldType,
                this.workers.worldGenerator
            );
            
            // Initialize player
            const spawnPoint = this.world.getSpawnPoint();
            this.player = new Player(spawnPoint.x, spawnPoint.y, spawnPoint.z, this.settings);
            
            // Connect world and player
            this.world.setPlayer(this.player);
            
            // Start game loop
            this.lastTime = performance.now();
            this.gameLoop();
            
            // Play background music
            this.audio.playMusic('game');
            
            // Show game screen
            document.getElementById('game-screen').classList.remove('hidden');
            
            // Show mobile controls if on mobile
            if (this.isMobile()) {
                document.getElementById('mobile-controls').classList.remove('hidden');
            }
            
            console.log(`Single player game started in world: ${worldName || 'New World'}`);
        } catch (error) {
            console.error('Failed to start single player game:', error);
            this.showError('Failed to start game. Please try again.');
            this.setState(GameState.MENU);
        }
    }
    
    async startMultiplayer(serverAddress = null) {
        try {
            // Initialize renderer
            this.canvas = document.getElementById('game-canvas');
            this.renderer = new Renderer(this.canvas, this.settings);
            
            // Connect to server
            await this.multiplayer.connect(serverAddress);
            
            // Initialize player
            const spawnPoint = this.multiplayer.getSpawnPoint();
            this.player = new Player(spawnPoint.x, spawnPoint.y, spawnPoint.z, this.settings);
            
            // Initialize world (will be populated by server)
            this.world = new World(
                GameConfig.worldSize,
                GameConfig.chunkSize,
                null,
                'multiplayer',
                this.workers.worldGenerator
            );
            
            // Connect world and player
            this.world.setPlayer(this.player);
            this.world.setMultiplayer(this.multiplayer);
            
            // Start game loop
            this.lastTime = performance.now();
            this.gameLoop();
            
            // Play background music
            this.audio.playMusic('game');
            
            // Show game screen
            document.getElementById('game-screen').classList.remove('hidden');
            
            // Show mobile controls if on mobile
            if (this.isMobile()) {
                document.getElementById('mobile-controls').classList.remove('hidden');
            }
            
            console.log(`Multiplayer game started on server: ${serverAddress || 'Default Server'}`);
        } catch (error) {
            console.error('Failed to start multiplayer game:', error);
            this.showError('Failed to connect to server. Please try again.');
            this.setState(GameState.MENU);
        }
    }
    
    pauseGame() {
        // Show pause menu
        this.ui.showPauseMenu();
        
        // Pause audio
        this.audio.pauseMusic();
        
        console.log('Game paused');
    }
    
    resumeGame() {
        // Hide pause menu
        this.ui.hidePauseMenu();
        
        // Resume audio
        this.audio.resumeMusic();
        
        // Resume game loop
        this.lastTime = performance.now();
        this.gameLoop();
        
        console.log('Game resumed');
    }
    
    returnToMenu() {
        // Stop game loop
        this.isGameRunning = false;
        
        // Hide game screen
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('mobile-controls').classList.add('hidden');
        
        // Stop audio
        this.audio.stopMusic();
        
        // Dispose renderer
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
        
        // Dispose world
        if (this.world) {
            this.world.dispose();
            this.world = null;
        }
        
        // Disconnect from multiplayer
        if (this.multiplayer) {
            this.multiplayer.disconnect();
        }
        
        // Show main menu
        this.ui.showMainMenu();
        
        console.log('Returned to main menu');
    }
    
    gameLoop() {
        if (!this.isGameRunning) {
            this.isGameRunning = true;
        }
        
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        // Update FPS counter
        this.frameCount++;
        if (currentTime - this.fpsUpdateTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.fpsUpdateTime = currentTime;
            
            // Update FPS display if enabled
            if (this.settings.get('showFPS')) {
                this.ui.updateFPS(this.fps);
            }
        }
        
        // Update game components
        if (this.world) {
            this.world.update(deltaTime);
        }
        
        if (this.player) {
            this.player.update(deltaTime, this.world);
        }
        
        if (this.renderer) {
            this.renderer.render(this.world, this.player, currentTime / 1000);
        }
        
        if (this.ui) {
            this.ui.update(this.player, this.world);
        }
        
        // Continue game loop
        if (this.isGameRunning) {
            requestAnimationFrame(() => this.gameLoop());
        }
    }
    
    saveGame() {
        if (this.world && this.player) {
            const saveData = {
                world: this.world.save(),
                player: this.player.save(),
                settings: this.settings.save(),
                timestamp: Date.now()
            };
            
            // Save to IndexedDB
            StorageManager.saveGame(saveData)
                .then(() => {
                    this.ui.showMessage('Game saved successfully!');
                })
                .catch(error => {
                    console.error('Failed to save game:', error);
                    this.ui.showError('Failed to save game.');
                });
        }
    }
    
    loadGame(saveId) {
        StorageManager.loadGame(saveId)
            .then(saveData => {
                if (saveData) {
                    // Load settings
                    this.settings.load(saveData.settings);
                    
                    // Start game with saved data
                    this.startSinglePlayer(saveData.world.name, saveData.world.seed, saveData.world.type);
                    
                    // Load player data
                    this.player.load(saveData.player);
                    
                    // Load world data
                    this.world.load(saveData.world);
                    
                    this.ui.showMessage('Game loaded successfully!');
                } else {
                    this.ui.showError('Save file not found.');
                }
            })
            .catch(error => {
                console.error('Failed to load game:', error);
                this.ui.showError('Failed to load game.');
            });
    }
    
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    showError(message) {
        this.ui.showError(message);
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.game = new BlockCraftAdventure();
});
