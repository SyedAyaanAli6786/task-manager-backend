const express = require('express');
const app = express();
require('dotenv').config();
require('./Models/db');
const PORT = process.env.PORT || 8080;
const TaskRouter = require('./Routes/TaskRouter');
const bodyParser = require('body-parser');
const cors = require('cors');

// Define CORS options
const corsOptions = {
    origin: '*', // You can restrict this to specific domains if needed
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204
};

// Use CORS middleware with options
app.use(cors(corsOptions));

app.get('/', (req, res) => {
    res.send('Hello from the server');
});

app.use(bodyParser.json());
app.use('/tasks', TaskRouter);

app.listen(PORT, () => {
    console.log(`Server is running on PORT=${PORT}`);
});
