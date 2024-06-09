var net = require('net');
var redis = require('redis');

var redisConnection = redis.createClient();
redisConnection.connect();

(function initScribe() {
    const localConnection = redisConnection.duplicate();

    localConnection.connect();

    localConnection.pSubscribe('*', function (message, channel) {
        redisConnection.RPUSH(channel, message);
    });
})();

var server = net.createServer(function (socket) {
    console.log(`Client connected: ${JSON.stringify(socket.remoteAddress)}`)
    let room = 'main_chat_room';
    const localConnection = redisConnection.duplicate();

    localConnection.connect();

    const messageWriter = (message, channel) => {
        socket.write(channel + ': ' + message + '\r\n');
    }

    localConnection.subscribe(room,messageWriter);

    redisConnection.LRANGE(room, -15, -1).then((messages) => {
            messages.forEach(message => {
                socket.write('main_chat_room: ' + message + '\r\n');
            });
        });

    socket.on('error', function (err) {
        console.error(`Error: ${err}`)
    });
    
    let buffer = '';
    let nick = `${socket.remoteAddress}`;
    socket.on('data', function (data) {
        const dataString = data.toString();
        if(dataString.indexOf('\n') === -1) {
            buffer += dataString;
            return;
        } else {
            buffer += dataString;
            if (buffer.endsWith('\n')) {
                for (part of buffer.split('\n')) {
                    if (part === '') {
                        continue;
                    } else if (part.startsWith('/nick')) {
                        if (part.split(' ').length > 1) {
                            nick = part.split(' ')[1].trim();
                            socket.write(`Nickname set, welcome ${nick}\r\n`);
                        }  else {
                            nick = '';
                            socket.write("Nickname cleared.\r\n");
                        }
                    } else if (part.startsWith('/hostip')) {
                        fetch('https://myip.wtf/text').then(response => response.text()).then(text => {
                            redisConnection.publish(room, `server ip is ${text}`);
                        });
                    } else if (part.startsWith('/join')) {
                        if (part.split(' ').length == 2) {
                            localConnection.unsubscribe(room);
                            room = part.split(' ')[1].trim();
                            localConnection.subscribe(room, messageWriter);
                        } else {
                            socket.write('Invalid channel name\r\nFor a list of channels type /list\r\n');
                        }
                    } else if (part.startsWith('/list')) {
                        redisConnection.KEYS('*').then((keys) => {
                            socket.write('Channels:\r\n');
                            keys.forEach(key => {
                                socket.write(key + '\r\n');
                            });
                        });
                    } else {
                        redisConnection.publish(room, `${nick}: ${part}`);
                    }
                }
                buffer = '';
            }
        }
    });

    redisConnection.publish(room, `${nick} has joined the chat`);
});
server.listen(3000);