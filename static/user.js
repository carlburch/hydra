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
var hydraUser = (function () {
    "use strict";

    //
    /// Users page (admin only)
    //

    hydra.addPage('users', {
        beforeShow: function (next) {
            $.ajax({
                method: 'get',
                url: '/user/list',
                data: {},
                cache: false,
                success: function (data, textStatus) {
                    if (hydra.processResponse(data)) {
                        hydra.renderDust($('#users'), 'users', data, next);
                    }
                }
            });
        }
    });

    $(document).on('click', '.user_profile', function (evnt) {
        evnt.preventDefault();
        loadProfile($(this).attr('id'));
    });

    $(document).on('click', '.user_grades', function (evnt) {
        evnt.preventDefault();
        var a = $(this);
        var uid = a.attr('id');
        var login = a.closest('tr').find('.user_login');
        var info = login.length > 0 ? login.text() : uid;
        hydra.goToUrl('grades/' + uid, 'Grades for ' + info, { user: uid});
    });

    $(document).on('click', '.user_toggle', function (evnt) {
        evnt.preventDefault();

        var elt = $(this);
        var id = elt.attr('id');
        $.ajax({
            method: 'post',
            url: '/user/toggle',
            data: { id: id },
            cache: false,
            success: function (data, textStatus) {
                if (hydra.processResponse(data)) {
                    var tr = elt.closest('tr');
                    if (data.value) {
                        tr.removeClass('user_invisible');
                    } else {
                        tr.addClass('user_invisible');
                    }
                    elt.text(data.value ? 'Hide' : 'Show');
                }
            }
        });
    });

    //
    /// Grades page (only logged in user - or any user for admin)
    //

    hydra.addPage('gradelist', { });

    function loadGrades(userId) {
        var pageElt = $('#gradelist');
        pageElt.html('<h1>Grades</h1>\n'
            + '<p class="lesson_msg">Loading grades&hellip;</p>');
        hydra.showPage('gradelist', false, hydra.doNothing);
        var httpSend = {};
        if (userId !== null && userId !== undefined) {
            httpSend.id = userId;
        }
        $.ajax({
            method: 'get',
            url: '/grade/list',
            data: httpSend,
            cache: false,
            success: function (data, textStatus) {
                if (hydra.processResponse(data)) {
                    var url = "/" + hydra.course + "/grades";
                    if (userId) {
                        url = url + "/" + userId;
                    }
                    hydra.renderDust(pageElt, 'gradelist', data, null);
                }
            }
        });
    }

    //
    /// Profile page (not implemented)
    //

    hydra.addPage('profile', {
        beforeShow: function (next) {
            $('#profile_password').val('');
            $('#profile_err').text('');
            next();
        }
    });

    hydra.addPage('profile', {
        afterHide: function () {
            $('#profile_err').text('');
            $('#profile_id').val('');
            $('#profile_login').text('');
            $('#profile_first').val('');
            $('#profile_last').val('');
            $('#profile_email').val('');
        }
    });

    function loadProfile(userId) {
        var pageElt = $('#loadProfile');
        hydra.showPage('profile', false, hydra.doNothing);
        var httpSend = {};
        if (userId !== null && userId !== undefined) {
            httpSend.id = userId;
        }
        $.ajax({
            method: 'get',
            url: '/user/profile',
            data: httpSend,
            cache: false,
            success: function (data, textStatus) {
                if (hydra.processResponse(data)) {
                    if (!data.ok) {
                        $('#profile_err').text(data.message);
                        return;
                    }

                    $('#profile_err').text('');
                    $('#profile_id').val(data.userId);
                    $('#profile_login').text(data.login);
                    $('#profile_first').val(data.first);
                    $('#profile_last').val(data.last);
                    $('#profile_email').val(data.email);
                }
            }
        });
    }

    $(document).on('submit', '#profile_update', function (evnt) {
        evnt.preventDefault();

        var httpSend = {
            id: $('#profile_id').val(),
            first: $('#profile_first').val(),
            last: $('#profile_last').val(),
            email: $('#profile_email').val()
        };
        $.ajax({
            method: 'post',
            url: '/user/update',
            data: httpSend,
            cache: false,
            success: function (data, textStatus) {
                if (hydra.processResponse(data)) {
                    if (data.ok) {
                        $('#profile_err').text('Profile updated');
                    } else {
                        $('#profile_err').text(data.message);
                    }
                }
            }
        });
            
    });

    return {
        loadGrades: loadGrades
    };
}());
