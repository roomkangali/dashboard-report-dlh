const express = require('express');
const cors = require('cors');
const passport = require('passport');
const db = require('./database.js'); // Import database connection
const auth = require('./auth.js');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(passport.initialize());
app.use(express.static('.'));

// Routes
app.post('/register', auth.registerUser);
app.post('/login', auth.loginUser);

// Report Routes (protected)
app.get('/api/reports', passport.authenticate('jwt', { session: false }), (req, res) => {
    db.all('SELECT * FROM reports WHERE userId = ?', [req.user.id], (err, rows) => {
        if (err) {
            res.status(500).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        });
    });
});

app.get('/api/reports/:id', passport.authenticate('jwt', { session: false }), (req, res) => {
    db.get('SELECT * FROM reports WHERE id = ? AND userId = ?', [req.params.id, req.user.id], (err, row) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": row
        });
    });
});

app.post('/api/reports', passport.authenticate('jwt', { session: false }), (req, res) => {
    const { fileName, uploadDate, data } = req.body;
    const userId = req.user.id;
    
    db.run(`INSERT INTO reports (fileName, uploadDate, data, userId) VALUES (?, ?, ?, ?)`, [fileName, uploadDate, JSON.stringify(data), userId], function(err) {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": { id: this.lastID }
        });
    });
});

app.delete('/api/reports/:id', passport.authenticate('jwt', { session: false }), (req, res) => {
    db.run(`DELETE FROM reports WHERE id = ? AND userId = ?`, [req.params.id, req.user.id], function(err, result) {
        if (err) {
            res.status(400).json({ "error": res.message });
            return;
        }
        res.json({ "message": "deleted", changes: this.changes });
    });
});


app.get('/', (req, res) => {
    res.send('DLH Dashboard Backend');
});

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});
