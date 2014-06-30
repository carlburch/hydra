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
var file_cache = require('./file_cache');

var regexValid = /^[a-zA-Z0-9_.-]+$/;
var regexWord = /\S+/g;

function stringListContains(stringList, query) {
    return stringList.match(regexWord).some(function (word) {
        return query === word;
    });
}

function getCourse(courseId, otherAttrs, callback) {
    var courseAdded = false;
    var courseData;

    if (!courseId) {
        callback('request must specify course');
        return;
    } else if (!regexValid.test(courseId)) {
        callback('course identifier is invalid');
        return;
    }

    async.waterfall([
        function (next) {
            if (!otherAttrs || !otherAttrs.hasOwnProperty('course')) {
                courseAdded = true;
                if (!otherAttrs) {
                    otherAttrs = { };
                }
                otherAttrs.course = null;
            }
            file_cache.getProperties([courseId, 'index.hy'],
                otherAttrs, next);
        },
        function (result, next) {
            courseData = result;
            if (!courseData) {
                next('course does not exist');
                return;
            }

            var courseTitle = courseData.course;
            if (courseTitle && courseTitle !== otherAttrs.course) {
                if (courseAdded) {
                    delete otherAttrs.course;
                    if (courseData && courseData.hasOwnProperty('course')) {
                        delete courseData.course;
                    }
                }
                callback(null, courseData);
            } else {
                next('course file is not valid');
            }
        }
    ], function (err) {
        if (courseAdded) {
            delete otherAttrs.course;
            if (courseData && courseData.hasOwnProperty('course')) {
                delete courseData.course;
            }
        }
        callback(err, null);
    });
}

function getLesson(courseId, lessonId, otherAttrs, callback) {
    var lessonAdded = false;
    var lessonData;

    if (!courseId) {
        callback('request must specify course');
        return;
    } else if (!regexValid.test(courseId)) {
        callback('course identifier is invalid');
        return;
    } else if (!lessonId) {
        callback('request must specify lesson');
        return;
    } else if (!regexValid.test(courseId)) {
        callback('lesson identifier is invalid');
        return;
    }

    async.waterfall([
        function (next) {
            file_cache.getProperties([courseId, 'index.hy'],
                { course: null, lessons: '' }, next);
        },
        function (result, next) {
            if (result.course === null) {
                next('course file is not valid');
            } else if (!stringListContains(result.lessons, lessonId)) {
                next('lesson is not listed in course file');
            } else {
                if (!otherAttrs || !otherAttrs.hasOwnProperty('lesson')) {
                    lessonAdded = true;
                    if (!otherAttrs) {
                        otherAttrs = { };
                    }
                    otherAttrs.lesson = null;
                }
                file_cache.getProperties([courseId, lessonId, 'index.hy'],
                    otherAttrs, next);
            }
        },
        function (result, next) {
            lessonData = result;
            if (!lessonData) {
                next('lesson does not exist');
                return;
            }

            var lessonTitle = lessonData.lesson;
            if (lessonTitle && lessonTitle !== otherAttrs.lesson) {
                if (lessonAdded) {
                    delete otherAttrs.lesson;
                    if (lessonData && lessonData.hasOwnProperty('lesson')) {
                        delete lessonData.lesson;
                    }
                }
                callback(null, lessonData);
            } else {
                next('lesson file is not valid');
            }
        }
    ], function (err) {
        if (lessonAdded) {
            delete otherAttrs.lesson;
            if (lessonData && lessonData.hasOwnProperty('lesson')) {
                delete lessonData.lesson;
            }
        }
        callback(err, null);
    });
}

function getProblem(courseId, lessonId, problemId, otherAttrs, callback) {
    var problemAdded = false;
    var problemData;

    if (!courseId) {
        callback('request must specify course');
        return;
    } else if (!regexValid.test(courseId)) {
        callback('course identifier is invalid');
        return;
    } else if (!lessonId) {
        callback('request must specify lesson');
        return;
    } else if (!regexValid.test(courseId)) {
        callback('lesson identifier is invalid');
        return;
    } else if (!problemId) {
        callback('request must specify problem');
        return;
    } else if (!regexValid.test(problemId)) {
        callback('problem identifier is invalid');
        return;
    }

    async.waterfall([
        function (next) {
            file_cache.getProperties([courseId, 'index.hy'],
                { course: null, lessons: '' }, next);
        },
        function (result, next) {
            if (result === null) {
                next('course file is missing');
            } else if (result.course === null) {
                next('course file is not valid');
            } else if (!stringListContains(result.lessons, lessonId)) {
                next('lesson is not listed in course file');
            } else {
                file_cache.getProperties([courseId, lessonId, 'index.hy'],
                    { lesson: null, problems: '' }, next);
            }
        },
        function (result, next) {
            if (result === null) {
                next('lesson file is missing');
            } else if (result.lesson === null) {
                next('lesson file is not valid');
            } else if (!stringListContains(result.problems, problemId)) {
                next('problem is not listed in lesson file');
            } else {
                if (!otherAttrs || !otherAttrs.hasOwnProperty('problem')) {
                    problemAdded = true;
                    if (!otherAttrs) {
                        otherAttrs = { };
                    }
                    otherAttrs.problem = null;
                }
                file_cache.getProperties([courseId, lessonId, problemId + '.hy'],
                    otherAttrs, next);
            }
        },
        function (result, next) {
            problemData = result;
            if (!problemData) {
                next('problem does not exist');
                return;
            }

            var problemTitle = problemData.problem;
            if (problemTitle && problemTitle !== otherAttrs.problem) {
                if (problemAdded) {
                    delete otherAttrs.problem;
                    if (problemData && problemData.hasOwnProperty('problem')) {
                        delete problemData.problem;
                    }
                }
                callback(null, problemData);
            } else {
                next('problem file is not valid');
            }
        }
    ], function (err) {
        if (problemAdded) {
            delete otherAttrs.problem;
            if (problemData && problemData.hasOwnProperty('problem')) {
                delete problemData.problem;
            }
        }
        callback(err, null);
    });
}

function getAllProblems(courseId, callback) {
    getCourse(courseId, { lessons: '' },
        function (err, course) {
            if (err || !course) {
                callback(err || 'no course information found', null);
                return;
            }

            async.map(course.lessons.match(regexWord),
                getAllProblemsLessonLoader(courseId),
                callback);
        });
}

function getAllProblemsLessonLoader(courseId) {
    return function (id, next) {
        file_cache.getProperties([courseId, id, 'index.hy'],
            { lesson: null, problems: '' },
            function (err, lesson) {
                if (err || !lesson || !lesson.lesson) {
                    next(null, { title: 'Invalid lesson "' + id + '"',
                        id: id, problems: [] });
                } else {
                    async.map(lesson.problems.match(regexWord),
                        getAllProblemsProblemLoader(courseId, id),
                        function (err, result) {
                            if (err || !result) {
                                next(err || 'Error loading problems', null);
                            } else {
                                next(null, { title: lesson.lesson,
                                    id: id, problems: result });
                            }
                        });
                }
            });
    };
}
                    
function getAllProblemsProblemLoader(courseId, lessonId) {
    return function (id, next) {
        file_cache.getProperties([courseId, lessonId, id + '.hy'],
            { problem: null },
            function (err, problem) {
                if (err || !problem || !problem.problem) {
                    next(null, { title: 'Invalid problem "' + id + '"',
                        id: id });
                } else {
                    next(null, { id: id, title: problem.problem });
                }
            });
    };
}

exports.getCourse = getCourse;
exports.getLesson = getLesson;
exports.getProblem = getProblem;
exports.getAllProblems = getAllProblems;
