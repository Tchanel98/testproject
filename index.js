const express = require('express');
const axios = require('axios');
const path = require('path');
const mysql = require('mysql');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bcrypt = require('bcrypt');
const util = require('util');
const fs = require('fs');
const bodyParser = require('body-parser');


require('dotenv').config();



const ejs = require('ejs');

const saltRounds = 10;
const app = express();
const port = process.env.PORT || 3000;


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// MySQL database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});
db.connect((err) => {
    if (err) throw err;
    console.log('Connected to the MySQL Server');
});

// Session configuration
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    store: new MySQLStore({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE
    })
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

// const sessionStore = new MySQLStore(sessionStoreOptions);

// app.use(session({
//     secret: '$2b$10$Ups/kkkt5hRAlzPzqfPULemfZbnSC81KlAaeQd8IjhfbbYQR/C9eq', // Replace with a real secret key
//     resave: false,
//     saveUninitialized: false,
//     store: sessionStore
// }));


db.query = util.promisify(db.query); // Promisify for use with 



app.get('/weather', async (req, res) => {
    const city = req.query.city || 'London'; // Default to London if no city is provided
    const apiKey = '43a4340724857666ff85c04371e8cf2e'; // Replace with your API key
    const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

    try {
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        res.status(500).send('Error fetching weather data');
    }
});


app.get('/register', (req, res) => {
    res.render('register.ejs');
});


app.post('/register', async (req, res) => {
    const { username, password, email, phone, role } = req.body;

    if (!['member', 'instructor', 'admin'].includes(role)) {
        return res.status(400).send('Invalid role selected');
    }

    try {
        const userCheckQuery = 'SELECT * FROM users WHERE username = ? OR email = ?';
        db.query(userCheckQuery, [username, email], async (err, userExists) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Error checking user existence');
            }
            if (userExists.length > 0) {
                return res.status(400).send('User already exists');
            }

            const hashedPassword = await bcrypt.hash(password, saltRounds);
            const insertUserQuery = 'INSERT INTO users (username, password_hash, role, email, phone) VALUES (?, ?, ?, ?, ?)';
            db.query(insertUserQuery, [username, hashedPassword, role, email, phone], (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Error in registration');
                }
                res.redirect('/login');
            });
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error in registration');
    }
});




app.get('/login', (req, res) => {
    res.render('login.ejs');
});


app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const userQuery = 'SELECT * FROM users WHERE username = ?';
    db.query(userQuery, [username], async (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error in login');
        }
        if (results.length === 0) {
            return res.status(401).send('Invalid username or password');
        }

        const user = results[0];
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).send('Invalid username or password');
        }

        req.session.userId = user.id;
        req.session.userRole = user.role; // Save user role in session
        res.redirect('/profile');
    });
});


// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/login');
    });
});


app.get('/profile', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const userDetails = await db.query('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        if (userDetails.length === 0) {
            return res.status(404).send('User not found');
        }
        const user = userDetails[0];

        // Check for profile picture
        let profilePicPath = path.join(__dirname, 'public', 'img', user.username + '.jpg');
        let hasProfilePic = fs.existsSync(profilePicPath);

        let classes = [];
        let feedback = [];

        if (user.role === 'instructor') {
            classes = await db.query('SELECT * FROM classes WHERE instructor_id = ?', [user.id]);
        } else {
            const bookings = await db.query('SELECT * FROM bookings WHERE user_id = ?', [user.id]);
            const classIds = bookings.map(b => b.class_id);
            if (classIds.length > 0) {
                classes = await db.query('SELECT * FROM classes WHERE id IN (?)', [classIds]);
            }
        }

        feedback = await db.query('SELECT * FROM feedback WHERE user_id = ?', [user.id]);

        res.render('profile', { user, classes, feedback, hasProfilePic });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching profile details');
    }
});


// Routes
app.get('/', (req, res) => {
    res.render('index.ejs');
});

app.get('/about', (req, res) => {
    res.render('about.ejs');
});

app.get('/contact', (req, res) => {
    res.render('contact.ejs');
});

app.get('/feedback', (req, res) => {
    res.render('feedback.ejs');
});

app.post('/feedback', (req, res) => {
    const { classId, userId, rating, comment } = req.body;
    const query = "INSERT INTO feedback (class_id, user_id, rating, comment) VALUES (?, ?, ?, ?)";
    db.query(query, [classId, userId, rating, comment], (err, result) => {
        if (err) res.status(500).send('Error submitting feedback');
        else res.send('Feedback submitted successfully');
    });
});

app.get('/services', (req, res) => {
    res.render('services.ejs');
});



app.get('/instructors', async (req, res) => {
    try {
        const instructorQuery = `
            SELECT users.username, instructors.bio, instructors.specialty
            FROM instructors
            JOIN users ON instructors.user_id = users.id
        `;
        const instructors = await db.query(instructorQuery);
        res.render('instructors', { instructors });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error fetching instructors');
    }
});

app.get('/becomeinstructor', (req, res) => {
    // Ensure the user is logged in and redirect if not
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        // Render a page with a form for users to sign up to be an instructor
        res.render('becomeinstructor.ejs');
    }
});


// Post route to handle "Become an Instructor" form submission
app.post('/becomeinstructor', async (req, res) => {
    const { bio, specialty } = req.body;
    const userId = req.session.userId;

    try {
        // Start a transaction
        await db.query('START TRANSACTION');

        // Insert new instructor data into the database
        const insertInstructorQuery = 'INSERT INTO instructors (user_id, bio, specialty) VALUES (?, ?, ?)';
        await db.query(insertInstructorQuery, [userId, bio, specialty]);

        // Update the user's role to 'instructor'
        const updateUserRoleQuery = 'UPDATE users SET role = ? WHERE id = ?';
        await db.query(updateUserRoleQuery, ['instructor', userId]);

        // Commit the transaction
        await db.query('COMMIT');

        // Update the session role
        req.session.userRole = 'instructor';

        res.redirect('/instructors');
    } catch (err) {
        // Rollback the transaction in case of error
        await db.query('ROLLBACK');
        console.error(err);
        res.status(500).send('Error becoming an instructor');
    }
});


app.get('/createaclass', (req, res) => {
    // Ensure the user is logged in and redirect if not
    if (!req.session.userId) {
        res.redirect('/login');
    } else {
        // Render a page with a form for users to sign up to be an instructor
        res.render('createaclass.ejs');
    }
});


app.post('/createaclass', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'instructor') {
        return res.status(403).send('Unauthorized');
    }

    const { title, description, maxParticipants, duration, startTime, endTime } = req.body;
    const instructorId = req.session.userId; // Assuming instructor's user ID is in the session

    try {
        const insertClassQuery = `
            INSERT INTO classes (title, instructor_id, description, max_participants, duration, start_time, end_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await db.query(insertClassQuery, [title, instructorId, description, maxParticipants, duration, startTime, endTime]);
        res.redirect('/classes');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error creating class');
    }
});



app.get('/classes', (req, res) => {
    const query = `
    SELECT classes.*, users.username as instructor_name
    FROM classes
    JOIN instructors ON classes.instructor_id = instructors.id
    JOIN users ON instructors.user_id = users.id;
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching classes:", err);
            return res.status(500).send('Error fetching classes');
        }

        // Log the results and user ID
        console.log("Classes data:", results);
        console.log("User ID:", req.session.userId);

        // Send data to the front end
        res.render('classes.ejs', { classes: results, userId: req.session.userId });
    });
});



app.get('/bookclass', (req, res) => {
    const classId = req.query.classId; // Get class ID from the query parameters

    // SQL query to fetch the specific class details
    const query = `
    SELECT classes.*, users.username as instructor_name
    FROM classes
    JOIN instructors ON classes.instructor_id = instructors.id
    JOIN users ON instructors.user_id = users.id
    WHERE classes.id = ?;
    `;

    // Execute the query with the classId
    db.query(query, [classId], (err, results) => {
        if (err) {
            console.error("Error fetching class:", err);
            return res.status(500).send('Error fetching class');
        }

        // Assuming results is an array with one element for the specific class
        const classData = results[0] || {};
        console.log(classData)
        // Send data to the front end
        res.render('bookclass', { classData, userId: req.query.userId });
    });
});

app.post('/bookClass', (req, res) => {
    const { classId, userId } = req.body;

    // SQL query to insert a booking record
    const insertQuery = `
    INSERT INTO bookings (user_id, class_id, status)
    VALUES (?, ?, 'booked');
  `;

    // Execute the query
    db.query(insertQuery, [userId, classId], (err, result) => {
        if (err) {
            console.error("Error booking class:", err);
            return res.status(500).json({ success: false, message: 'Error booking class' });
        }

        // Return a success response
        res.json({ success: true, message: 'Class booked successfully' });
    });
});



app.post('/api/users', (req, res) => {
    const { username, password, email, role } = req.body;
    const hashedPassword = hashPassword(password); // Use a hashing function like bcrypt
    const query = "INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)";
    db.query(query, [username, hashedPassword, email, role], (err, result) => {
        if (err) res.status(500).send('Error in creating user');
        else res.send({ userId: result.insertId });
    });
});

app.get('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const query = "SELECT id, username, email, role FROM users WHERE id = ?";
    db.query(query, [userId], (err, results) => {
        if (err || results.length === 0) res.status(404).send('User not found');
        else res.json(results[0]);
    });
});


app.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { username, email, role } = req.body;
    const query = "UPDATE users SET username = ?, email = ?, role = ? WHERE id = ?";
    db.query(query, [username, email, role, userId], (err, result) => {
        if (err) res.status(500).send('Error updating user');
        else res.send('User updated successfully');
    });
});


app.get('/api/classes', (req, res) => {
    const query = "SELECT * FROM classes";
    db.query(query, (err, results) => {
        if (err) res.status(500).send('Error fetching classes');
        else res.json(results);
    });
});


app.post('/api/classes', (req, res) => {
    const { title, instructorId, description, maxParticipants, duration, startTime, endTime } = req.body;
    const query = "INSERT INTO classes (title, instructor_id, description, max_participants, duration, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)";
    db.query(query, [title, instructorId, description, maxParticipants, duration, startTime, endTime], (err, result) => {
        if (err) res.status(500).send('Error in adding class');
        else res.send({ classId: result.insertId });
    });
});



app.put('/api/classes/:id', (req, res) => {
    const classId = req.params.id;
    const { title, description, maxParticipants, duration, startTime, endTime } = req.body;
    const query = "UPDATE classes SET title = ?, description = ?, max_participants = ?, duration = ?, start_time = ?, end_time = ? WHERE id = ?";
    db.query(query, [title, description, maxParticipants, duration, startTime, endTime, classId], (err, result) => {
        if (err) res.status(500).send('Error updating class');
        else res.send('Class updated successfully');
    });
});


app.delete('/api/classes/:id', (req, res) => {
    const classId = req.params.id;
    const query = "DELETE FROM classes WHERE id = ?";
    db.query(query, [classId], (err, result) => {
        if (err) res.status(500).send('Error deleting class');
        else res.send('Class deleted successfully');
    });
});


app.post('/api/bookings', (req, res) => {
    const { userId, classId } = req.body;
    const query = "INSERT INTO bookings (user_id, class_id) VALUES (?, ?)";
    db.query(query, [userId, classId], (err, result) => {
        if (err) res.status(500).send('Error creating booking');
        else res.send({ bookingId: result.insertId });
    });
});


app.get('/api/bookings/:id', (req, res) => {
    const bookingId = req.params.id;
    const query = "SELECT * FROM bookings WHERE id = ?";
    db.query(query, [bookingId], (err, results) => {
        if (err || results.length === 0) res.status(404).send('Booking not found');
        else res.json(results[0]);
    });
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});





































































































// about
// contact
// register
// login
// services
// classes
// book-class
// profile


//  npm i bcrypt dotenv ejs express express-mysql-session express-session fs mysql path util










// app.get('/bookclass', (req, res) => {
//     // Updated query to join with the schedules table
//     const query = `
//     SELECT classes.*, users.username as instructor_name, schedules.*
//     FROM classes
//     JOIN instructors ON classes.instructor_id = instructors.id
//     JOIN users ON instructors.user_id = users.id
//     JOIN schedules ON instructors.id = schedules.instructor_id;
//     `;

//     // Execute the query
//     db.query(query, (err, results) => {
//         if (err) {
//             console.error("Error fetching classes and schedules:", err);
//             return res.status(500).send('Error fetching classes and schedules');
//         }

//         // Log the results and user ID
//         console.log("Classes and Schedules data:", results);
//         console.log("User ID:", req.session.userId);

//         // Send data to the front end
//         res.render('bookclass.ejs', { classes: results, userId: req.session.userId });
//     });
// });

// app.get('/bookclass', (req, res) => {
//     if (!req.session.userId) {
//         return res.redirect('/login');
//     }

//     const classId = req.query.classId;
//     const session = req.session.userId // assuming you want to fetch user-specific details

//     // Fetch class details
//     const classQuery = "SELECT classes.*, users.username as instructor_name FROM classes JOIN users ON classes.instructor_id = users.id WHERE classes.id = ?";

//     db.query(classQuery, [classId], (classErr, classResult) => {
//         if (classErr) {
//             console.error("Error fetching class details:", classErr);
//             return res.status(500).send('Error fetching class details');
//         }

//         // Fetch instructor schedule
//         const instructorId = classResult[0].instructor_id;
//         const scheduleQuery = "SELECT * FROM classes WHERE instructor_id = ?";
//         db.query(scheduleQuery, [instructorId], (scheduleErr, scheduleResult) => {
//             if (scheduleErr) {
//                 console.error("Error fetching instructor schedule:", scheduleErr);
//                 return res.status(500).send('Error fetching instructor schedule');
//             }
//             console.log(classResult[0]);
//             res.render('bookclass.ejs', {
//                 classes: classResult[0],
//                 schedule: scheduleResult,
//                 userId: session
//             });

//         });
//     });
// });

// app.post('/bookclass', (req, res) => {
//     if (!req.session.userId) {
//         return res.status(403).send('User not logged in');
//     }

//     const classId = req.body.classId;
//     const userId = req.session.userId; // Use session userId for security

//     // Check for booking conflicts before proceeding
//     // Implement logic based on your database schema and requirements

//     // Insert booking into the database
//     const insertBooking = "INSERT INTO bookings (user_id, class_id) VALUES (?, ?)";
//     db.query(insertBooking, [userId, classId], (err, result) => {
//         if (err) {
//             console.error("Error booking class:", err);
//             return res.status(500).send('Error in booking class');
//         }
//         res.send('Class booked successfully');
//     });
// });



// app.post('/book-class', (req, res) => {
//     if (!req.session.userId) {
//         return res.status(403).send('User not logged in');
//     }

//     const classId = req.body.classId;
//     const userId = req.session.userId;

//     const query = "INSERT INTO bookings (user_id, class_id) VALUES (?, ?)";

//     db.query(query, [userId, classId], (err, result) => {
//         if (err) {
//             console.error("Error booking class:", err);
//             return res.status(500).send('Error in booking class');
//         }
//         res.send('Class booked successfully');
//     });
// });





// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

// app.get('/book-class', (req, res) => {
//     if (!req.session.userId) {
//         return res.redirect('/login');
//     }

//     const classId = req.query.classId;

//     // Query to fetch the selected class details
//     const classQuery = "SELECT * FROM classes WHERE id = ?";
//     // Query to fetch the instructor's schedule
//     const scheduleQuery = "SELECT * FROM classes WHERE instructor_id = (SELECT instructor_id FROM classes WHERE id = ?)";

//     // Execute both queries
//     db.query(classQuery, [classId], (classErr, classResult) => {
//         if (classErr) {
//             console.error("Error fetching class details:", classErr);
//             return res.status(500).send('Error fetching class details');
//         }

//         db.query(scheduleQuery, [classId], (scheduleErr, scheduleResult) => {
//             if (scheduleErr) {
//                 console.error("Error fetching instructor schedule:", scheduleErr);
//                 return res.status(500).send('Error fetching instructor schedule');
//             }

//             // Render the book-class page with class details and instructor schedule
//             res.render('book-class.ejs', {
//                 class: classResult[0],
//                 schedule: scheduleResult,
//                 userId: req.session.userId
//             });
//         });
//     });
// });

// app.post('/book-class', (req, res) => {
//     if (!req.session.userId) {
//         return res.status(403).send('User not logged in');
//     }

//     const classId = req.body.classId;
//     const userId = req.session.userId;

//     const query = "INSERT INTO bookings (user_id, class_id) VALUES (?, ?)";

//     db.query(query, [userId, classId], (err, result) => {
//         if (err) {
//             console.error("Error booking class:", err);
//             return res.status(500).send('Error in booking class');
//         }
//         res.send('Class booked successfully');
//     });
// });











// app.post('/book-class', (req, res) => {
//     if (!req.session.userId) {
//         return res.status(403).send('User not logged in');
//     }

//     const classId = req.body.classId;
//     const userId = req.session.userId; // Taking userId from session
//     const query = "INSERT INTO bookings (user_id, class_id) VALUES (?, ?)";

//     db.query(query, [userId, classId], (err, result) => {
//         if (err) {
//             console.error("Error booking class:", err);
//             return res.status(500).send('Error in booking class');
//         }
//         res.send('Class booked successfully');
//     });
// });




// app.get('/profile', (req, res) => {
//     if (!req.session.userId) {
//         res.redirect('/login');
//         return;
//     }
//     // Display user profile information
// });


// // Profile Route
// app.get('/profile', (req, res) => {
//     if (!req.session.userId) {
//         return res.redirect('/login');
//     }

//     const userQuery = 'SELECT * FROM users WHERE id = ?';
//     db.query(userQuery, [req.session.userId], (err, result) => {
//         if (err) {
//             console.error(err);
//             return res.status(500).send('Error fetching profile');
//         }
//         if (result.length === 0) {
//             return res.status(404).send('User not found');
//         }

//         const user = result[0];
//         res.render('profile', { user });
//     });
// });

// app.get('/profile', async (req, res) => {
//     if (!req.session.userId) {
//         return res.redirect('/login');
//     }

//     try {
//         const userDetails = await db.query('SELECT * FROM users WHERE id = ?', [req.session.userId]);
//         if (userDetails.length === 0) {
//             return res.status(404).send('User not found');
//         }
//         const user = userDetails[0];

//         let classes = [];
//         let feedback = [];

//         if (user.role === 'instructor') {
//             classes = await db.query('SELECT * FROM classes WHERE instructor_id = ?', [user.id]);
//         } else {
//             const bookings = await db.query('SELECT * FROM bookings WHERE user_id = ?', [user.id]);
//             const classIds = bookings.map(b => b.class_id);
//             if (classIds.length > 0) {
//                 classes = await db.query('SELECT * FROM classes WHERE id IN (?)', [classIds]);
//             }
//         }

//         feedback = await db.query('SELECT * FROM feedback WHERE user_id = ?', [user.id]);

//         res.render('profile', { user, classes, feedback });
//     } catch (err) {
//         console.error(err);
//         res.status(500).send('Error fetching profile details');
//     }
// });



// app.post('/login', (req, res) => {
//     const { username, password } = req.body;

//     const userQuery = 'SELECT * FROM users WHERE username = ?';
//     db.query(userQuery, [username], async (err, result) => {
//         if (err) {
//             console.error(err);
//             return res.status(500).send('Error in login');
//         }
//         if (result.length === 0) {
//             return res.status(401).send('Invalid username or password');
//         }

//         const user = result[0];
//         const passwordMatch = await bcrypt.compare(password, user.password_hash);
//         if (!passwordMatch) {
//             return res.status(401).send('Invalid username or password');
//         }

//         req.session.userId = user.id;
//         res.redirect('/profile');
//     });
// });


// async / await


// app.get('/register', (req, res) => {
//     res.render('register.ejs');
// });

// app.post('/register', (req, res) => {
//     // Example logic for user registration
//     const { username, password } = req.body; // Assuming these fields exist in your form
//     const query = "INSERT INTO users (username, password) VALUES (?, ?)";
//     db.query(query, [username, password], (err, result) => {
//         if (err) {
//             res.status(500).send('Error in registration');
//         } else {
//             res.redirect('/login');
//         }
//     });
// });


// app.post('/login', (req, res) => {
//     const { username, password } = req.body;
//     const query = "SELECT * FROM users WHERE username = ? AND password = ?";
//     db.query(query, [username, password], (err, results) => {
//         if (err || results.length === 0) {
//             res.status(401).send('Invalid credentials');
//         } else {
//             req.session.userId = results[0].id; // Save user ID in session
//             res.redirect('/profile');
//         }
//     });
// });

// app.get('/register/member', (req, res) => {
//     res.render('register_member.ejs');
// });

// app.get('/register/instructor', (req, res) => {
//     res.render('register_instructor.ejs');
// });

// app.get('/logout', (req, res) => {
//     req.session.destroy();
//     res.redirect('/');
// });



// app.get('/classes', (req, res) => {
//     const query = `
//     SELECT classes.*, users.username as instructor_name
//     FROM classes
//     JOIN instructors ON classes.instructor_id = instructors.id
//     JOIN users ON instructors.user_id = users.id;
//     `;
//     // const query2 = `
//     // SELECT classes.*, users.username as instructor_name
//     // FROM classes
//     // JOIN instructors ON classes.instructor_id = instructors.id
//     // JOIN users ON instructors.user_id = users.id;
//     // `;
//     const query3 = `
//     SELECT classes.*, users.username as instructor_name
//     FROM classes
//     JOIN instructors ON classes.instructor_id = instructors.id
//     JOIN users ON instructors.user_id = users.id;
//     `;


//     max_participants
//     duration
//     start_time
//     end_time
//     created_at

//     db.query(query, (err, results) => {
//         if (err) {
//             console.error("Error fetching classes:", err);
//             return res.status(500).send('Error fetching classes');
//         }
//         uID = req.session.userId;

//         res.render('classes.ejs', { classes: results, userId: uID});
//     });
// });



// app.get('/bookclass', (req, res) => {
//     const query = `
//     SELECT classes.*, users.username as instructor_name
//     FROM classes
//     JOIN instructors ON classes.instructor_id = instructors.id
//     JOIN users ON instructors.user_id = users.id;
//     `;

//     const classQuery = "SELECT classes.*, users.username as instructor_name FROM classes JOIN users ON classes.instructor_id = users.id WHERE classes.id = ?";

//     db.query(query, (err, results) => {
//         if (err) {
//             console.error("Error fetching classes:", err);
//             return res.status(500).send('Error fetching classes');
//         }

//         // Log the results and user ID
//         console.log("Classes data:", results);
//         console.log("User ID:", req.session.userId);

//         // Send data to the front end
//         res.render('bookclass.ejs', { classes: results, userId: req.session.userId });
//     });
// });
