const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public')); // Serve static files like HTML, CSS, etc.

const rooms = {}; // Store rooms and their data

// Serve the homepage with the room joining/creating form
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Serve the /chat page
app.get('/chat', (req, res) => {
    res.sendFile(__dirname + '/public/chat.html');
});

// Socket.io connection logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinRoom', ({ roomCode, nickname, isPublic }, callback) => {
        // Check if the nickname is already taken in the room
        if (rooms[roomCode] && rooms[roomCode].users.includes(nickname)) {
            return callback(true); // Nickname taken
        }

        // Add the user to the room
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                users: [],
                messages: [],
                isPublic: isPublic || false,
            };
        }

        rooms[roomCode].users.push(nickname);
        socket.nickname = nickname;
        socket.join(roomCode);

        // Send the chat history to the new user
        socket.emit('chatHistory', rooms[roomCode].messages);

        // Broadcast a welcome message
        io.to(roomCode).emit('chatMessage', {
            nickname: 'System',
            message: `${nickname} has joined the room!`,
        });

        callback(false); // Success
    });

    // Handle new chat messages
    socket.on('chatMessage', ({ roomCode, message }) => {
        if (!rooms[roomCode]) return; // Ignore if room doesn't exist

        const fullMessage = `[${socket.nickname}]: ${message}`;
        rooms[roomCode].messages.push(fullMessage);

        // Broadcast the message to everyone in the room
        io.to(roomCode).emit('chatMessage', { nickname: socket.nickname, message });
    });

    // Handle disconnects
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        // Remove user from their room
        for (const roomCode in rooms) {
            if (rooms[roomCode].users.includes(socket.nickname)) {
                rooms[roomCode].users = rooms[roomCode].users.filter(user => user !== socket.nickname);
                io.to(roomCode).emit('chatMessage', {
                    nickname: 'System',
                    message: `${socket.nickname} has left the room.`,
                });
                break;
            }
        }
    });
});

// Start the server
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
