const express = require('express');
const app = express();
require('dotenv').config();
// require('./Models/db'); ❌ DB disabled

const PORT = process.env.PORT || 8080;
const TaskRouter = require('./Routes/TaskRouter');
const bodyParser = require('body-parser');
const cors = require('cors');

const corsOptions = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('Hello from the server');
});

app.use('/tasks', TaskRouter);

// ✅ Start server ONLY when not testing
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server is running on PORT=${PORT}`);
    });
}

// ✅ Export app for tests
module.exports = app;
