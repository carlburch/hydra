/*
 * Copyright (c) 2014 Carl Burch
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
var bcrypt = require('bcrypt');
var async = require('async');
var hy_file = require('./hy_file');

function newErrorResponse(value) {
    if (value === undefined) {
        return { ok: false, message: 'Unknown error [undefined]' };
    } else if (value === null) {
        return { ok: false, message: 'Unknown error [null]' };
    } else if (typeof value === 'string') {
        return { ok: false, message: value };
    } else if (value.hasOwnProperty('code')) {
        return { ok: false, message: value.code };
    } else {
        console.log('unknown error', value); //OK
        return { ok: false, message: 'Unknown error' };
    }
}

function validateLogin(login) {
    if (login === '') {
        return 'Login ID must not be empty.';
    } else if (!/^[a-zA-Z0-9-']*$/.test(login)) {
        return 'Login ID can contain only letters and digits.';
    } else {
        return null;
    }
}

function validatePassword(password) {
    if (password === '') {
        return 'Password must not be empty.';
    } else if (password.length < 4) {
        return 'Password is too short.';
    } else {
        return null;
    }
}

function validateFirst(first) {
    if (first === '') {
        return 'First name must be provided.';
    } else {
        return null;
    }
}

function validateLast(last) {
    if (last === '') {
        return 'Last name must be provided.';
    } else {
        return null;
    }
}

function validateEmail(email) {
    if (email === '') {
        return 'E-mail address must be provided.';
    } else if (!/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/.test(email)) {
        return 'E-mail address must have form username@organization.domain.';
    } else {
        return null;
    }
}

function createSessionTransaction(req, userId, onCreated) {
    var sessionId;
    async.waterfall([
        function (next) {
            req.db.beginTransaction(next);
        },
        function (next) {
            req.db.generateRandomUniqueInt('sessions', 'sessionid', next);
        },
        function (foundSessionId, next) {
            sessionId = foundSessionId;
            var now = req.db.now;
            var offs;
            if (req.db.isMySql) {
                offs = 'DATE_ADD(' + now + ', INTERVAL 3 HOUR)';
            } else {
                offs = 'DATETIME("now", "+3 hours", "utc")';
            }
            req.db.execute('INSERT INTO sessions (sessionid, userid, expires) '
                + 'VALUES (?, ?, ' + offs + ')',
                [sessionId, userId], next);
        },
        function (next) {
            req.db.commit(next);
        },
        function (next) {
            req.session.sessionId = sessionId;
            onCreated(null, sessionId);
        }
    ], function (err) {
        if (err !== null) {
            onCreated(err, 0);
        }
    });
}

function register(req, res) {
    var course = req.body.course;
    var login = req.body.login;
    var password = req.body.password;
    var first = req.body.first;
    var last = req.body.last;
    var email = req.body.email;

    var error = (
        validateLogin(login) ||
        validatePassword(password) ||
        validateFirst(first) ||
        validateLast(last) ||
        validateEmail(email));
    if (error !== null) {
        res.send(newErrorResponse(error));
        return;
    }

    var passwordHash;
    var userId;
    async.waterfall([
        function (next) {
            hy_file.getCourse(course, null, next);
        },
        function (courseData, next) {
            bcrypt.genSalt(10, next);
        },
        function (salt, next) {
            bcrypt.hash(password, salt, next);
        },
        function (hash, next) {
            passwordHash = hash;
            req.db.beginTransaction(next);
        },
        function (next) {
            req.db.forAll('SELECT login FROM users WHERE course = ? AND login = ?',
                [course, login], next);
        },
        function (found, next) {
            if (found.length !== 0) {
                next('Login ID is already being used.', []);
            } else {
                req.db.generateRandomUniqueInt('users', 'userid', next);
            }
        },
        function (foundUserId, next) {
            userId = foundUserId;
            req.db.execute('INSERT INTO users'
                + ' (course, userid, login, password, firstname, lastname, email)'
                + ' VALUES (?, ?, ?, ?, ?, ?, ?)',
                [course, userId, login, passwordHash, first, last, email], next);
        },
        function (next) {
            req.db.commit(next);
        },
        function (next) {
            createSessionTransaction(req, userId, next);
        },
        function (sessionId, next) {
            req.user = {
                userId: userId,
                course: course,
                login: login,
                first: first,
                last: last,
                email: email,
                editor: false
            };
            res.send({
                ok: true,
                userId: userId,
                course: course,
                login: login,
                first: first,
                last: last,
                email: email,
                editor: false
            });
            next(null);
        }
    ], function (err) {
        if (err !== null) {
            req.db.rollback(function (suberr) {
                res.send(newErrorResponse(err));
            });
        }
    });
}

function login(req, res) {
    var course = req.body.course;
    var login = req.body.login;
    var enteredPassword = req.body.password;

    var record;
    async.waterfall([
        function (next) {
            hy_file.getCourse(course, null, next);
        },
        function (courseData, next) {
            req.db.forAll('SELECT userid, login, password, firstname, '
                +          ' lastname, email, editor'
                + ' FROM users WHERE course = ? AND login = ?',
                [course, login], next);
        },
        function (found, next) {
            if (found.length === 0) {
                next('Login ID does not exist.', []);
            } else {
                record = found[0];
                bcrypt.compare(enteredPassword, record.password, next);
            }
        },
        function (match, next) {
            if (match) {
                createSessionTransaction(req, record.userid, next);
            } else {
                next('Password does not match');
            }
        },
        function (sessionId, next) {
            req.user = {
                userId: record.userid,
                login: record.login,
                first: record.firstname,
                last: record.lastname,
                email: record.email,
                editor: record.editor
            };
            res.send({
                ok: true,
                userId: record.userid,
                login: record.login,
                first: record.firstname,
                last: record.lastname,
                email: record.email,
                editor: record.editor === 1
            });
            next(null);
        }
    ], function (err) {
        if (err !== null) {
            res.send(newErrorResponse(err));
        }
    });
}

function logout(req, res) {
    var sessionId = req.session && req.session.sessionId;
    if (sessionId || sessionId === 0) {
        req.db.execute('DELETE FROM sessions WHERE sessionid = ?',
            [sessionId],
            function (err) {
                res.send({ ok: true, login: true });
            });
    } else {
        res.send({ ok: true, login: true });
    }
}

function validateSession(req, res, next) {
    if (req.session && req.session.sessionId) {
        var sessionId = req.session.sessionId;

        var now = req.db.now;
        var sql = ('SELECT users.userid AS userid, course, login, '
            +        'firstname, lastname, email, editor, '
            +        now + ' > sessions.expires AS expired '
            + 'FROM users JOIN sessions ON users.userid = sessions.userid '
            + 'WHERE sessions.sessionid = ?');

        req.db.forAll(sql, [sessionId],
            function (err, rows) {
                if (err !== null) {
                    res.send({ ok: false, login: true, message: 'Error retrieving session.' });
                } else if (rows.length == 0) {
                    res.send({ ok: false, login: true, message: 'Your session has expired. Please log in again.' });
                } else if (rows[0].expired) {
                    res.send({ ok: false, login: true, message: 'Your session has expired. Please log in again. [2]' });
                } else {
                    var record = rows[0];
                    req.user = {
                        userId: record.userid,
                        course: record.course,
                        login: record.login,
                        first: record.firstname,
                        last: record.lastname,
                        email: record.email,
                        editor: record.editor === 1
                    };
                    next();
                }
            });
    } else {
        res.send({ ok: false, login: true, message: 'You must log in to continue.' });
    }
}

exports.validateLogin = validateLogin;
exports.validatePassword = validatePassword;
exports.validateFirst = validateFirst;
exports.validateLast = validateLast;
exports.validateEmail = validateEmail;
exports.register = register;
exports.login = login;
exports.logout = logout;
exports.validateSession = validateSession;
