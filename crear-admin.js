const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('--- Creador de Administrador de UniRide ---');

rl.question('Introduce el nombre del administrador: ', (name) => {
    rl.question('Introduce el email del administrador (ej: admin@uniride.com): ', (email) => {
        rl.question('Introduce la contraseña del administrador: ', (password) => {
            
            const db = new sqlite3.Database('./uniride.sqlite', (err) => {
                if (err) {
                    console.error('Error al abrir la base de datos:', err.message);
                    rl.close();
                    return;
                }

                // Insertar administrador
                const sql = `INSERT INTO users (name, email, password, type) VALUES (?, ?, ?, 'admin')`;
                
                db.run(sql, [name, email, password], function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed')) {
                            console.error('\n❌ Error: El email ya está registrado.');
                        } else {
                            console.error('\n❌ Error al crear el administrador:', err.message);
                        }
                    } else {
                        console.log(`\n✅ Administrador creado correctamente!`);
                        console.log(`   Email: ${email}`);
                        console.log(`   Contraseña: ${password}`);
                        console.log(`\nYa puedes iniciar sesión en la web con estas credenciales para acceder al panel de gestión.`);
                    }
                    
                    db.close();
                    rl.close();
                });
            });
        });
    });
});
