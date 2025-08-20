const axios = require('axios');
const WebSocket = require('ws');
const readline = require('readline');
const blessed = require('blessed');

//process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.on('SIGINT', () => {
  console.log('\nExiting...');
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit();
});
const API_BASE = 'https://trans.ella-peeters.me';
const WS_URL = 'wss://trans.ella-peeters.me/ws';

let cookieHeader = null;
let paddleNumber = null;
let started = false;
let gameOver = false;
let keyInt = null;
let socket = null;
let gameOverMessage = '';
const WIDTH = 50;
const HEIGHT = 25;

//Show prompt for login info
async function promptCredentials() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (q) => new Promise(resolve => rl.question(q, resolve));
  const email = await question('Email: ');
  rl.close();

  return new Promise((resolve) => {
    let password = '';
    process.stdout.write('Password: ');
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onData = (charBuffer) => {
      const char = charBuffer.toString();

      if (char === '\r' || char === '\n') {
        process.stdout.write('\n');
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        resolve({ email, password });
      } else if (char === '\u0003') { // Ctrl+C
        process.exit();
      } else if (char === '\u0008' || char === '\u007f') {
        password = password.slice(0, -1); // backspace
      } else {
        password += char;
      }
    };

    process.stdin.on('data', onData);
  });
}

function createBox() {
  return (blessed.box({
    top: 'center',
    left: 'center',
    width: WIDTH + 2,
    height: HEIGHT + 6,
    tags: true,
    border: { type: 'line' },
    style: { fg: 'blue', bg: 'black', border: { bg: 'magenta', fg: 'magenta' } }
  }));
}

function createScreen() {
  return (blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    forceUnicode: true,
    title: 'CLI Pong'
  }));
}

// access the login api endpoint
async function login(email, password) {
  const res = await axios.post(`${API_BASE}/api/login`, {
    email,
    password
  });

  const setCookie = res.headers['set-cookie'];
  if (!setCookie) throw new Error("No cookie received");
  if (!setCookie[0]) throw new Error("Invalid cookie received");
  cookieHeader = setCookie[0];
  console.log("Logged in successfully");
}

// connect to WebSocket and start game
function connect() {
  return new Promise((resolve) => {
    let screen = null;
    let gameBox = null;
    socket = new WebSocket(WS_URL, {
      headers: {
        Cookie: cookieHeader
      }
    });

    socket.on('open', () => {
      console.log('Connected - joining game...');
      socket.send(JSON.stringify({ type: 'auto_join' }));
    });

    socket.on('message', async (data) => {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case 'joined':
          paddleNumber = msg.paddleNumber;
          console.log(`Joined room ${msg.roomId} as Player ${paddleNumber}`);
          break;
        case 'waiting_ready':
          socket.send(JSON.stringify({ type: 'ready', roomId: msg.roomId }));
          break;
        case 'ready_ack':
          console.log('Ready. Waiting for game start...');
          break;
        case 'game_start':
          screen = createScreen();
          gameBox = createBox();
      
          screen.append(gameBox);
          screen.render();
          setupKeypress(screen);
          started = true;
          gameOver = false;
          keyInt = setInterval(handleInput, 1000 / 30);
          break;
        case 'game_tick':
          draw(msg.state, screen, gameBox);
          break;
        case 'game_over':
          started = false;
          gameOver = true;
          gameOverMessage = `Game Over! Winner: ${msg.winner.name}`;
          break;
        case 'room_closed':
          console.log(`Room closed: ${msg.reason}`);
          break;
        case 'reconnected':
          paddleNumber = msg.paddleNumber;
          console.log(`Reconnected to room ${msg.roomId}`);
          started = true;
          gameOver = false;
          if (!screen) {
            screen = createScreen();
          }
          if (!gameBox) {
            gameBox = createBox();
          }
          if (!keyInt) {
            keyInt = setInterval(handleInput, 1000 / 30);
          } 
          screen.append(gameBox);
          setupKeypress(screen);
          screen.render();
          break;
      }
    });

    socket.on('close', () => {
      clearInterval(keyInt);
      console.log("Disconnected from server");
      resolve(screen);
    });
  });
}

// key listener during the game
const keyPressed = {
  up: false,
  down: false,
  timeout_up: null,
  timeout_down: null,
};

function setupKeypress(screen) {
  screen.key(['up', 'w'], () => {
    keyPressed.up = true;
    clearTimeout(keyPressed.timeout_up);
    keyPressed.timeout_up = setTimeout(() => keyPressed.up = false, 100);
  });

  screen.key(['down', 's'], () => {
    keyPressed.down = true;
    clearTimeout(keyPressed.timeout_down);
    keyPressed.timeout_down = setTimeout(() => keyPressed.down = false, 100);
  });

  screen.key(['C-c'], () => {
    screen.destroy();
    clearInterval(keyInt);
    keyInt = null;
    process.exit();
  });
}

// send movement to WS
function handleInput() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!started || gameOver) return;
  if (keyPressed['up']) {
    socket.send(JSON.stringify({ type: 'move', direction: 'up' }));
  }
  if (keyPressed['down']) {
    socket.send(JSON.stringify({ type: 'move', direction: 'down' }));
  }
}

function draw(state, screen, gameBox) {
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(' '));

  const ballX = Math.floor(state.ballX / 500 * WIDTH);
  const ballY = Math.floor(state.ballY / 500 * HEIGHT);
  const paddle1Y = Math.floor(state.paddle1.y / 500 * HEIGHT);
  const paddle2Y = Math.floor(state.paddle2.y / 500 * HEIGHT);
  const paddle1H = Math.floor(state.paddle1.height / 500 * HEIGHT);
  const paddle2H = Math.floor(state.paddle2.height / 500 * HEIGHT);

  // Middle line
  for (let y = 0; y < HEIGHT; y++) {
    if (y % 2 != 0) {
      grid[y][Math.floor(WIDTH / 2)] = '{magenta-fg}■{/magenta-fg}';
    }
  }
  
  // Ball
  if (ballY >= 0 && ballY < HEIGHT && ballX >= 0 && ballX < (WIDTH - 1)) { //width - 1 because ⬤ needs space of two columns
    grid[ballY][ballX] = '{cyan-fg}⬤{/cyan-fg}';
  }

  // Left Paddle
  for (let y = paddle1Y; y < paddle1Y + paddle1H; y++) {
    if (y >= 0 && y < HEIGHT) grid[y][1] = '{cyan-fg}█{/cyan-fg}';
  }

  // Right Paddle
  for (let y = paddle2Y; y < paddle2Y + paddle2H; y++) {
    if (y >= 0 && y < HEIGHT) grid[y][WIDTH - 2] = '{cyan-fg}█{/cyan-fg}';
  }

  let border = '\n{magenta-fg}';
  for (let x = 0; x < WIDTH; x++) {
    border = border + '▀';
  }
  border = border + '{/magenta-fg}';

  const rendered = grid.map(row => row.join('')).join('\n');
  gameBox.setContent(rendered + border + `\n{magenta-fg}{bold}Score: ${state.player1Score} - ${state.player2Score}\nGame started! You are Player ${paddleNumber}\nUse Arrow keys or W/S to move.
{/bold}{/magenta-fg}`);
  screen.render();
}

// Prompt asking restart when game ends
function promptRestart(screen) {
  if (!screen) {
    console.error("Unable to start a game");
    return new Promise((resolve) => {
      console.log("\nPress [Enter] to start a new game or [q] to quit.");
      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) process.stdin.setRawMode(true);
      const onKey = (str, key) => {
        if (key.ctrl && key.name === 'c') process.exit();
        if (key.name === 'return') {
          process.stdin.removeListener('keypress', onKey);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve('restart');
        } else if (str === 'q') {
          process.stdin.removeListener('keypress', onKey);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          resolve('quit');
        }
      };
      process.stdin.on('keypress', onKey);
    });
  }
  else {
    return new Promise((resolve) => {
      let content;
      if (gameOverMessage) {
        content = gameOverMessage + '\nPress [Enter] to start a new game or [q] to quit.';
        gameOverMessage = '';
      }
      else {
        content = 'Disconnected.\nPress [Enter] to restart or [q] to quit.';
      }
      const message = blessed.box({
        top: 'center',
        left: 'center',
        width: WIDTH + 2,
        height: 5,
        content: content,
        border: { type: 'line' },
        style: { fg: 'blue' , bg: 'white', border: { fg: 'blue' , bg: 'white'} }
      });

      screen.append(message);
      screen.render();
      screen.once(['key return'], () => {
        screen.destroy();
        clearInterval(keyInt);
        keyInt = null;
        resolve('restart');
      });
      screen.once(['key q'], () => {
        screen.destroy();
        clearInterval(keyInt);
        keyInt = null;
        resolve('quit');
      });
    });
  }
}

async function logout() {
  try {
    await axios.post(`${API_BASE}/api/logout`, {
      headers: {
        Cookie: cookieHeader
      }
    });
    console.log('Logged out successfully.');
  } catch (err) {
    console.error('Logout failed:', err.message);
  }
}

// entry point
async function startCLI() {
  while (true) {
    const { email, password } = await promptCredentials();

    try {
      await login(email, password);
      break;
    } catch (err) {
      console.error("Login failed:", err.message);
      console.log("Please try again.\n");
    }
  }

  while (true) {
    let screen = await connect();
    const action = await promptRestart(screen);
    if (action === 'quit') {
      await logout();
      console.log("Quit.\n");
      process.exit(0);
    }
  }
}

startCLI();