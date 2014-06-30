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
var hy_file = require('./hy_file');

function newErrorResponse(value) {
    if (value === null) {
        return { ok: false, message: 'Unknown error [null]' };
    } else if (typeof value === 'string') {
        return { ok: false, message: value };
    } else {
        console.log('unknown error', value); //OK
        return { ok: false, message: 'Unknown error' };
    }
}

function list(req, res) {
    var userId;
    if (req.query.hasOwnProperty('id')) {
        if (!/^[0-9]+$/.test(req.query.id)) {
            res.send({ ok: false, message: 'Invalid user ID' });
            return;
        }
        userId = parseInt(req.query.id, 10); // safe
        if (!req.user.editor && req.user.userId !== userId) {
            userId = null;
            res.send({ ok: false,
                message: "You cannot view other users' grades" });
            return;
        }
    } else {
        userId = req.user.userId;
    }

    var results = { ok: true, course: req.user.course, editor: req.user.editor, grades: [] };
    var visibleProblems;
    var grades;
    var comments;
    async.waterfall([
        function (next) {
            req.db.forAll('SELECT firstname, lastname, login FROM users '
                + 'WHERE course = ? AND userid = ?', [req.user.course, userId], next);
        },
        function (rows, next) {
            if (rows.length === 0) {
                next('Unknown user');
                return;
            }

            results.first = rows[0].firstname;
            results.last = rows[0].lastname;
            results.login = rows[0].login;

            req.db.forAll('SELECT lessonid, probid FROM problems '
                + 'WHERE course = ? AND showgrades',
                [req.user.course], next);
        },
        function (rows, next) {
            visibleProblems = {};
            rows.forEach(function (row) {
                var key = row.lessonid + '/' + row.probid;
                visibleProblems[key] = true;
            });

            req.db.forAll('SELECT lessonid, probid, grade, comment FROM grades '
                + 'WHERE userid = ?', [userId], next);
        },
        function(rows, next) {
            grades = {};
            comments = {};
            rows.forEach(function (row) {
                var key = row.lessonid + '/' + row.probid;
                grades[key] = row.grade;
                comments[key] = row.comment;
            });

            hy_file.getAllProblems(req.user.course, next);
        },
        function (lessons, next) {
            results.grades = [];
            lessons.forEach(function (lesson) {
                var isFirst = true;
                lesson.problems.forEach(function (problem) {
                    var key = lesson.id + '/' + problem.id;
                    if (visibleProblems[key]) {
                        var grade = grades.hasOwnProperty(key) ? grades[key] : '';
                        var com = comments.hasOwnProperty(key) ? comments[key] : '';
                        var comMulti = com.length > 40 || com.indexOf('\n') >= 0;

                        results.grades.push({
                            lessonId: isFirst ? lesson.id : null,
                            lessonTitle: isFirst ? lesson.title : null,
                            itemId: problem.id,
                            title: problem.title,
                            grade: grade,
                            comment: com,
                            commentMulti: comMulti
                        });
                        isFirst = false;
                    }
                });
            });

            res.send(results);
        }
    ], function (err) {
        if (err !== null) {
            res.send(newErrorResponse(err));
        }
    });
}

function get(req, res) {
    var lessonId = req.query.lessonid;
    var itemId = req.query.itemid;

    if (!req.user.editor) {
        res.send({ ok: false,
            message: 'You do not have permission to view grades.' });
        return;
    }

    var findSql = ('SELECT users.userid AS userid, login, firstname, '
        + '            lastname, sol.code AS code, sol.time AS time, '
        + '            grades.code = sol.code AS gradecurrent, grade, comment, '
        + '            verdicts.code = sol.code AS verdictcurrent, verdict '
        + 'FROM users '
        + '  LEFT JOIN solutions AS sol '
        + '    ON sol.lessonid = ? AND sol.probid = ? AND users.userid = sol.userid '
        + '  LEFT JOIN grades '
        + '    ON grades.lessonid = ? AND grades.probid = ? AND users.userid = grades.userid '
        + '  LEFT JOIN (SELECT subs.userid AS userid, subs.code AS code, subs.verdict AS verdict '
        + '             FROM   (SELECT * FROM submissions '
        + '                     WHERE lessonid = ? AND probid = ?) AS subs '
        + '               JOIN (SELECT userid, MAX(time) AS latest '
        + '                     FROM submissions '
        + '                     WHERE lessonid = ? AND probid = ? AND time <= ?'
        + '                     GROUP BY userid) AS times '
        + '                 ON subs.userid = times.userid AND subs.time = times.latest) '
        + '         AS verdicts ON users.userid = verdicts.userid '
        + 'WHERE users.course = ? AND users.visible '
        + 'ORDER BY verdict DESC, time');

    var json = { ok: true, editor: req.user.editor, course: req.user.course,
        lessonid: lessonId, itemid: itemId, solns: [] };
    var expires = 'none';
    async.waterfall([
        function (next) {
            hy_file.getProblem(req.user.course, lessonId, itemId,
                { problem: null }, next);
        },
        function (problemData, next) {
            json.title = problemData.problem;

            hy_file.getLesson(req.user.course, lessonId,
                { lesson: null, expires: null }, next);
        },
        function (lessonData, next) {
            expires = lessonData.expires || new Date().toISOString();

            req.db.forAll('SELECT showgrades FROM problems '
                + 'WHERE course = ? AND lessonid = ? AND probid = ?',
                [req.user.course, lessonId, itemId], next);
        },
        function (rows, next) {
            json.showGrades = rows.length > 0 && rows[0].showgrades ? true : false;

            req.db.forAll(findSql,
                [lessonId, itemId, lessonId, itemId, lessonId, itemId,
                 lessonId, itemId, expires, req.user.course],
                next);
        },
        function (rows, next) {
            rows.forEach(function (r) {
                json.solns.push({
                    id: r.userid,
                    login: r.login,
                    first: r.firstname,
                    last: r.lastname,
                    code: r.code || '',
                    time: r.time || '',
                    gradeCurrent: r.gradecurrent,
                    grade: r.grade || '',
                    comment: r.comment || '',
                    verdictCurrent: r.verdictcurrent,
                    verdict: r.verdict
                });
            });
            res.send(json);
        }
    ], function (err) {
        if (err !== null) {
            res.send(newErrorResponse(err));
        }
    });
}

function save(req, res) {
    if (!req.user.editor) {
        res.send(newErrorResponse('You do not have permission to change grades.'));
        return;
    }

    var userData = {};
    var otherData = {};

    function setUser(id, key, value) {
        if (!userData.hasOwnProperty(id)) {
            if (!/^[0-9]+$/.test(id)) {
                res.send({ ok: false, message: 'Invalid user ID' });
                return false;
            }
            userData[id] = { id: parseInt(id, 10) }; //safe
        }
        userData[id][key] = value;
        return true;
    }

    for (var key in req.body) {
        if (req.body.hasOwnProperty(key)) {
            var value = req.body[key];
            var ok = true;
            if (key.substring(0, 4) === 'code') {
                ok = setUser(key.substring(4), 'code', value);
            } else if (key.substring(0, 3) === 'rem') {
                ok = setUser(key.substring(3), 'comment', value);
            } else if (key.substring(0, 5) === 'grade') {
                ok = setUser(key.substring(5), 'grade', value);
            } else {
                otherData[key] = value;
            }
            if (!ok) {
                return;
            }
        }
    }

    var graderId = req.user.userId;
    var lessonId = otherData.lessonid;
    var itemId = otherData.id;

    async.waterfall([
        function (next) {
            hy_file.getProblem(req.user.course, lessonId, itemId,
                null, next);
        },
        function (problemData, next) {
            var todo = [];
            for (var id in userData) {
                if (userData.hasOwnProperty(id)) {
                    todo.push(userData[id]);
                }
            }
            if (todo.length === 0) {
                next(null);
            } else {
                async.eachSeries(todo,
                    function (user, subnext) {
                        var now = req.db.now;
                        req.db.execute('REPLACE INTO grades '
                            + '(lessonid, probid, userid, code, grade, comment, teacherid, time) '
                            + 'VALUES (?, ?, ?, ?, ?, ?, ?, ' + now + ')',
                            [lessonId, itemId, user.id, user.code,
                                user.grade, user.comment, graderId],
                            subnext);
                    },
                    function (err) {
                        next(err);
                    });
            }
        },
        function (next) {
            if (otherData.hasOwnProperty('showGrades')) {
                var value = otherData.showGrades && otherData.showGrades !== 'false';
                req.db.execute('REPLACE INTO problems (course, lessonid, probid, showgrades) '
                    + 'VALUES (?, ?, ?, ?)', [req.user.course, lessonId, itemId, value], next);
            } else {
                next(null);
            }
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

exports.list = list;
exports.get = get;
exports.save = save;
