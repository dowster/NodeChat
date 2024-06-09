var net = require('net');
const EventEmitter = require('node:events');
const fs = require('node:fs');

const emitter = new EventEmitter();

const nickCache = {};

const ESCAPE_CODES = {
    black: '\u001b[30m',
    red: '\u001b[31m',
    green: '\u001b[32m',
    yellow: '\u001b[33m',
    blue: '\u001b[34m',
    magenta: '\u001b[35m',
    cyan: '\u001b[36m',
    white: '\u001b[37m',
    reset: '\u001b[0m',
    bg_black: '\u001b[40m',
    bg_red: '\u001b[41m',
    bg_green: '\u001b[42m',
    bg_yellow: '\u001b[43m',
    bg_blue: '\u001b[44m',
    bg_magenta: '\u001b[45m',
    bg_cyan: '\u001b[46m',
    bg_white: '\u001b[47m',
    bold: '\u001b[1m',
    underline: '\u001b[4m',
};

const EC = {}; 

Object.keys(ESCAPE_CODES).forEach((colorName) => {
    EC[colorName] = (text) => { return ESCAPE_CODES[colorName] + text + ESCAPE_CODES.reset; }
});

EC.rainbow = (text) => {
    const rainbow = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
    let output = '';
    for (let i = 0; i < text.length; i++) {
        output += EC[rainbow[i % rainbow.length]](text[i]);
    }
    return output;
};

try {
    if(fs.existsSync('nicknames.json')) {
        const data = fs.readFileSync('nicknames.json');
        const json = JSON.parse(data);
        Object.keys(json).forEach((key) => {
            nickCache[key] = json[key];
        });
        console.log(EC.green(`${Object.keys(json).length} Nicknames loaded from file`));
    } else {
        console.log(EC.yellow('No nicknames file found, starting fresh'));
    }
} catch (err) {
    console.log(EC.red(`Error loading nicknames:`));
    console.error(err);
}

const commands = {
    'nick': (context, _, ...nick) => {
        if (nick && nick.length > 0 && nick.join(' ') !== '') {
            const newNick = nick.join(' ');
            emitter.emit(context.room, `${context.nick} is now ${newNick}!`);
            context.nick = newNick.trim();
            nickCache[context.socket.remoteAddress] = context.nick;
            fs.writeFileSync('nicknames.json', JSON.stringify(nickCache));
            context.socket.write(`Nickname set, welcome ${context.nick}\r\n`);
        } else {
            context.socket.write(EC.red('Invalid nickname\r\n'));
        }
    },
    'hostip': (context) => {
        fetch('https://myip.wtf/text').then(response => response.text()).then(text => {
            context.writer(`server ip is ${text}`);
        });
    },
    'join': (context, _, room) => {
        if (room && room !== '') {
            emitter.emit(context.room, `${context.nick} has left the room, catch them over in ${room}!`);
            emitter.removeListener(context.room, context.writer);
            context.room = room.trim();
            emitter.on(context.room, context.writer);
            emitter.emit(context.room, `${context.nick} has joined the room`);
        } else {
            context.socket.write('Invalid channel name\r\nFor a list of channels type /list\r\n');
        }
    },
    'list': (context) => {
        context.socket.write('Channels:\r\n');
        emitter.eventNames().forEach(key => {
            context.socket.write(key + '\r\n');
        });
    },
    'color': (context, _, colorArg) => {
        if (colorArg && EC[colorArg]) {
            context.color = colorArg;
            context.socket.write(`Color set to ${EC[context.color](context.color)}\r\n`);
        } else {
            context.socket.write('Invalid color, choose from:\r\n');
            Object.keys(EC).forEach((name) => {
                context.socket.write(`- ${EC[name](name)}\r\n`);
            });
        }
    }
};

console.log(EC.green('Chat server started'));

var server = net.createServer(async function (socket) {
    
    let buffer = '';
    console.log(`Client connected: ${JSON.stringify(socket.remoteAddress)}`)
    const context = {
        room: 'main',
        nick: ``,
        socket: socket,
        writer: (message) => {},
        color: 'reset'
    };

    if (nickCache[socket.remoteAddress]) {
        context.nick = nickCache[socket.remoteAddress];
    } else {
        const result = await fetch("https://randomuser.me/api/");
        const jsonResult = await result.json();

        context.nick = jsonResult.results[0].login.username;
        nickCache[socket.remoteAddress] = context.nick;
        fs.writeFileSync('nicknames.json', JSON.stringify(nickCache));
    }

    context.writer = (message) => {
        socket.write('\r\u001b[0K' + EC.green(context.room) + ': ' + message + '\r\n\u0007' + buffer);
    }

    emitter.on(context.room, context.writer);
    
    socket.on('data', function (data) {
        const dataString = data.toString();
        if(dataString.indexOf('\n') === -1) {
            buffer += dataString;
            return;
        } else {
            buffer += dataString;
            if (buffer.endsWith('\n')) {
                let tempBuffer = buffer;
                buffer = '';
                for (part of tempBuffer.split('\n')) {
                    if (part === '') {
                        continue;
                    } else if (part.startsWith('/')) {
                        const parts = part.split(' ').map((part) => part.trim());
                        const command = parts[0].substring(1);

                        if (commands[command] && typeof commands[command] === 'function') {
                            commands[command](context, ...parts);
                        } else {
                            socket.write(`${EC.red('Invalid command!')} Maybe try one of these?\r\n`);

                            Object.keys(commands).forEach((command) => {
                                socket.write(`- ${EC.yellow('/' + command)}\r\n`);
                            });
                        }
                    } else {
                        emitter.emit(context.room, EC[context.color](`${context.nick}: ${part}`));
                    }
                }
            }
        }
    });

    socket.on('close', function () {
        console.log(`Client disconnected: ${JSON.stringify(socket.remoteAddress)}`)
        emitter.emit(context.room, `${context.nick} has left the chat`);
        emitter.removeListener(context.room, context.writer);
    });

    emitter.emit(context.room, `${context.nick} has joined the chat`);
});
server.listen(3000, '0.0.0.0');