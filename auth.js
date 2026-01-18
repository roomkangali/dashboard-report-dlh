const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const passportJWT = require('passport-jwt');
const JWTStrategy   = passportJWT.Strategy;
const ExtractJWT = passportJWT.ExtractJwt;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database.js');

const JWT_SECRET = 'your_jwt_secret'; // Ganti dengan secret yang lebih aman

// Strategi login lokal
passport.use(new LocalStrategy((username, password, done) => {
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) { return done(err); }
        if (!user) { return done(null, false, { message: 'Username tidak ditemukan.' }); }
        
        bcrypt.compare(password, user.password, (err, res) => {
            if (res) {
                return done(null, user);
            } else {
                return done(null, false, { message: 'Password salah.' });
            }
        });
    });
}));

passport.use(new JWTStrategy({
    jwtFromRequest: ExtractJWT.fromAuthHeaderAsBearerToken(),
    secretOrKey   : JWT_SECRET
},
(jwtPayload, cb) => {
    //find the user in db if needed
    return db.get('SELECT * FROM users WHERE id = ?', [jwtPayload.id], (err, user) => {
        if (err) {
            return cb(err);
        }
        return cb(null, user);
    });
}
));

// Fungsi untuk mendaftarkan pengguna baru
const registerUser = (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ message: 'Username dan password diperlukan.' });
    }
    
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            return res.status(500).json({ message: 'Error saat hashing password.' });
        }
        
        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], function(err) {
            if (err) {
                return res.status(400).json({ message: 'Username sudah digunakan.' });
            }
            res.status(201).json({ message: `User ${username} berhasil dibuat.` });
        });
    });
};

// Fungsi untuk login dan mendapatkan token
const loginUser = (req, res) => {
    passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err || !user) {
            return res.status(400).json({
                message: info ? info.message : 'Login gagal.',
                user: user
            });
        }
        
        req.login(user, { session: false }, (err) => {
            if (err) {
                res.send(err);
            }
            
            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
            return res.json({ user, token });
        });
    })(req, res);
};

module.exports = {
    registerUser,
    loginUser,
    JWT_SECRET
};
