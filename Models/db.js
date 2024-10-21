const mongoose = require('mongoose');

const DB_URL = process.env.MONGODB_URI;

mongoose.connect(DB_URL)
    .then(() => {
        console.log('MongoDB is Connected...');
    }).catch((err) => {
        console.log('MongoDB Conn Error...', err);
    })