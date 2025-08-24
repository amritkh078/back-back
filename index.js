const { Server } = require("socket.io");

const io = new Server(8000, {
  cors: true,
});

// Queues for random matching
const queues = {
  video: new Set(),
  text: new Set(),
};

const partners = new Map(); // who is paired with who

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // User requests a partner
  socket.on("find:partner", ({ mode }) => {
    const queue = queues[mode];

    if (queue.size > 0) {
      // Pair with first waiting user
      const partnerId = queue.values().next().value;
      queue.delete(partnerId);

      partners.set(socket.id, partnerId);
      partners.set(partnerId, socket.id);

      io.to(socket.id).emit("partner:found", { id: partnerId });
      io.to(partnerId).emit("partner:found", { id: socket.id });
    } else {
      queue.add(socket.id);
    }
  });

  // Next partner
  socket.on("next:partner", ({ mode }) => {
    endCurrentConnection(socket);
    socket.emit("find:partner", { mode });
  });

  // End call
  socket.on("call:end", () => {
    endCurrentConnection(socket);
  });

  // --- WebRTC signaling relay ---
  socket.on("user:call", ({ to, offer }) => {
    io.to(to).emit("incomming:call", { from: socket.id, offer });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  // Cleanup on disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    endCurrentConnection(socket);
    Object.values(queues).forEach((queue) => queue.delete(socket.id));
  });
});

function endCurrentConnection(socket) {
  const partnerId = partners.get(socket.id);
  if (partnerId) {
    partners.delete(socket.id);
    partners.delete(partnerId);

    io.to(partnerId).emit("call:ended", { from: socket.id });
    io.to(socket.id).emit("call:ended", { from: partnerId });
  }
}
