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
var hydraGrade = (function () {
    "use strict";

    var exports = {};

    var savedData = {};
    var saveTimer = null;
    var workpadMirror = null;

    $(document).ready(function () {
        hydra.addPage('grade', {
            afterHide: function (next) {
                closeGrades(next);
            },
            afterShow: function (next) {
                if (workpadMirror) {
                    workpadMirror.setSize(null, '12em');
                    workpadMirror.refresh();
                }
            }
        });
    });

    exports.loadProblemGrades = function (lessonId, itemId, probTitle) {
        var pageElt = $('#grade');
        var title = probTitle || 'Untitled';
        pageElt.html('<h1>' + title + '</h1>\n'
            + '<p class="grade_msg">Loading grades&hellip;</p>');
        hydra.showPage('grade', false, hydra.doNothing);
        $.ajax({
            method: 'get',
            url: '/grade/get',
            data: { lessonid: lessonId, itemid: itemId },
            cache: false,
            error: function (jqXHR, textStatus, errorThrown) {
                pageElt.find('.grade_msg').text('Error loading grades: '
                    + (textStatus || '') + (errorThrown || ''));
            },
            success: function (data, textStatus) {
                var i;
                var it;
                if (hydra.processResponse(data)) {
                    data.itemid = itemId;
                    if (!data.ok) {
                        pageElt.find('.grade_msg').text(data.message);
                        return;
                    }
                    var newSave = {
                        id: itemId,
                        lessonid: lessonId,
                        showGrades: data.showGrades,
                        users: {}
                    };
                    if (data.hasOwnProperty('solns')) {
                        for (i = 0; i < data.solns.length; i++) {
                            it = data.solns[i];
                            newSave.users[it.id] = {
                                code: it.code,
                                grade: it.grade,
                                comment: it.comment };
                        }
                    }
                    savedData = newSave;
                    saveTimer = window.setInterval(autosaveGrades, 10000);
                    hydra.renderDust($('#grade'), 'grade', data,
                        function () {
                            var pad = $('#workpad');
                            if (pad.length > 0) {
                                var mirr = CodeMirror.fromTextArea(pad[0], {
                                    mode: { name: 'python', version: 3 },
                                    lineNumbers: true
                                });
                                $(mirr.getWrapperElement()).resizable({
                                    handles: 's' }).on('resize',
                                    (function (mirror) {
                                        return function() {
                                            mirror.refresh();
                                        };
                                    })(mirr));
                                workpadMirror = mirr;
                            }
                        });
                }
            }
        });
    };

    $(document).on('submit', '#workpad_form', function (evnt) {
        evnt.preventDefault();

        var form = $('#workpad_form');
        var id = form.attr('item');
        var code;
        if (workpadMirror) {
            code = workpadMirror.getValue();
        } else {
            code = $('#workpad').val();
        }

        var results = $('#workpad_result');
        results.html('Submitting for evaluation&hellip;');
        results.slideDown('fast');

        $.post('/item/execute', { id: id, code: code, log: false },
            function (data, textStatus) {
                if (!hydra.processResponse(data)) {
                    hydra.renderDust(results, 'results', data);
                }
            }, 'json');
    });

    $(document).on('click', '#workpad_return', function (evnt) {
        evnt.preventDefault();

        var uid = $('#workpad_user').val();
        if (uid) {
            var soln = $('#soln' + uid);
            if (soln.length > 0) {
                soln[0].scrollIntoView();
            }
        }
    });

    $(document).on('click', '.soln_workpad', function (evt) {
        evt.preventDefault();

        var b = $(evt.target);
        var code = b.closest('.soln').find('.soln_code').text();
        var workpad = $('#workpad');
        if (workpadMirror) {
            workpadMirror.setValue(code);
        } else {
            workpad.val(code);
        }
        $('#workpad_user').val(b.closest('.soln').attr('user'));
        var workpadForm = $('#workpad_form');
        if (workpadForm.length > 0) {
            workpadForm[0].scrollIntoView();
        }
    });

    $(document).on('click', '.soln_show_history', function (evt) {
        evt.preventDefault();

        var b = $(evt.target);
        var results = b.closest('.soln').find('.soln_history');
        if (b.text() === 'Hide history') {
            b.text('Show history');
            results.slideUp('fast');
        } else {
            b.text('Hide history');

            var userId = b.closest('.soln').attr('user');
            var lessonId = $('.lesson_href').attr('lesson');
            var itemId = $('#grade_title').attr('item');

            results.html('Retrieving&hellip;');
            results.slideDown('fast');
            $.post('/item/history',
                { userid: userId, lessonid: lessonId, itemid: itemId },
                function (data, textStatus) {
                    if (hydra.processResponse(data)) {
                        hydra.renderDust(results, 'soln_history', data);
                    }
                }, 'json');
        }
    });

    function closeGrades(next) {
        var timerId = saveTimer;
        saveTimer = null;
        if (timerId !== null) {
            window.clearInterval(timerId);
        }
        autosaveGrades(function () {
            savedData = {};
            next();
        });
    }

    function hideWarnings() {
    }

    function showWarnings() {
    }

    function autosaveGrades(next) {
        var data = savedData;
        var toSend = { id: data.id, lessonid: data.lessonid };
        var shouldSend = false;
        var newData = {
            id: data.id,
            lessonid: data.lessonid,
            showGrades: $('#grade_show').is(':checked'),
            users: {}
        };
        var userId;
        var oldUserData;
        var newGrade;
        var newComment;
        if (newData.showGrades !== data.showGrades) {
            shouldSend = true;
            toSend.showGrades = newData.showGrades;
        }
        for (userId in data.users) {
            if (data.users.hasOwnProperty(userId)) {
                oldUserData = data.users[userId];
                newGrade = $('#grade' + userId).val();
                newComment = $('#rem' + userId).val();
                if (newGrade === oldUserData.grade
                        && newComment === oldUserData.comment) {
                    newData.users[userId] = oldUserData;
                } else {
                    newData.users[userId] = {
                        code: oldUserData.code,
                        grade: newGrade,
                        comment: newComment
                    };
                    shouldSend = true;
                    toSend['code' + userId] = data.users[userId].code;
                    toSend['grade' + userId] = newGrade;
                    toSend['rem' + userId] = newComment;
                }
            }
        }

        if (!shouldSend) {
            hideWarnings();
        } else {
            $.ajax({
                url: '/grade/save',
                method: 'post',
                data: toSend,
                error: function (jqXHR, textStatus, errorThrown) {
                    showWarnings();
                },
                success: function (data, textStatus, jqXHR) {
                    if (data.ok) {
                        savedData = newData;
                        hideWarnings();
                    } else {
                        console.log(data.message);
                        showWarnings();
                    }
                }
            });
        }
        if (next) {
            next();
        }
    }

    return exports;
}());
