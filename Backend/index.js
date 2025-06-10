const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());




const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);


const denominationRoute = require('./routes/denominations');
app.use('/api/denominations', denominationRoute);


const chatRoute = require('./routes/chats');
app.use('/api/chat', chatRoute);

const historyRoute = require('./routes/history');
app.use('/api/history', historyRoute);  


const scriptureRoute = require('./routes/scripture');
app.use('/api/scripture', scriptureRoute);

app.get('/', (req, res) => res.send('AI Preacher API is running'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));





