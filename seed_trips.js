const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'uniride.sqlite');
const db = new sqlite3.Database(dbPath);

const rabanales = { name: 'Campus Universitario de Rabanales', lat: 37.91497, lng: -4.72142 };

const neighborhoods = [
    { name: 'Ciudad Jardín', lat: 37.8817, lng: -4.7925 },
    { name: 'Barrio de Fátima', lat: 37.8931, lng: -4.7573 },
    { name: 'Sector Sur', lat: 37.8681, lng: -4.7820 },
    { name: 'Santa Rosa', lat: 37.8973, lng: -4.7831 },
    { name: 'Zoco / Poniente', lat: 37.8842, lng: -4.7997 },
    { name: 'Levante', lat: 37.8920, lng: -4.7610 },
    { name: 'Centro', lat: 37.8850, lng: -4.7790 },
    { name: 'Miralbaida', lat: 37.8950, lng: -4.8200 },
    { name: 'Las Moreras', lat: 37.8961, lng: -4.7983 },
    { name: 'San Lorenzo', lat: 37.8855, lng: -4.7675 }
];

const cars = ['Renault Clio', 'Seat Ibiza', 'VW Polo', 'Ford Focus', 'Peugeot 208', 'Toyota Yaris'];
const dates = [
    new Date(Date.now() + 1 * 86400000).toISOString().split('T')[0], // tomorrow
    new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0], // in 2 days
    new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]  // in 3 days
];
const times = ['07:30', '08:00', '08:15', '14:30', '15:00', '19:00', '20:15'];

db.serialize(() => {
    console.log('🔄 Borrando viajes y reservas antiguas...');
    db.run('DELETE FROM reservations');
    db.run('DELETE FROM trips');

    console.log('✅ Base de datos limpia.');

    // Fetch real drivers from the database
    db.all("SELECT id, name FROM users", (err, users) => {
        if (err || users.length === 0) {
            console.error('❌ Error: No se encontraron usuarios en la base de datos. Por favor, regístrate en la web primero.');
            db.close();
            return;
        }

        console.log('🚗 Generando 20 viajes a/desde Rabanales asignados a usuarios reales...');

        const stmt = db.prepare(`
            INSERT INTO trips (
                origin, destination, date, time, seats, price, recommended_price, 
                car, description, driver_id, driver_name, 
                origin_lat, origin_lng, dest_lat, dest_lng
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let i = 1; i <= 20; i++) {
            const isToRabanales = Math.random() > 0.5;
            const neighborhood = neighborhoods[Math.floor(Math.random() * neighborhoods.length)];
            
            let origin, dest;
            if (isToRabanales) {
                origin = neighborhood;
                dest = rabanales;
            } else {
                origin = rabanales;
                dest = neighborhood;
            }

            const date = dates[Math.floor(Math.random() * dates.length)];
            const time = times[Math.floor(Math.random() * times.length)];
            const seats = Math.floor(Math.random() * 4) + 1; // 1 to 4
            const recommended = (Math.random() * 2 + 1).toFixed(2); // 1.00 to 3.00
            const price = (parseFloat(recommended) + (Math.random() > 0.5 ? 0.5 : -0.2)).toFixed(2);
            const car = cars[Math.floor(Math.random() * cars.length)];
            const desc = isToRabanales ? 'Voy directo a clase. ¡Puntualidad!' : 'Vuelta a casa después de clases.';
            
            // Asignar un conductor real aleatorio de la base de datos
            const randomUser = users[Math.floor(Math.random() * users.length)];
            const driver_id = randomUser.id; 
            const driver_name = randomUser.name;

            stmt.run(
                origin.name, dest.name, date, time, seats, price, recommended,
                car, desc, driver_id, driver_name,
                origin.lat, origin.lng, dest.lat, dest.lng
            );
        }

        stmt.finalize();
        console.log('🎉 ¡20 viajes generados con éxito con sus coordenadas GPS!');
        
        db.close();
    });
});
