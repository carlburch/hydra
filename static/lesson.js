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
var hydraLesson = (function () {
    "use strict";

    var exports = {};

    var codeMirrors = {};

    var autosaveTimer = null;
    var solnStatus = {};

    var preloadCorrect = $('<img>').attr('src', '/static/img/correct.png');
    var preloadWrong = $('<img>').attr('src', '/static/img/wrong.png');

    var autosaveWarnHtml = $('<p>').text(' ')
        .prepend($('<img>').addClass('autosave_warn')
            .attr('src', '/static/img/warning.png'));
    var autosaveGoodHtml = $('<p>')
        .text('Changes saved. (Connection restablished.)');

    $(document).ready(function () {
        hydra.addPage('lesson', {
            afterHide: function (next) {
                closeLesson(next);
            },
            afterShow: function (next) {
                for (var key in codeMirrors) {
                    if (codeMirrors.hasOwnProperty(key)) {
                        codeMirrors[key].setSize(null, '12em');
                        codeMirrors[key].refresh();
                    }
                }
            }
        });
    });

    function findProblem(itemId) {
        return $('.prob[item="' + itemId + '"]');
    }

    exports.loadLesson = function (lessonId, lessonTitle) {
        var pageElt = $('#lesson');
        var title = lessonTitle || 'Untitled';
        pageElt.html('<h1>' + title + '</h1>\n'
            + '<p class="lesson_msg">Loading lesson&hellip;</p>');
        hydra.showPage('lesson', false, hydra.doNothing);
        $.ajax({
            method: 'get',
            url: '/lesson/get',
            data: { id: lessonId },
            cache: false,
            error: function (jqXHR, textStatus, errorThrown) {
                pageElt.find('.lesson_msg').text('Error loading lesson: '
                    + (textStatus || '') + (errorThrown || ''));
            },
            success: function (data, textStatus) {
                if (hydra.processResponse(data)) {
                    var newStatus = {};
                    var i;
                    var it;
                    if (data.hasOwnProperty('items')) {
                        for (i = 0; i < data.items.length; i++) {
                            it = data.items[i];
                            if (it.type !== 'html' && it.hasOwnProperty('code')) {
                                newStatus[it.itemid] = {
                                    code: it.code, message: null };
                            }
                        }
                    }
                    solnStatus = newStatus;
                    autosaveTimer = window.setInterval(autosaveSolutions, 10000);
                    hydra.renderDust(pageElt, 'lesson', data, function () {
                        codeMirrors = {};
                        $('#lesson textarea').each(function (index) {
                            var prob = $(this).closest('.prob');
                            var id = prob.attr('item');
                            var mirr = CodeMirror.fromTextArea(this, {
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
                            codeMirrors[id] = mirr;
                        });
                    });
                }
            }
        });
    };

    function closeLesson(next) {
        var timerId = autosaveTimer;
        autosaveTimer = null;
        if (timerId !== null) {
            window.clearInterval(timerId);
        }
        autosaveSolutions(function () {
            solnStatus = {};
            next();
        });
    }

    function autosaveSolutions(next) {
        var lessonId = $('.lessonId').attr('lesson');
        var oldStatus = solnStatus; // itemId -> { code: str, message: str }
        var newlySent = {}; // itemId -> str
        var toSend = { lessonid: lessonId }; // HTTP key -> str
        var toSendCount = 0;
        var itemId;
        var div;
        var oldCode;
        var newCode;
        var sendId;
        for (itemId in oldStatus) {
            if (oldStatus.hasOwnProperty(itemId)) {
                div = findProblem(itemId);
                if (div.length !== 0) {
                    oldCode = oldStatus[itemId].code;
                    if (codeMirrors.hasOwnProperty(itemId)) {
                        newCode = codeMirrors[itemId].getValue();
                    } else {
                        newCode = div.find('[name=code]').val();
                    }
                    if (newCode !== oldCode) {
                        newlySent[itemId] = newCode;
                        sendId = toSendCount;
                        toSendCount = sendId + 1;
                        toSend['id' + sendId] = itemId;
                        toSend['code' + sendId] = newCode;
                    }
                }
            }
        }

        if (toSendCount > 0) {
            $.ajax({
                url: '/item/save',
                method: 'post',
                data: toSend,
                error: function (jqXHR, textStatus, errorThrown) {
                    updateWarnings(newlySent, 'Changes are not saved: '
                        + 'Connection to server lost.')
                },
                success: function (data, textStatus, jqXHR) {
                    var message = data.ok ? null : data.message;
                    for (var itemId in newlySent) {
                        if (newlySent.hasOwnProperty(itemId)) {
                            oldStatus[itemId].code = newlySent[itemId];
                            oldStatus[itemId].message = message;
                        }
                    }
                    updateWarnings(newlySent, message);
                }
            });
        }
        if (next) {
            next();
        }
    }

    function showWarnings(changed, message) {
        var key;
        var warn;
        for (key in changed) {
            if (changed.hasOwnProperty(key)) {
                warn = findProblem(key).find('.prob_warn');
                if (!warn.hasClass('prob_warned')) {
                    var toAdd = (autosaveWarnHtml.clone()
                        .append($('<span>').text(message)));
                    warn.empty().append(toAdd).addClass('prob_warned');
                    warn.slideDown('fast');
                } else {
                    var textSpan = warn.find('span');
                    if (textSpan.text() !== message) {
                        textSpan.text(message);
                    }
                }
            }
        }
    }

    function updateWarnings(changed, message) {
        var key;
        var warn;
        for (key in changed) {
            if (changed.hasOwnProperty(key)) {
                warn = findProblem(key).find('.prob_warn');
                if (message === null) {
                    if (warn.hasClass('prob_saved')) {
                        warn.removeClass('prob_saved')
                            .empty().slideUp('fast');
                    } else {
                        warn.addClass('prob_saved')
                            .removeClass('prob_warned')
                            .empty().append(autosaveGoodHtml.clone());
                    }
                } else {
                    if (!warn.hasClass('prob_warned')) {
                        var toAdd = (autosaveWarnHtml.clone()
                            .append($('<span>').text(message)));
                        warn.empty().append(toAdd).addClass('prob_warned');
                        warn.slideDown('fast');
                    } else {
                        var textSpan = warn.find('span');
                        if (textSpan.text() !== message) {
                            textSpan.text(message);
                        }
                    }
                }
            }
        }
    }

    $(document).on('change', '#lessonStarts', function (evnt) {
        evnt.preventDefault();

        var lessonId = $('.lessonId').attr('lesson');
        var checked = $('#lessonStarts').prop('checked');

        $.post('/lesson/setstarted', { id: lessonId, value: checked },
            function (data, textStatus) {
                if (data.ok) {
                    $('#startsError').slideUp();
                } else {
                    $('#startsError').text(data.message);
                    $('#startsError').slideDown();
                }
            }, 'json');
    });

    $(document).on('submit', '.prob_form', function (evnt) {
        evnt.preventDefault();

        var form = $(this);
        var div = form.closest('.prob');
        var id = form.attr('item');
        var results = div.find('.prob_result');
        var code;
        if (codeMirrors.hasOwnProperty(id)) {
            code = codeMirrors[id].getValue();
        } else {
            code = form.find('[name=code]').val();
        }
        results.html('Submitting for evaluation&hellip;');
        results.slideDown('fast');
        console.log('executing', id);

        $.post('/item/execute', { id: id, code: code },
            function (data, textStatus) {
                if (!hydra.processResponse(data)) {
                    return;
                }

                if (data.hasOwnProperty('verdict') && data.verdict === 3) {
                    div.addClass('prob_correct').removeClass('prob_unknown');
                } else {
                    div.addClass('prob_unknown').removeClass('prob_correct');
                }
                hydra.renderDust(results, 'results', data);
                div.find('.row_correct').hide();
            }, 'json');
    });

    $(document).on('click', '.show_correct', function (evnt) {
        evnt.preventDefault();

        var a = $(this);
        if (a.text() === 'Show all tests') {
            a.closest('.prob').find('.row_correct').slideDown(function () {
                a.text('Hide correct tests');
            });
        } else {
            a.closest('.prob').find('.row_correct').slideUp(function () {
                a.text('Show all tests');
            });
        }
    });

    $(document).on('click', '.href_grade', function (evnt) {
        evnt.preventDefault();

        var lessonId = $('.lessonId').attr('lesson');
        var prob = $(this).closest('.prob');
        var itemId = prob.attr('item');
        var title = prob.find('.prob_title').html();
        hydra.goToUrl('grade/' + lessonId + '/' + itemId, title,
            { title: title });
    });

    return exports;
}());
