require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
// Fix: /webhook needs raw body for Stripe signature validation
app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});
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
        // Create reservations table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (trip_id) REFERENCES trips(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(trip_id, user_id)
        )`);
        // Create payments table for Stripe payment tracking (idempotency)
        db.run(`CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_intent_id TEXT UNIQUE NOT NULL,
            trip_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            amount INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        // ATENCIÓN: Guardando contraseña en texto plano (SOLO PARA FASE DE PRUEBAS)
        // En producción DEBES usar: const hashedPassword = await bcrypt.hash(password, 10);
        
        const sql = `INSERT INTO users (name, email, password, type) VALUES (?, ?, ?, ?)`;
        db.run(sql, [name, email, password, type], function(err) {
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

        // ATENCIÓN: Comparando contraseñas en texto plano (SOLO PARA FASE DE PRUEBAS)
        // En producción DEBES usar: const validPassword = await bcrypt.compare(password, user.password);
        if (password !== user.password) {
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

    // Validate date is not in the past
    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
        return res.status(400).json({ error: 'No se pueden crear viajes para fechas pasadas' });
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

// Delete a trip (driver cancels trip)
app.delete('/api/trips/:id', (req, res) => {
    const tripId = req.params.id;
    const userId = req.body.user_id;

    if (!userId) return res.status(400).json({ error: 'user_id es requerido' });

    // Verify ownership
    db.get(`SELECT driver_id FROM trips WHERE id = ?`, [tripId], (err, trip) => {
        if (err) return res.status(500).json({ error: 'Error al buscar el viaje' });
        if (!trip) return res.status(404).json({ error: 'Viaje no encontrado' });
        if (trip.driver_id != userId) return res.status(403).json({ error: 'No tienes permiso para cancelar este viaje' });

        // Delete reservations first
        db.run(`DELETE FROM reservations WHERE trip_id = ?`, [tripId], function(err) {
            if (err) return res.status(500).json({ error: 'Error al cancelar reservas' });
            
            // Delete trip
            db.run(`DELETE FROM trips WHERE id = ?`, [tripId], function(err) {
                if (err) return res.status(500).json({ error: 'Error al eliminar el viaje' });
                res.json({ message: 'Viaje eliminado' });
            });
        });
    });
});

// Join a trip (traveler joins)
app.post('/api/trips/:id/join', (req, res) => {
    const tripId = req.params.id;
    const userId = req.body.user_id;

    if (!userId) return res.status(400).json({ error: 'user_id es requerido' });

    // Check if trip exists and has seats
    db.get(`SELECT seats FROM trips WHERE id = ?`, [tripId], (err, trip) => {
        if (err) return res.status(500).json({ error: 'Error al buscar el viaje' });
        if (!trip) return res.status(404).json({ error: 'Viaje no encontrado' });
        if (trip.seats <= 0) return res.status(400).json({ error: 'No quedan asientos disponibles' });

        // Create reservation
        db.run(`INSERT INTO reservations (trip_id, user_id) VALUES (?, ?)`, [tripId, userId], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Ya estás unido a este viaje' });
                }
                return res.status(500).json({ error: 'Error al unirse al viaje' });
            }

            // Decrement seats
            db.run(`UPDATE trips SET seats = seats - 1 WHERE id = ?`, [tripId], function(err) {
                if (err) return res.status(500).json({ error: 'Error al actualizar asientos' });
                res.json({ message: 'Te has unido al viaje exitosamente' });
            });
        });
    });
});

// Cancel reservation (traveler cancels)
app.post('/api/trips/:id/cancel', (req, res) => {
    const tripId = req.params.id;
    const userId = req.body.user_id;

    if (!userId) return res.status(400).json({ error: 'user_id es requerido' });

    db.run(`DELETE FROM reservations WHERE trip_id = ? AND user_id = ?`, [tripId, userId], function(err) {
        if (err) return res.status(500).json({ error: 'Error al cancelar la reserva' });
        if (this.changes === 0) return res.status(404).json({ error: 'Reserva no encontrada' });

        // Increment seats
        db.run(`UPDATE trips SET seats = seats + 1 WHERE id = ?`, [tripId], function(err) {
            if (err) return res.status(500).json({ error: 'Error al actualizar asientos' });
            res.json({ message: 'Reserva cancelada exitosamente' });
        });
    });
});

// Get user trips (created & joined)
app.get('/api/users/:id/trips', (req, res) => {
    const userId = req.params.id;

    // Get trips where user is driver OR user has a reservation
    const sql = `
        SELECT t.*, 
               CASE WHEN t.driver_id = ? THEN 'driver' ELSE 'traveler' END as role
        FROM trips t
        LEFT JOIN reservations r ON t.id = r.trip_id
        WHERE t.driver_id = ? OR r.user_id = ?
        GROUP BY t.id
        ORDER BY t.date ASC, t.time ASC
    `;

    db.all(sql, [userId, userId, userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al obtener los viajes del usuario' });
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
    const photoId = req.params.id;
    const action = req.body.action || 'like';
    const increment = action === 'like' ? 1 : -1;
    
    db.run(`UPDATE photos SET likes = MAX(0, likes + ?) WHERE id = ?`, [increment, photoId], function(err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar likes' });
        db.get(`SELECT likes FROM photos WHERE id = ?`, [photoId], (err, row) => {
            if (err || !row) return res.status(500).json({ error: 'Error' });
            res.json({ likes: row.likes });
        });
    });
});

// Comment a photo
app.post('/api/photos/:id/comment', (req, res) => {
    const photoId = req.params.id;
    db.run(`UPDATE photos SET comments = comments + 1 WHERE id = ?`, [photoId], function(err) {
        if (err) return res.status(500).json({ error: 'Error al añadir comentario' });
        db.get(`SELECT comments FROM photos WHERE id = ?`, [photoId], (err, row) => {
            if (err || !row) return res.status(500).json({ error: 'Error' });
            res.json({ comments: row.comments });
        });
    });
});

// Update user account settings
app.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { name, type, password } = req.body;

    if (!name || !type) {
        return res.status(400).json({ error: 'Nombre y tipo son obligatorios' });
    }

    let sql, params;
    if (password) {
        // Update name, type and password
        sql = `UPDATE users SET name = ?, type = ?, password = ? WHERE id = ?`;
        params = [name, type, password, userId];
    } else {
        // Only update name and type
        sql = `UPDATE users SET name = ?, type = ? WHERE id = ?`;
        params = [name, type, userId];
    }

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar los datos' });
        if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ message: 'Datos actualizados correctamente', user: { id: userId, name, type } });
    });
});

// --- STRIPE PAYMENT API ---

// Create a PaymentIntent - called when user clicks "Unirse al Viaje"
app.post('/api/create-payment-intent', async (req, res) => {
    const { tripId, userId } = req.body;

    if (!tripId || !userId) {
        return res.status(400).json({ error: 'tripId y userId son obligatorios' });
    }

    // Get the REAL price from DB (never trust frontend price)
    db.get('SELECT * FROM trips WHERE id = ?', [tripId], async (err, trip) => {
        if (err || !trip) return res.status(404).json({ error: 'Viaje no encontrado' });
        if (trip.seats <= 0) return res.status(400).json({ error: 'No quedan asientos disponibles' });
        if (trip.driver_id == userId) return res.status(400).json({ error: 'No puedes unirte a tu propio viaje' });

        // Check if user already has a reservation
        db.get('SELECT id FROM reservations WHERE trip_id = ? AND user_id = ?', [tripId, userId], async (err, existing) => {
            if (existing) return res.status(400).json({ error: 'Ya estás unido a este viaje' });

            // Stripe amounts are in cents (euros × 100)
            const amountInCents = Math.round(trip.price * 100);

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents,
                    currency: 'eur',
                    automatic_payment_methods: { enabled: true },
                    metadata: {
                        tripId: String(tripId),
                        userId: String(userId),
                        origin: trip.origin,
                        destination: trip.destination
                    }
                });

                res.json({
                    clientSecret: paymentIntent.client_secret,
                    tripInfo: {
                        origin: trip.origin,
                        destination: trip.destination,
                        date: trip.date,
                        time: trip.time,
                        price: trip.price,
                        car: trip.car,
                        driver_name: trip.driver_name
                    }
                });
            } catch (error) {
                console.error('Stripe error:', error);
                res.status(500).json({ error: error.message });
            }
        });
    });
});

// Confirm payment and create reservation - called from payment-success page
app.post('/api/trips/:id/confirm-payment', async (req, res) => {
    const tripId = req.params.id;
    const { paymentIntentId, userId } = req.body;

    if (!paymentIntentId || !userId) {
        return res.status(400).json({ error: 'paymentIntentId y userId son obligatorios' });
    }

    // Idempotency: check if this payment was already processed
    db.get('SELECT * FROM payments WHERE payment_intent_id = ?', [paymentIntentId], async (err, existingPayment) => {
        if (existingPayment && existingPayment.status === 'succeeded') {
            return res.json({ message: 'Reserva ya confirmada anteriormente', alreadyProcessed: true });
        }

        try {
            // Verify with Stripe that payment actually succeeded
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

            if (paymentIntent.status !== 'succeeded') {
                return res.status(400).json({ error: `El pago no ha sido completado. Estado: ${paymentIntent.status}` });
            }

            const amountInCents = paymentIntent.amount;

            // Record payment in DB
            db.run(
                'INSERT OR IGNORE INTO payments (payment_intent_id, trip_id, user_id, amount, status) VALUES (?, ?, ?, ?, ?)',
                [paymentIntentId, tripId, userId, amountInCents, 'succeeded'],
                function(err) {
                    // Create reservation
                    db.run('INSERT INTO reservations (trip_id, user_id) VALUES (?, ?)', [tripId, userId], function(err) {
                        if (err && err.message.includes('UNIQUE constraint failed')) {
                            return res.json({ message: 'Reserva confirmada', alreadyProcessed: true });
                        }
                        if (err) return res.status(500).json({ error: 'Error al crear la reserva' });

                        // Decrement seats
                        db.run('UPDATE trips SET seats = seats - 1 WHERE id = ?', [tripId], function(err) {
                            if (err) return res.status(500).json({ error: 'Error al actualizar asientos' });
                            console.log(`>>> RESERVA CONFIRMADA: viaje ${tripId}, usuario ${userId}, pago ${paymentIntentId}`);
                            res.json({ message: 'Reserva confirmada y pago procesado correctamente' });
                        });
                    });
                }
            );
        } catch (error) {
            console.error('Error confirming payment:', error);
            res.status(500).json({ error: error.message });
        }
    });
});

// Stripe Webhook - server-to-server confirmation from Stripe
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
        if (webhookSecret && webhookSecret.length > 0) {
            // Validate signature when webhook secret is configured
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            // No webhook secret configured yet (local dev)
            event = JSON.parse(req.body.toString());
        }
    } catch (err) {
        console.error('Webhook signature error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`>>> WEBHOOK evento: ${event.type}`);

    if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object;
        const tripId = pi.metadata.tripId;
        const userId = pi.metadata.userId;

        // Idempotency check
        db.get('SELECT id FROM payments WHERE payment_intent_id = ?', [pi.id], (err, existing) => {
            if (existing) {
                console.log(`>>> Webhook: pago ${pi.id} ya procesado, ignorando`);
                return;
            }
            // Record payment
            db.run(
                'INSERT OR IGNORE INTO payments (payment_intent_id, trip_id, user_id, amount, status) VALUES (?, ?, ?, ?, ?)',
                [pi.id, tripId, userId, pi.amount, 'succeeded']
            );
            console.log(`>>> Webhook: pago ${pi.id} registrado correctamente`);
        });
    }

    if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object;
        console.log(`>>> Webhook: pago fallido ${pi.id}`);
        db.run(
            'INSERT OR IGNORE INTO payments (payment_intent_id, trip_id, user_id, amount, status) VALUES (?, ?, ?, ?, ?)',
            [pi.id, pi.metadata.tripId, pi.metadata.userId, pi.amount, 'failed']
        );
    }

    res.json({ received: true });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop.');
});
