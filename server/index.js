require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
// app.use('/api/events', require('./routes/events'));
// app.use('/api/deals', require('./routes/deals'));
// app.use('/api/notifications', require('./routes/notifications'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
