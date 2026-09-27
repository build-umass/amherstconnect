require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { isFirebaseAvailable } = require('./config/firebase');
const { startEventListener } = require('./services/eventListener');
const { startReminderJob } = require('./services/reminderJob');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api/users', require('./routes/users'));
app.use('/api/verification', require('./routes/verification'));
app.use('/api/notifications', require('./routes/notifications'));
// app.use('/api/events', require('./routes/events'));
// app.use('/api/deals', require('./routes/deals'));

function startServer(port = PORT) {
  const server = app.listen(port, () => {
    const address = server.address();
    const listeningPort = typeof address === 'object' ? address.port : port;
    console.log(`Server running on port ${listeningPort}`);

    if (isFirebaseAvailable()) {
      startEventListener();
      startReminderJob();
    } else {
      console.warn('[server] Firebase background services were not started.');
    }
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
