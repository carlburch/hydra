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
    } else if (value === undefined) {
        return { ok: false, message: 'Unknown error [undefined]' };
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
    var startedItems = {};
    var courseTitle;
    async.waterfall([
        function (next) {
            var sql = ('SELECT lessonid, probid FROM problems '
                + 'WHERE course = ? AND ' + req.db.now + ' >= starts');
            req.db.forAll(sql, [req.user.course], next);
        },
        function (rows, next) {
            rows.forEach(function (row) {
                startedItems[row.lessonid + '/' + row.probid] = true;
            });

            hy_file.getCourse(req.user.course,
                { course: null, lessons: null }, next);
        },
        function (course, next) {
            if (course.lessons === null) {
                next('Did not find course lesson list');
            } else {
                courseTitle = course.course;

                async.map(course.lessons.match(/\S+/g),
                    function (lessonId, callback) {
                        loadLessonForIndex(req, lessonId, startedItems, callback);
                    },
                    next);
            }
        },
        function (results, next) {
            if (!results) {
                next('Did not find lesson file');
            } else {
                res.send({
                    ok: true,
                    editor: req.user.editor,
                    title: courseTitle,
                    lessons: results.filter(function (result) {
                            return result !== null;
                        })
                });
            }
        }
    ], function (err) {
        if (err !== null) {
            res.send(newErrorResponse(err));
        }
    });
}

function loadLessonForIndex(req, lessonId, startedItems, callback) {
    var attrs = {
        lesson: null,
        expires: null,
        problems: ''
    };
    hy_file.getLesson(req.user.course, lessonId, attrs,
        function (err, lesson) {
            if (err || !lesson || !lesson.lesson) {
                var errTitle = 'Unknown';
                if (typeof err === 'string') {
                    errTitle = 'Unknown: ' + err;
                }
                callback(null, {
                    lessonId: 'unknown',
                    title: errTitle,
                    visible: false,
                    expired: false
                });
            } else {
                var now = new Date();
                var expires = lesson.expires ? new Date(lesson.expires) : now;
                var started;
                if (lesson.problems) {
                    var problems = lesson.problems.match(/\S+/g);
                    started = problems.some(function (p) {
                        return startedItems.hasOwnProperty(lessonId + '/' + p);
                    });
                } else {
                    started = true;
                }

                if (started || req.user.editor) {
                    callback(null, {
                        lessonId: lessonId,
                        title: lesson.lesson,
                        visible: started,
                        expired: now >= lesson.expires
                    });
                } else {
                    callback(null, null);
                }
            }
        });
}

function getLesson(req, res) {
    var now = new Date();
    var userId = req.user.userId;
    var lessonId = req.query.id;
    var result = { ok: true, course: req.user.course,
        lessonId: lessonId, editor: req.user.editor };
    var problemIds;

    async.waterfall([
        function (next) {
            var attrs = {
                lesson: null,
                expires: now.toISOString(),
                problems: ''
            };
            hy_file.getLesson(req.user.course, lessonId, attrs, next);
        },
        function (lesson, next) {
            problemIds = lesson.problems.match(/\S+/g);
            result.title = lesson.lesson;
            result.expires = lesson.expires;

            async.map(problemIds,
                function (problemId, callback) {
                    loadProblem(req, lessonId, problemId, result.expires, callback);
                },
                function (err, problems) {
                    if (!problems) {
                        next('Did not find problem file');
                    } else {
                        result.items = problems;
                        next(null);
                    }
                });
        },
        function (next) {
            if (problemIds.length === 0) {
                next(null, [{ starts: true }]);
            } else {
                req.db.forAll('SELECT starts FROM problems '
                    + 'WHERE course = ? AND lessonid = ? AND probid = ?',
                    [req.user.course, lessonId, problemIds[0]], next);
            }
        },
        function (rows, next) {
            if (rows.length === 0) {
                result.started = false;
            } else {
                result.started = rows[0].starts ? true : false;
            }

            if (result.started || req.user.editor) {
                res.send(result);
            } else {
                next('Lesson not yet published');
            }
        }
    ], function (err) {
        if (err !== null) {
            res.send(newErrorResponse(err));
        }
    });
}

function loadProblem(req, lessonId, problemId, lessonExpires, callback) {
    var results = {
        itemid: problemId,
        type: 'problem',
        title: 'Untitled',
        html: '',
        code: ''
    };
    async.waterfall([
        function (next) {
            var attrs = {
                problem: null,
                html: '',
                initcode: ''
            };
            hy_file.getProblem(req.user.course, lessonId, problemId,
                attrs, next);
        }, function (problem, next) {
            if (!problem || !problem.problem) {
                results.html = 'Problem file not found'
            } else {
                results.title = problem.problem;
                results.html = problem.html;
                results.code = problem.initcode;
            }
            
            req.db.forAll('SELECT code FROM solutions '
                + 'WHERE userid = ? AND lessonid = ? AND probid = ?',
                [req.user.userId, lessonId, problemId], next);
        }, function (solutions, next) {
            if (solutions.length > 0) {
                results.code = solutions[0].code;
            }
            
            req.db.forAll('SELECT showgrades FROM problems '
                + 'WHERE course = ? AND lessonid = ? AND probid = ?',
                [req.user.course, lessonId, problemId], next);
        }, function (rows, next) {
            results.showgrades = rows.length > 0 && rows[0].showgrades ? true : false;

            if (results.showgrades) {
                req.db.forAll('SELECT grade, comment FROM grades '
                    + 'WHERE userid = ? AND lessonid = ? AND probid = ?',
                    [req.user.userId, lessonId, problemId], next);
            } else {
                next(null, []);
            }
        }, function (grades, next) {
            if (grades.length > 0) {
                results.grade = grades[0].grade;
                results.comment = grades[0].comment;
            }

            if (req.user.editor) {
                req.db.forAll('SELECT lastname AS last, firstname AS first, login, verdict '
                    + 'FROM users LEFT JOIN '
                    + '  (SELECT userid, MAX(verdict) AS verdict '
                    + '   FROM submissions WHERE time <= ? '
                    + '   GROUP BY userid, lessonid, probid) AS verdicts '
                    + '  ON users.userid = verdicts.userid '
                    + 'WHERE course = ? AND visible '
                    + 'ORDER BY lastname, firstname, login',
                    [lessonExpires, req.user.course],
                    next);
            } else {
                next(null, null);
            }
        }, function (verdicts, next) {
            if (verdicts) {
                results.verdicts = verdicts;
            }
            callback(null, results);
        }
    ], function (err) {
        callback(err, null);
    });
}

function setStarted(req, res) {
    var userId = req.user.userId;
    var lessonId = req.body.id;
    var started = req.body.value && req.body.value !== 'false';

    async.waterfall([
        function (next) {
            hy_file.getLesson(req.user.course, lessonId,
                { problems: '' }, next);
        },
        function (lesson, next) {
            var problemIds = lesson.problems.match(/\S+/g);
            if (problemIds.length === 0) {
                next('Lesson contains no problems');
            } else {
                var value = started ? req.db.now : 'NULL';
                async.each(problemIds,
                    function (problemId, callback) {
                        req.db.execute('REPLACE INTO problems '
                            + '(course, lessonid, probid, starts) '
                            + 'VALUES (?, ?, ?, ' + value + ')',
                            [req.user.course, lessonId, problemId], callback);
                    },
                    next);
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

exports.getList = getList;
exports.getLesson = getLesson;
exports.setStarted = setStarted;
