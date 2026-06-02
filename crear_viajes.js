const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./uniride.sqlite');

const trips = [
    { origin: 'Córdoba', destination: 'Sevilla', date: '2026-06-10', time: '08:00', seats: 3, price: 12.50, car: 'Seat León', description: 'Viaje tranquilo, sin paradas largas.', driver_id: 2, driver_name: 'Ana Ruiz' },
    { origin: 'Campus de Rabanales', destination: 'Renfe (Córdoba)', date: '2026-06-11', time: '14:30', seats: 4, price: 1.50, car: 'Ford Fiesta', description: 'Salgo justo después de clase.', driver_id: 3, driver_name: 'María Sánchez' },
    { origin: 'Córdoba', destination: 'Málaga', date: '2026-06-12', time: '18:00', seats: 2, price: 15.00, car: 'Toyota Corolla', description: 'Voy directo por la autovía.', driver_id: 4, driver_name: 'Javier Moreno' },
    { origin: 'Lucena', destination: 'Córdoba', date: '2026-06-13', time: '07:15', seats: 3, price: 5.00, car: 'Renault Megane', description: 'Trabajo en Córdoba, viaje diario.', driver_id: 5, driver_name: 'Pablo Fernández' },
    { origin: 'Córdoba', destination: 'Granada', date: '2026-06-15', time: '09:00', seats: 4, price: 14.00, car: 'Peugeot 308', description: 'Fin de semana en Granada.', driver_id: 6, driver_name: 'Carlos Martínez' },
    { origin: 'Montilla', destination: 'Campus de Rabanales', date: '2026-06-16', time: '07:45', seats: 3, price: 4.00, car: 'Volkswagen Golf', description: 'Puntualidad importante.', driver_id: 7, driver_name: 'Miguel Torres' },
    { origin: 'Córdoba', destination: 'Madrid', date: '2026-06-20', time: '10:00', seats: 2, price: 25.00, car: 'Audi A3', description: 'Viaje largo, hacemos parada a la mitad.', driver_id: 8, driver_name: 'Laura García' },
    { origin: 'Palma del Río', destination: 'Córdoba', date: '2026-06-17', time: '08:30', seats: 4, price: 6.00, car: 'Opel Corsa', description: 'Voy con música tranquila.', driver_id: 9, driver_name: 'Elena Jiménez' },
    { origin: 'Córdoba', destination: 'Jaén', date: '2026-06-18', time: '16:00', seats: 3, price: 10.00, car: 'Citroen C4', description: 'Espacio en el maletero disponible.', driver_id: 10, driver_name: 'David López' },
    { origin: 'Campus de Rabanales', destination: 'Ciudad Jardín', date: '2026-06-19', time: '15:15', seats: 4, price: 1.00, car: 'Kia Ceed', description: 'Ruta habitual.', driver_id: 11, driver_name: 'Sofía Pérez' },
    { origin: 'Córdoba', destination: 'Cádiz', date: '2026-06-25', time: '08:00', seats: 3, price: 20.00, car: 'Hyundai Tucson', description: 'Viaje a la playa.', driver_id: 23, driver_name: 'David Carmona Cubero' },
    { origin: 'Pozoblanco', destination: 'Córdoba', date: '2026-06-21', time: '07:00', seats: 4, price: 8.00, car: 'Dacia Sandero', description: 'Viaje temprano.', driver_id: 24, driver_name: 'Francisco Javier Luna Valbuena' },
    { origin: 'Córdoba', destination: 'Baena', date: '2026-06-22', time: '19:30', seats: 3, price: 6.00, car: 'Fiat 500', description: 'Viaje corto.', driver_id: 25, driver_name: 'Lucas Perez' },
    { origin: 'Priego de Córdoba', destination: 'Córdoba', date: '2026-06-23', time: '08:15', seats: 4, price: 7.00, car: 'Nissan Qashqai', description: 'Viaje cómodo en SUV.', driver_id: 26, driver_name: 'Damian' },
    { origin: 'Córdoba', destination: 'Sevilla', date: '2026-06-24', time: '20:00', seats: 2, price: 13.00, car: 'Mercedes Clase A', description: 'Viaje nocturno.', driver_id: 29, driver_name: 'Cuenta de prueba' }
];

let stmt = db.prepare("INSERT INTO trips (origin, destination, date, time, seats, price, car, description, driver_id, driver_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
trips.forEach(t => stmt.run(t.origin, t.destination, t.date, t.time, t.seats, t.price, t.car, t.description, t.driver_id, t.driver_name));
stmt.finalize(() => {
    console.log("✅ Se han insertado 15 viajes nuevos de prueba en la base de datos de manera correcta.");
});
