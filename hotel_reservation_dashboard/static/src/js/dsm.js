odoo.define('hotel_reservation_dashboard.dsm', function (require) {
    "use strict";
    var AbstractAction = require('web.AbstractAction');
    var core = require('web.core');
    var QWeb = core.qweb;
    var rpc = require('web.rpc');
    var ajax = require('web.ajax');
    var _t = core._t;
    var rooms_name = [];
    const { loadBundle } = require("@web/core/assets");
    var session = require('web.session');
    
    var ReservationDashBoard = AbstractAction.extend({
        template: 'ReservationDashBoard',
        events: {
            'click .date-cell': 'toggleCellSelection',
            'change #month': 'DateChangeTriggerTable',
            'click #datetimes': 'Datepicker',
            'click #today-btn': 'selectToday',
            'click #week-btn': 'selectThisWeek',
            'click #month-btn': 'selectThisMonth',
        },

        init: function (parent, context) {
            this._super(parent, context);
            this.selectedStartDate = null;
            this.selectedEndDate = null;
            this.selectedStartRow = null;
            this.selectedEndRow = null;
            this.isLoading = false;
        },

        willStart: function () {
            var self = this;
            return this._super().then(function () {
                self.currentMonth = new Date().getMonth() + 1;
                self.currentYear = new Date().getFullYear();

                return self.loadMonthDates(self.currentYear, self.currentMonth).then(function (dates) {
                    self.month_dates = dates;
                }).then(function () {
                    return self._rpc({
                        model: "room.booking",
                        method: "get_rooms_details_query",
                    }).then(function (res) {
                        self.result = res;
                    });
                });
            });
        },

        loadMonthDates: function (year, month) {
            return this._rpc({
                model: "room.booking",
                method: "get_month_dates",
                args: [year, month],
            });
        },

        loadMonthDatesForRange: function (startDate, endDate) {
            return this._rpc({
                model: "room.booking",
                method: "get_month_dates_for_range",
                args: [startDate, endDate],
            });
        },

        start: function () {
            var self = this;
            this.set("title", 'Room Booking Dashboard');
            return this._super().then(function () {
                self.trigger_table();
                self.updateStats();

                self.$('.RoomTrackTable').on('click', '.customer-tag', function (event) {
                    event.stopPropagation();
                    var bookingId = $(event.currentTarget).data('booking-id');
                    self.openBookingWizard(bookingId);
                });
            });
        },

        updateStats: function() {
            var self = this;
            var totalRooms = self.result.length;
            var bookedRooms = 0;
            var availableRooms = 0;
            
            // Calculate stats based on current date
            var today = new Date().toISOString().split('T')[0];
            
            self.result.forEach(function(room) {
                var hasBookingToday = room.customer_bookings.some(function(booking) {
                    return booking.booking_dates.includes(today);
                });
                
                if (hasBookingToday) {
                    bookedRooms++;
                } else {
                    availableRooms++;
                }
            });
            
            var occupancyRate = totalRooms > 0 ? Math.round((bookedRooms / totalRooms) * 100) : 0;
            
            // Update the stats in the UI
            this.$('#total-rooms').text(totalRooms);
            this.$('#available-rooms').text(availableRooms);
            this.$('#booked-rooms').text(bookedRooms);
            this.$('#occupancy-rate').text(occupancyRate + '%');
        },

        selectToday: function() {
            var today = moment();
            this.DateChangeTriggerTable(today.format('YYYY-MM-DD'), today.format('YYYY-MM-DD'));
            this.updateDatePicker(today, today);
        },

        selectThisWeek: function() {
            var startOfWeek = moment().startOf('week');
            var endOfWeek = moment().endOf('week');
            this.DateChangeTriggerTable(startOfWeek.format('YYYY-MM-DD'), endOfWeek.format('YYYY-MM-DD'));
            this.updateDatePicker(startOfWeek, endOfWeek);
        },

        selectThisMonth: function() {
            var startOfMonth = moment().startOf('month');
            var endOfMonth = moment().endOf('month');
            this.DateChangeTriggerTable(startOfMonth.format('YYYY-MM-DD'), endOfMonth.format('YYYY-MM-DD'));
            this.updateDatePicker(startOfMonth, endOfMonth);
        },

        updateDatePicker: function(startDate, endDate) {
            var $input = this.$('input[name="datetimes"]');
            if ($input.data('daterangepicker')) {
                $input.data('daterangepicker').setStartDate(startDate);
                $input.data('daterangepicker').setEndDate(endDate);
            }
        },

        showLoading: function() {
            if (!this.isLoading) {
                this.isLoading = true;
                this.$('.table-container').append('<div class="loading-overlay"><div class="loading-spinner"></div></div>');
            }
        },

        hideLoading: function() {
            this.isLoading = false;
            this.$('.loading-overlay').remove();
        },

        check_access_product: function (group) {
            return session.user_has_group(group);
        },

        openBookingWizard: function (bookingId) {
            var self = this;

            self._rpc({
                model: 'room.booking',
                method: 'search_read',
                domain: [['id', '=', bookingId]],
            }).then(function (booking) {
                var group = "hotel_reservation_dashboard.booking_edit_dashboard_access";
                if (booking.length > 0) {
                    session.user_has_group(group).then(function (hasGroup) {
                        if (!hasGroup) {
                            self.do_action({
                                type: 'ir.actions.act_window',
                                res_model: 'room.booking',
                                res_id: booking[0].id,
                                views: [[false, 'form']],
                                target: 'new',
                                context: { 'create': false },
                                flags: {
                                    mode: 'readonly',
                                    action_buttons: false,
                                }
                            });
                        } else {
                            self.do_action({
                                type: 'ir.actions.act_window',
                                res_model: 'room.booking',
                                res_id: booking[0].id,
                                views: [[false, 'form']],
                                target: 'new',
                            });
                        }
                    }).catch(function (error) {
                        console.error("Error checking access:", error);
                    });
                } else {
                    self.displayNotification({
                        title: _t('Error'),
                        message: _t('Booking not found!'),
                        type: 'danger',
                    });
                }
            });
        },

        DateChangeTriggerTable: function (startDate = null, endDate = null) {
            var self = this;
            self.showLoading();

            if (startDate && endDate) {
                console.log("Selected Date Range:", startDate, "to", endDate);

                self.loadMonthDatesForRange(startDate, endDate).then(function (dates) {
                    self.month_dates = dates;
                    self.trigger_table();
                    self.updateStats();
                    self.hideLoading();
                });
            } else {
                var monthValue = this.$('#month').val();

                if (monthValue) {
                    console.log("Selected month value:", monthValue);
                    var [year, month] = monthValue.split('-').map(Number);

                    self.currentYear = year;
                    self.currentMonth = month;

                    self.loadMonthDates(year, month).then(function (dates) {
                        self.month_dates = dates;
                        self.trigger_table();
                        self.updateStats();
                        self.hideLoading();
                    });
                } else {
                    console.error("Month value is invalid!");
                    self.hideLoading();
                }
            }
        },

        destroy: function () {
            this.$('input[name="datetimes"]').data('daterangepicker')?.remove();
            return this._super();
        },

        Datepicker: function () {
            if (typeof $.fn.daterangepicker === "undefined") {
                console.error("Date Range Picker plugin not loaded!");
                return;
            }

            var self = this;
            var $input = this.$('input[name="datetimes"]');

            $input.daterangepicker({
                timePicker: false,
                startDate: moment().startOf('day'),
                endDate: moment().startOf('day').add(7, 'days'),
                locale: {
                    format: 'MMM DD, YYYY'
                },
                autoApply: false,
                autoClose: false,
                opens: 'left',
                drops: 'down',
                showCustomRangeLabel: true,
                ranges: {
                    'Today': [moment(), moment()],
                    'Tomorrow': [moment().add(1, 'days'), moment().add(1, 'days')],
                    'Next 7 Days': [moment(), moment().add(6, 'days')],
                    'Next 30 Days': [moment(), moment().add(29, 'days')],
                    'This Month': [moment().startOf('month'), moment().endOf('month')],
                    'Next Month': [moment().add(1, 'month').startOf('month'), moment().add(1, 'month').endOf('month')]
                }
            });

            $input.on('apply.daterangepicker', function (ev, picker) {
                var startDate = picker.startDate.format('YYYY-MM-DD');
                var endDate = picker.endDate.format('YYYY-MM-DD');
                self.DateChangeTriggerTable(startDate, endDate);
                setTimeout(function () {
                    $input.data('daterangepicker').hide();
                }, 100);
            });

            $input.on('click', function (ev) {
                if (!$(ev.target).data('daterangepicker')) {
                    $input.data('daterangepicker').show();
                }
            });
        },

        trigger_table: function () {
            var self = this;
            var container = self.$('.RoomTrackTable');
            container.empty();

            // Format dates for better display
            var formattedDates = self.month_dates.map(function(date) {
                return moment(date).format('MMM DD');
            });

            container.append(`
                <table class="booking-table">
                    <thead>
                        <tr>
                            <th>🏠 Room Name</th>
                            ${formattedDates.map((date, index) => `
                                <th>
                                    <div>${date}</div>
                                    <small>${moment(self.month_dates[index]).format('ddd')}</small>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${self.generateRows()}
                    </tbody>
                </table>
            `);
        },

        generateRows: function () {
            var self = this;
            var rows = '';

            self.result.forEach((roomData, rowIndex) => {
                const roomName = roomData.room_name.en_US || roomData.room_name;
                const bookings = roomData.customer_bookings;

                rows += `<tr class="product-row" data-row-index="${rowIndex}">
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 18px;">🛏️</span>
                            <span>${roomName}</span>
                        </div>
                    </td>`;

                let dateIndex = 0;
                while (dateIndex < self.month_dates.length) {
                    const date = self.month_dates[dateIndex];
                    let bookingInfo = bookings.find(booking => booking.booking_dates.includes(date));

                    if (bookingInfo) {
                        let spanCount = 1;
                        while (
                            dateIndex + spanCount < self.month_dates.length &&
                            bookingInfo.booking_dates.includes(self.month_dates[dateIndex + spanCount])
                        ) {
                            spanCount++;
                        }

                        rows += `<td class="date-cell booked" data-date="${date}" colspan="${spanCount}">
                                     <div class="customer-tag" data-booking-id="${bookingInfo.booking_id}">
                                          👤 ${bookingInfo.customer_name}
                                     </div>
                                     <div class="room-status-indicator booked"></div>
                                 </td>`;

                        dateIndex += spanCount;
                    } else {
                        rows += `<td class="date-cell available" data-date="${date}">
                                     <div>✅ Available</div>
                                     <div class="room-status-indicator available"></div>
                                 </td>`;
                        dateIndex++;
                    }
                }

                rows += `</tr>`;
            });

            return rows;
        },

        toggleCellSelection: function (event) {
            var self = this;
            var $cell = $(event.currentTarget);
            var date = $cell.attr('data-date');
            var rowIndex = $cell.closest('tr').data('row-index');
            var isBooked = $cell.hasClass('booked');

            if (isBooked) {
                var roomData = self.result[rowIndex];
                var bookingDetails = roomData.customer_bookings.find(booking => booking.booking_dates.includes(date));

                if (bookingDetails) {
                    var bookingId = bookingDetails.booking_id;

                    self._rpc({
                        model: 'room.booking',
                        method: 'search_read',
                        domain: [['id', '=', bookingId]],
                    }).then(function (booking) {
                        if (booking.length > 0) {
                            self.do_action({
                                type: 'ir.actions.act_window',
                                res_model: 'room.booking',
                                res_id: booking[0].id,
                                views: [[false, 'form']],
                                target: 'new',
                            });
                        } else {
                            self.displayNotification({
                                title: _t('Error'),
                                message: _t('Booking not found!'),
                                type: 'danger',
                            });
                        }
                    });
                }
            } else {
                if (!self.selectedStartDate) {
                    self.selectedStartDate = new Date(date);
                    self.selectedStartRow = rowIndex;
                    $cell.addClass('selected-start');
                    
                    // Add visual feedback
                    $cell.append('<div class="room-status-indicator selected"></div>');
                    
                } else if (!self.selectedEndDate) {
                    self.selectedEndDate = new Date(date);
                    self.selectedEndRow = rowIndex;
                    $cell.addClass('selected-end');

                    console.log('Selected Date Range:', self.selectedStartDate, self.selectedEndDate);

                    self.highlightDateRange();
                    
                    // Add a small delay for visual effect
                    setTimeout(function() {
                        self.openRoomBookingWizard(rowIndex);
                    }, 300);
                    
                } else {
                    self.resetSelection();
                }
            }
        },

        openRoomBookingWizard: function (rowIndex) {
            var self = this;
            var checkinDate = new Date(self.selectedStartDate);
            var checkoutDate = new Date(self.selectedEndDate);
            
            if (checkoutDate < checkinDate) {
                self.displayNotification({
                    title: _t('Invalid Date Range'),
                    message: _t('Checkout date must be the same as or later than the check-in date.\n\nPlease select the table cells correctly:\n- First click: Check-in date\n- Second click: Check-out date'),
                    type: 'warning',
                });
                self.resetSelection();
                return;
            }
            
            var checkinDateStr = self.selectedStartDate.toISOString().split('T')[0];
            var checkoutDateStr = self.selectedEndDate.toISOString().split('T')[0];

            console.log("rooms_name", rooms_name);

            self._rpc({
                model: 'hotel.room',
                method: 'search',
                args: [[['name', 'in', rooms_name]]]
            }).then(function (rooms) {
                console.log("Rooms found:", rooms);

                if (rooms.length > 0) {
                    var roomLineData = rooms.map(function (room) {
                        var checkin = new Date(checkinDateStr);
                        var checkout = new Date(checkoutDateStr);
                        var diffTime = checkout - checkin;
                        var diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        if (diffTime > 0) {
                            diffDays += 1;
                        }
                        return [
                            0, 0, {
                                'room_id': room,
                                'checkin_date': checkinDateStr,
                                'checkout_date': checkoutDateStr,
                                'uom_qty': diffDays
                            }
                        ];
                    });

                    console.log("Room Line Data:", roomLineData);

                    self.do_action({
                        type: 'ir.actions.act_window',
                        res_model: 'room.booking',
                        views: [[false, 'form']],
                        context: { 'default_room_line_ids': roomLineData },
                        target: 'new',
                    });
                    
                    // Reset selection after opening wizard
                    setTimeout(function() {
                        self.resetSelection();
                    }, 500);
                    
                } else {
                    self.displayNotification({
                        message: "Room not found!",
                        type: 'warning',
                        title: 'Room Not Found'
                    });
                    self.resetSelection();
                }
            });
        },

        highlightDateRange: function () {
            var self = this;

            if (!self.selectedStartDate || !self.selectedEndDate) return;
            rooms_name = [];
            var startDate = self.selectedStartDate;
            var endDate = self.selectedEndDate;

            if (startDate > endDate) {
                [startDate, endDate] = [endDate, startDate];
            }

            var startRow = Math.min(self.selectedStartRow, self.selectedEndRow);
            var endRow = Math.max(self.selectedStartRow, self.selectedEndRow);

            for (var rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
                var productName = self.$(`.product-row[data-row-index="${rowIndex}"] td:first-child`).text().trim();
                // Remove emoji and extra spaces
                productName = productName.replace(/🛏️/g, '').trim();
                
                var roomBookings = self.result[rowIndex].customer_bookings;

                var isRoomAvailable = true;

                for (var booking of roomBookings) {
                    var bookingDates = booking.booking_dates;
                    var hasBookingInRange = bookingDates.some(function (date) {
                        var cellDate = new Date(date);
                        return cellDate >= startDate && cellDate <= endDate;
                    });

                    if (hasBookingInRange) {
                        isRoomAvailable = false;
                        break;
                    }
                }
                
                if (isRoomAvailable) {
                    rooms_name.push(productName);
                    console.log(`Selected Product: ${productName}`);
                } else {
                    console.log(`Room ${productName} is not available in the selected date range.`);
                }
                
                // Highlight the range
                self.$(`.product-row[data-row-index="${rowIndex}"] .date-cell`).each(function () {
                    var cellDate = new Date($(this).data('date'));
                    if (cellDate >= startDate && cellDate <= endDate && !$(this).hasClass('booked')) {
                        $(this).addClass('selected-range');
                        $(this).append('<div class="room-status-indicator selected"></div>');
                    }
                });
            }
        },

        resetSelection: function () {
            var self = this;
            self.selectedStartDate = null;
            self.selectedEndDate = null;
            self.selectedStartRow = null;
            self.selectedEndRow = null;
            self.$('.date-cell').removeClass('selected-start selected-end selected-range');
            self.$('.room-status-indicator.selected').remove();
        }
    });

    core.action_registry.add('Reservationdashboard_tags', ReservationDashBoard);
    return ReservationDashBoard;
});