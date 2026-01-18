const sqlite3 = require('sqlite3').verbose();

// Create or connect to database
const db = new sqlite3.Database('./dlh-dashboard.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to SQLite database.');
});

// Create tables if they don't exist
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`, (err) => {
        if (err) {
            console.error('Error creating users table:', err.message);
        } else {
            console.log('Users table created successfully or already exists.');
        }
    });

    // Reports table
    db.run(`CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fileName TEXT,
        uploadDate TEXT,
        data TEXT,
        userId INTEGER,
        FOREIGN KEY (userId) REFERENCES users (id)
    )`, (err) => {
        if (err) {
            console.error('Error creating reports table:', err.message);
        } else {
            console.log('Reports table created successfully or already exists.');
        }
    });
});

module.exports = db;
