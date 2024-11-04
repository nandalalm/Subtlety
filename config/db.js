
const mongoose = require('mongoose');

const dbURI = process.env; 

console.log(dbURI);


const connectDB = async () => {
    try {
        await mongoose.connect(dbURI, {
        });
        
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

module.exports = connectDB;
