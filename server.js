const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'html', 'uploads');
if (!fs.existsSync(uploadsDir)) { fs.mkdirSync(uploadsDir, { recursive: true }); }

// Multer config for photo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'html')));

// Database Setup
const db = new sqlite3.Database('./uniride.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create users table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            type TEXT NOT NULL
        )`);
        // Create trips table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            seats INTEGER NOT NULL,
            price REAL NOT NULL,
            car TEXT,
            description TEXT,
            driver_id INTEGER NOT NULL,
            driver_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (driver_id) REFERENCES users(id)
        )`);
        // Create photos table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            route TEXT,
            image TEXT NOT NULL,
            user_id INTEGER,
            user_name TEXT NOT NULL,
            user_type TEXT DEFAULT 'traveler',
            likes INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        // Create joined_trips table
        db.run(`CREATE TABLE IF NOT EXISTS joined_trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(trip_id, user_id),
            FOREIGN KEY (trip_id) REFERENCES trips(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`);
    }
});

// --- API ROUTES ---

// Register
app.post('/api/register', async (req, res) => {
    console.log('>>> REGISTRO recibido:', req.body.email, req.body.name, req.body.type);
    const { name, email, password, type } = req.body;

    if (!name || !email || !password || !type) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const sql = `INSERT INTO users (name, email, password, type) VALUES (?, ?, ?, ?)`;
        db.run(sql, [name, email, hashedPassword, type], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'El email ya está registrado' });
                }
                return res.status(500).json({ error: 'Error al registrar el usuario' });
            }
            
            // Return user data (without password)
            res.status(201).json({
                message: 'Usuario registrado correctamente',
                user: { id: this.lastID, name, email, type }
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Login
app.post('/api/login', (req, res) => {
    console.log('>>> LOGIN recibido:', req.body.email);
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Error en el servidor' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Email o contraseña incorrectos' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Email o contraseña incorrectos' });
        }

        // Login successful, return user info
        res.json({
            message: 'Inicio de sesión exitoso',
            user: { id: user.id, name: user.name, email: user.email, type: user.type }
        });
    });
});

// --- TRIPS API ---

// Get all trips
app.get('/api/trips', (req, res) => {
    db.all(`SELECT * FROM trips ORDER BY date ASC, time ASC`, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Error al obtener los viajes' });
        }
        res.json(rows);
    });
});

// Create a trip
app.post('/api/trips', (req, res) => {
    console.log('>>> VIAJE recibido:', req.body);
    const { origin, destination, date, time, seats, price, car, description, driver_id, driver_name } = req.body;

    if (!origin || !destination || !date || !time || !seats || !price || !driver_id || !driver_name) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    // Validar que la fecha no sea en el pasado
    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
        return res.status(400).json({ error: 'No puedes programar un viaje en el pasado' });
    }

    const sql = `INSERT INTO trips (origin, destination, date, time, seats, price, car, description, driver_id, driver_name)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [origin, destination, date, time, seats, price, car || '', description || '', driver_id, driver_name], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Error al crear el viaje' });
        }
        res.status(201).json({
            message: 'Viaje creado correctamente',
            trip: { id: this.lastID, origin, destination, date, time, seats, price, car, description, driver_id, driver_name }
        });
    });
});

// Delete a trip
app.delete('/api/trips/:id', (req, res) => {
    db.run(`DELETE FROM trips WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Error al eliminar el viaje' });
        res.json({ message: 'Viaje eliminado' });
    });
});

// Join a trip
app.post('/api/trips/:id/join', (req, res) => {
    const tripId = req.params.id;
    const { user_id } = req.body;

    if (!user_id) return res.status(400).json({ error: 'Falta el id de usuario' });

    // Check if seats available
    db.get(`SELECT seats FROM trips WHERE id = ?`, [tripId], (err, trip) => {
        if (err || !trip) return res.status(404).json({ error: 'Viaje no encontrado' });
        if (trip.seats <= 0) return res.status(400).json({ error: 'No quedan plazas en este viaje' });

        // Insert into joined_trips
        db.run(`INSERT INTO joined_trips (trip_id, user_id) VALUES (?, ?)`, [tripId, user_id], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Ya estás apuntado a este viaje' });
                }
                return res.status(500).json({ error: 'Error al unirse al viaje' });
            }
            
            // Decrease seats
            db.run(`UPDATE trips SET seats = seats - 1 WHERE id = ?`, [tripId], (err) => {
                if (err) return res.status(500).json({ error: 'Error al actualizar las plazas' });
                res.json({ message: 'Te has unido al viaje correctamente' });
            });
        });
    });
});

// Get trips joined by a user
app.get('/api/trips/joined/:userId', (req, res) => {
    const sql = `
        SELECT t.* 
        FROM trips t
        JOIN joined_trips jt ON t.id = jt.trip_id
        WHERE jt.user_id = ?
        ORDER BY t.date ASC, t.time ASC
    `;
    db.all(sql, [req.params.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al obtener tus viajes' });
        res.json(rows);
    });
});

// --- PHOTOS API ---

// Get all photos
app.get('/api/photos', (req, res) => {
    db.all(`SELECT * FROM photos ORDER BY created_at DESC`, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al obtener las fotos' });
        res.json(rows);
    });
});

// Upload a photo
app.post('/api/photos', upload.single('photo'), (req, res) => {
    console.log('>>> FOTO recibida:', req.body.title);
    const { title, description, route, user_id, user_name, user_type } = req.body;

    if (!title || !req.file) {
        return res.status(400).json({ error: 'Título y foto son obligatorios' });
    }

    const imagePath = 'uploads/' + req.file.filename;
    const sql = `INSERT INTO photos (title, description, route, image, user_id, user_name, user_type)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [title, description || '', route || '', imagePath, user_id || null, user_name || 'Anónimo', user_type || 'traveler'], function(err) {
        if (err) return res.status(500).json({ error: 'Error al guardar la foto' });
        res.status(201).json({
            message: 'Foto subida correctamente',
            photo: { id: this.lastID, title, description, route, image: imagePath, user_name, user_type, likes: 0, comments: 0 }
        });
    });
});

// Like a photo
app.post('/api/photos/:id/like', (req, res) => {
    db.run(`UPDATE photos SET likes = likes + 1 WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Error al dar like' });
        
        db.get(`SELECT likes FROM photos WHERE id = ?`, [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: 'Error al obtener likes' });
            res.json({ message: 'Like añadido', likes: row.likes });
        });
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop.');
});
