const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./uniride.sqlite');

const possibleComments = [
    "¡Qué sitio más chulo! 😍",
    "Yo estuve allí el mes pasado, es increíble.",
    "¿Dónde es exactamente? ¡Quiero ir!",
    "Fotaza 📸",
    "Buen viaje, ¡qué envidia!",
    "A ver si me llevas la próxima vez jaja",
    "Espectacular.",
    "El mejor viaje que he visto por aquí.",
    "Qué colores tan bonitos tiene la foto.",
    "Me encanta este lugar, tengo recuerdos geniales.",
    "¡Qué buena pinta tiene ese sitio!",
    "Increíble paisaje 🏔️",
    "Me lo apunto para mi próximo viaje.",
    "¡Brutal!",
    "Precioso. Gracias por compartirlo."
];

// Helper to get random elements from array
function getRandomElements(arr, num) {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, num);
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedPhotos() {
    console.log("Conectando a la base de datos...");

    // Promisify DB calls for easier flow control
    const all = (query, params = []) => new Promise((resolve, reject) => db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows)));
    const run = (query, params = []) => new Promise((resolve, reject) => db.run(query, params, function(err) { err ? reject(err) : resolve(this) }));

    try {
        const users = await all("SELECT id, name FROM users");
        const photos = await all("SELECT id FROM photos");

        if (users.length === 0) {
            console.log("❌ No hay usuarios en la base de datos. Crea usuarios primero.");
            process.exit(1);
        }

        if (photos.length === 0) {
            console.log("❌ No hay fotos en la base de datos. Sube fotos en la galería primero.");
            process.exit(1);
        }

        console.log(`Se han encontrado ${users.length} usuarios y ${photos.length} fotos.`);
        console.log("Limpiando likes y comentarios antiguos...");
        
        await run("DELETE FROM photo_likes");
        await run("DELETE FROM photo_comments");
        await run("UPDATE photos SET likes = 0, comments = 0");

        console.log("Generando nuevas interacciones...");

        let totalLikes = 0;
        let totalComments = 0;

        for (const photo of photos) {
            // Decide how many likes and comments for this photo
            // Using min to avoid asking for more items than available users
            const numLikes = getRandomInt(1, Math.min(10, users.length));
            const numComments = getRandomInt(1, Math.min(6, users.length));

            // Select random users for likes
            const likedUsers = getRandomElements(users, numLikes);
            for (const user of likedUsers) {
                await run("INSERT INTO photo_likes (photo_id, user_id) VALUES (?, ?)", [photo.id, user.id]);
                totalLikes++;
            }

            // Select random users for comments
            const commentedUsers = getRandomElements(users, numComments);
            for (const user of commentedUsers) {
                const commentText = getRandomElements(possibleComments, 1)[0];
                await run("INSERT INTO photo_comments (photo_id, user_id, user_name, comment) VALUES (?, ?, ?, ?)", 
                    [photo.id, user.id, user.name, commentText]);
                totalComments++;
            }
            
            // Update the legacy counters in the photos table just in case
            await run("UPDATE photos SET likes = ?, comments = ? WHERE id = ?", [numLikes, numComments, photo.id]);
        }

        console.log("====================================");
        console.log("✅ ¡Base de datos poblada con éxito!");
        console.log(`👉 Se han generado ${totalLikes} likes.`);
        console.log(`👉 Se han generado ${totalComments} comentarios aleatorios.`);
        console.log("====================================");

    } catch (err) {
        console.error("❌ Error durante el proceso:", err);
    } finally {
        db.close();
    }
}

seedPhotos();
