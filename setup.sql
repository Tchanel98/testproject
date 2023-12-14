
 -- User and permission setup
CREATE USER 'tiyaUser'@'localhost' IDENTIFIED BY '!Qwerty1234';
CREATE USER 'admin'@'localhost' IDENTIFIED BY '!Qwerty1234';
GRANT SELECT ON tiysDtabase.* TO 'tiyaUser'@'localhost';
GRANT ALL PRIVILEGES ON tiysDtabase.* TO 'admin'@'localhost';
FLUSH PRIVILEGES;

-- Database and table setup
CREATE DATABASE tiysDtabase;
USE tiysDtabase;


-- Users table with extended fields
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- Storing hashed passwords
    role ENUM('member', 'instructor', 'admin') NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (role) -- Index for quicker role-based queries
);


-- Classes table with a reference to instructors
CREATE TABLE classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    instructor_id INT NOT NULL,
    description TEXT,
    max_participants INT NOT NULL,
    duration INT NOT NULL, -- Duration in minutes
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instructor_id) REFERENCES instructors(id),
    INDEX (start_time, end_time)  -- Index for time-based queries
);

-- Bookings table for class reservations
CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    class_id INT NOT NULL,
    booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('booked', 'cancelled') NOT NULL DEFAULT 'booked',
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    INDEX (booking_time) -- Index for booking time queries
);

-- Feedback
-- Instructors table
CREATE TABLE instructors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    bio TEXT,
    specialty VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

 
CREATE TABLE feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    user_id INT NOT NULL,
    rating INT NOT NULL,
    comment TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

 
-- Services table
CREATE TABLE services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics table
CREATE TABLE analytics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INT,
    details TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Stored procedures
DELIMITER //

CREATE PROCEDURE GetInstructorClasses(IN instructorID INT)
BEGIN
    SELECT * FROM classes WHERE instructor_id = instructorID;
END //
//

CREATE PROCEDURE CheckBookingConflict(IN userID INT, IN classID INT)
BEGIN
    SELECT COUNT(*) INTO @conflictCount
    FROM bookings
    WHERE user_id = userID
      AND class_id IN (SELECT id FROM classes WHERE start_time < (SELECT end_time FROM classes WHERE id = classID) AND end_time > (SELECT start_time FROM classes WHERE id = classID));

    SELECT @conflictCount AS conflictCount;
END //
//

CREATE PROCEDURE SummarizeParticipants()
BEGIN
    SELECT c.id, c.title, COUNT(b.user_id) as participant_count
    FROM classes c
    LEFT JOIN bookings b ON c.id = b.class_id
    GROUP BY c.id;
END //
//

DELIMITER ;


SELECT * FROM classes;
SELECT * FROM users;
SELECT * FROM instructors;
SELECT * FROM bookings;
SELECT * FROM feedback;
SELECT * FROM services;
SELECT * FROM analytics;


DESCRIBE  classes;
DESCRIBE  users;
DESCRIBE  instructors;
DESCRIBE  bookings;
DESCRIBE  feedback;
DESCRIBE  services;
DESCRIBE  analytics;

-- Insert Instructors
INSERT INTO users (username, password_hash, role, email, phone) VALUES 
('Instructor1', 'hash1', 'instructor', 'instructor1@example.com', '1234567890'),
('Instructor2', 'hash2', 'instructor', 'instructor2@example.com', '1234567891'),
('Instructor3', 'hash3', 'instructor', 'instructor3@example.com', '1234567892'),
('Instructor4', 'hash4', 'instructor', 'instructor4@example.com', '1234567893'),
('Instructor5', 'hash5', 'instructor', 'instructor5@example.com', '1234567894');

-- Insert Members
INSERT INTO users (username, password_hash, role, email, phone) VALUES 
('Member1', 'hash6', 'member', 'member1@example.com', '1234567895'),
('Member2', 'hash7', 'member', 'member2@example.com', '1234567896');

-- Insert Admin
INSERT INTO users (username, password_hash, role, email, phone) VALUES 
('Admin', 'hash8', 'admin', 'admin@example.com', '1234567897');

CREATE TABLE `sessions` (
    `session_id` varchar(128) COLLATE utf8mb4_bin NOT NULL,
    `expires` int(11) unsigned NOT NULL,
    `data` mediumtext COLLATE utf8mb4_bin,
    PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;


-- Assuming the first five users are instructors
INSERT INTO instructors (user_id, bio, specialty) VALUES 
(1, 'Bio of Instructor 1', 'Yoga'),
(2, 'Bio of Instructor 2', 'Pilates'),
(3, 'Bio of Instructor 3', 'Weightlifting'),
(4, 'Bio of Instructor 4', 'Cardio'),
(5, 'Bio of Instructor 5', 'Crossfit');


-- Insert Classes
INSERT INTO classes (title, instructor_id, description, max_participants, duration, start_time, end_time) VALUES 
('Yoga Basics', 1, 'Introduction to Yoga', 20, 60, '2023-01-01 08:00:00', '2023-01-01 09:00:00'),
('Advanced Pilates', 2, 'Challenging Pilates Course', 15, 60, '2023-01-01 10:00:00', '2023-01-01 11:00:00'),
('Weightlifting 101', 3, 'Basics of Weightlifting', 10, 90, '2023-01-02 08:00:00', '2023-01-02 09:30:00'),
('Cardio for Beginners', 4, 'Start your Cardio journey', 25, 60, '2023-01-02 10:00:00', '2023-01-02 11:00:00'),
('Crossfit Challenge', 5, 'Intense Crossfit Session', 12, 60, '2023-01-03 08:00:00', '2023-01-03 09:00:00');


INSERT INTO bookings (user_id, class_id, status) VALUES 
(6, 1, 'booked'),
(7, 2, 'booked');


INSERT INTO feedback (class_id, user_id, rating, comment) VALUES 
(1, 6, 5, 'Great class!'),
(2, 7, 4, 'Very informative.');


INSERT INTO services (name, description, price) VALUES 
('Personal Training', 'One-on-one personal training sessions', 50.00),
('Group Workout', 'Fun and engaging group workouts', 15.00);


INSERT INTO analytics (event_name, user_id, details) VALUES 
('Login', 1, 'Instructor1 logged in'),
('Page View', 6, 'Member1 viewed classes');
