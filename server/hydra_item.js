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
var async = require('async');
var py_execute = require('./py_execute');
var hy_file = require('./hy_file');

function newErrorResponse(value) {
    if (value === null) {
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

function execute(req, res) {
    var userId = req.user.userId;
    var lessonId = req.body.lessonid;
    var itemId = req.body.id;
    var code = req.body.code;

    if (code === '') {
        res.send(newErrorResponse('Code is empty - there\'s nothing to test!'));
        return;
    } else if (!code) {
        res.send(newErrorResponse('Internal error: No code proided'));
        return;
    }

    async.waterfall([
        function (next) {
            var attrs = {
                problem: null,
                numiters: '1',
                precode: '',
                usedvars: '',
                solution: '',
                postcode: ''
            };
            hy_file.getProblem(req.user.course, lessonId, itemId,
                attrs, next);
        },
        function (item, next) {
            var data = {
                userCode: code,
                numIters: parseInt(item.numiters, 10),
                preCode: item.precode,
                usedVars: item.usedvars,
                solutionCode: item.solution,
                postCode: item.postcode
            };
            py_execute.run(data, next);
        },
        function (json, next) {
            res.send(json);
            jsonObj = JSON.parse(json);
            var verdict = jsonObj.hasOwnProperty('verdict') ? jsonObj.verdict : -2;
            if (req.user.editor && req.body.log === false) {
                next(null);
            } else {
                req.db.execute('INSERT INTO submissions '
                    + '(lessonid, probid, userid, code, verdict) '
                    + 'VALUES (?, ?, ?, ?, ?)',
                    [lessonId, itemId, userId, code, verdict], next);
            }
        }
    ], function (err) {
        if (err !== null) {
            res.send(newErrorResponse(err));
        }
    });
}

function save(req, res) {
    var userId = req.user.userId;
    var lessonId = req.body.lessonid;

    items = [];
    for (var i = 0; req.body.hasOwnProperty('id' + i); i++) {
        var id = req.body['id' + i];
        var code = req.body['code' + i];

        if (!/^[a-zA-Z0-9_.-]+$/.test(id)) {
            res.send(newErrorResponse('Problem ID is invalid.'));
            return;
        }

        items.push({ id: id, code: code });
    }

    var expired;
    var now = new Date();

    async.waterfall([
        function (next) {
            hy_file.getLesson(req.user.course, lessonId,
                { problems: '', expires: now.toISOString() }, next);
        },
        function (lesson, next) {
            var expires = new Date(lesson.expires);
            expired = now > expires;

            var problems = lesson.problems.match(/\S+/g);
            var missing = items.filter(function (item) {
                return problems.indexOf(item.id) < 0;
            });
            if (missing.length > 0) {
                next('Cannot find item "' + missing[0].id + '"');
                return;
            }

            var dest = expired ? 'late_solutions' : 'solutions';
            var now = req.db.now;
            async.eachSeries(items,
                function (item, subnext) {
                    req.db.execute('REPLACE INTO ' + dest + ' '
                        + '(lessonid, probid, userid, time, code) '
                        + 'VALUES (?, ?, ?, ' + now + ', ?)',
                        [lessonId, item.id, userId, item.code], subnext);
                },
                function (err) {
                    if (expired) {
                        next('Changes are not saved: '
                            + 'Lesson\'s due date has expired. ');
                    } else {
                        next(err);
                    }
                });
        },
        function (next) {
            res.send({ ok: true });
        }
    ], function (err) {
        if (err !== null) {
            res.send(newErrorResponse(err));
        }
    });
}

function getHistory(req, res) {
    var userId;
    var lessonId = req.body.lessonid;
    var itemId = req.body.itemid;

    if (req.body.hasOwnProperty('userid')) {
        if (!/^[0-9]+$/.test(req.body.userid)) {
            res.send(newErrorResponse('The user ID must be a number.'));
            return;
        }
        userId = parseInt(req.body.userid, 10);
        if (!req.user.editor && userId !== req.user.userId) {
            res.send(newErrorResponse('You can view only your own history.'));
            return;
        }
    } else {
        userId = req.user.userId;
    }

    async.waterfall([
        function (next) {
            hy_file.getProblem(req.user.course, lessonId, itemId,
                null, next);
        },
        function (lesson, next) {
            req.db.forAll('SELECT time, code, verdict FROM submissions ' +
                'WHERE userid = ? AND lessonid = ? AND probid = ? ORDER BY time DESC',
                [userId, lessonId, itemId], next);
        },
        function (rows, next) {
            res.send({ ok: true, results: rows });
        }
    ], function (err) {
        if (err !== null) {
            res.send(newErrorResponse(err));
        }
    });
}

exports.execute = execute;
exports.save = save;
exports.getHistory = getHistory;
