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
var hydra_session = require('./hydra_session');

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

function getList(req, res) {
    if (req.user.editor) {
        var sql = ('SELECT userid, login, firstname, lastname, email, editor, visible '
            + 'FROM users '
            + 'WHERE course = ? '
            + 'ORDER BY UPPER(lastname), UPPER(firstname)');
        req.db.forAll(sql, [req.user.course],
            function (err, rows) {
                if (err !== null) {
                    res.send({ ok: false, message: 'Error retrieving data.' });
                } else {
                    var users = [];
                    rows.forEach(function (row) {
                        users.push({ userId: row.userid,
                            login: row.login, first: row.firstname,
                            last: row.lastname, email: row.email,
                            editor: row.editor === 1,
                            visible: row.visible === 1 });
                    });
                    res.send({ ok: true, editor: req.user.editor, users: users });
                }
            });
    } else {
        res.send({ ok: false, message: 'Only instructors may review the user list.' });
    }
}

function getProfile(req, res) {
    if (!req.user.editor && req.user.userId !== req.query.id) {
        res.send({ ok: false, message: 'Only instructors may review a user profile.' });
        return;
    } else if (!/^[0-9]+$/.test(req.query.id)) {
        res.send({ ok: false, message: 'Invalid user id' });
        return;
    }

    var userId = parseInt(req.query.id, 10);

    var sql = ('SELECT userid, login, firstname, lastname, email, editor '
        + 'FROM users WHERE userid = ?');
    req.db.forAll(sql, [userId],
        function (err, rows) {
            if (err !== null) {
                res.send({ ok: false, message: 'Error retrieving data.' });
            } else if (rows.length == 0) {
                res.send({ ok: false, message: 'User ID unknown.' });
            } else {
                var user = rows[0];
                res.send({ ok: true, userId: user.userid,
                        login: user.login, first: user.firstname,
                        last: user.lastname, email: user.email,
                        editor: user.editor === 1 });
            }
        });
}

function updateProfile(req, res) {
    if (!req.user.editor && req.user.userId !== req.body.id) {
        res.send({ ok: false, message: 'Only instructors may update a user profile.' });
        return;
    } else if (!/^[0-9]+$/.test(req.body.id)) {
        res.send({ ok: false, message: 'Invalid user id' });
        return;
    }

    var userId = parseInt(req.body.id, 10);
    var oldPassword = req.body.oldpassword || '';
    var newPassword = req.body.password || '';
    var first = req.body.first || '';
    var last = req.body.last || '';
    var email = req.body.email || '';
    var editor = req.body.editor == '1' ? 1 : 0;

    var checkOldPassword = !req.user.editor;
    var changePassword = newPassword !== '';
    var changeFirst = first !== '';
    var changeLast = last !== '';
    var changeEmail = email !== '';
    var changeEditor = req.user.editor && req.body.editor && req.body.editor !== '';

    var error = (
        changePassword && hydra_session.validatePassword(password) ||
        changeFirst && hydra_session.validateFirst(first) ||
        changeLast && hydra_session.validateLast(last) ||
        changeEmail && hydra_session.validateEmail(email));
    if (error !== null) {
        res.send(newErrorResponse(error));
        return;
    }
    if (!(changePassword || changeFirst || changeLast || changeEmail)) {
        res.send({ ok: false, message: 'Nothing to change.' });
    }

    var oldHash;
    var newHash;
    async.waterfall([
        function (next) {
            if (changePassword) {
                bcrypt.genSalt(10, next);
            } else {
                next(null, '');
            }
        },
        function (salt, next) {
            if (changePassword) {
                bcrypt.hash(newPassword, salt, next);
            } else {
                next(null, '');
            }
        },
        function (hash, next) {
            newHash = hash;
            req.db.beginTransaction(next);
        },
        function (next) {
            req.db.forAll('SELECT password, firstname, lastname, email, editor'
                + ' FROM users WHERE userid = ?',
                [userId], next);
        },
        function (found, next) {
            if (found.length === 0) {
                next('Unknown user.', []);
                return;
            }

            var record = found[0];
            changeFirst = changeFirst && first !== record.firstname;
            changeLast = changeLast && last !== record.lastname;
            changeEmail = changeEmail && email !== record.email;
            changeEditor = changeEditor && editor !== record.editor;

            if (checkOldPassword) {
                oldHash = record.password;
                bcrypt.compare(oldPassword, record.password, next);
            } else {
                next(null, true);
            }
        },
        function (passwordMatch, next) {
            if (!passwordMatch) {
                next('Current password is not correct.');
            }
            var sep = 'SET';
            var sql = 'UPDATE users '
            var values = [];
            if (changePassword) {
                sql += sep + ' password = ?';
                sep = ',';
                values.push(newHash);
            }
            if (changeFirst) {
                sql += sep + ' firstname = ?';
                sep = ',';
                values.push(first);
            }
            if (changeLast) {
                sql += sep + ' lastname = ?';
                sep = ',';
                values.push(last);
            }
            if (changeEmail) {
                sql += sep + ' email = ?';
                sep = ',';
                values.push(email);
            }
            if (changeEditor) {
                sql += sep + ' editor = ?';
                sep = ',';
                values.push(editor);
            }
            if (values.length == 0) {
                next('Nothing to change.', null);
            } else {
                sql += ' WHERE userid = ?';
                values.push(userId);
                req.db.execute(sql, values, next);
            }
        },
        function (next) {
            req.db.commit(next);
        },
        function (next) {
            res.send({ ok: true });
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

function toggleVisibility(req, res) {
    if (!req.user.editor && req.user.userId !== req.body.id) {
        res.send({ ok: false, message: 'Only instructors may update user visibility.' });
        return;
    } else if (!/^[0-9]+$/.test(req.body.id)) {
        res.send({ ok: false, message: 'Invalid user id' });
        return;
    }

    var userId = parseInt(req.body.id, 10);

    var result;
    async.waterfall([
        function (next) {
            req.db.beginTransaction(next);
        },
        function (next) {
            req.db.forAll('SELECT visible FROM users WHERE userid = ?',
                [userId], next);
        },
        function (found, next) {
            if (found.length === 0) {
                next('Unknown user.', []);
                return;
            }

            result = found[0].visible !== 1;
            req.db.execute('UPDATE users SET visible = ? WHERE userid = ?',
                [result, userId], next);
        },
        function (next) {
            req.db.commit(next);
        },
        function (next) {
            res.send({ ok: true, value: result });
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

exports.getList = getList;
exports.getProfile = getProfile;
exports.updateProfile = updateProfile;
exports.toggleVisibility = toggleVisibility;
