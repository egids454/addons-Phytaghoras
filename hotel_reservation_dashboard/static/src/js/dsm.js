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
            'click .date-cell-content': 'toggleCellSelection',
            'change #month': 'DateChangeTriggerTable',
            'click #datetimes': 'Datepicker',
            'click #today-btn': 'selectToday',
            'click #week-btn': 'selectThisWeek',
            'click #month-btn': 'selectThisMonth',
        },

        /**
         * Initialize the dashboard with default values
         * @param {Object} parent - Parent widget
         * @param {Object} context - Context data
         */
        init: function (parent, context) {
            this._super(parent, context);
            this.selectedStartDate = null;
            this.selectedEndDate = null;
            this.selectedStartRow = null;
            this.selectedEndRow = null;
            this.isLoading = false;
        },

        /**
         * Load initial data before rendering the dashboard
         * @returns {Promise} Promise that resolves when data is loaded
         */
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

        /**
         * Load dates for a specific month and year
         * @param {number} year - Year to load
         * @param {number} month - Month to load
         * @returns {Promise} Promise with dates array
         */
        loadMonthDates: function (year, month) {
            return this._rpc({
                model: "room.booking",
                method: "get_month_dates",
                args: [year, month],
            });
        },

        /**
         * Load dates for a specific date range
         * @param {string} startDate - Start date in YYYY-MM-DD format
         * @param {string} endDate - End date in YYYY-MM-DD format
         * @returns {Promise} Promise with dates array
         */
        loadMonthDatesForRange: function (startDate, endDate) {
            return this._rpc({
                model: "room.booking",
                method: "get_month_dates_for_range",
                args: [startDate, endDate],
            });
        },

        /**
         * Start the dashboard and initialize components
         * @returns {Promise} Promise that resolves when dashboard is ready
         */
        start: function () {
            var self = this;
            this.set("title", 'Room Booking Dashboard');
            return this._super().then(function () {
                self.trigger_table();
                self.updateStats();

                // Bind click event for customer tags
                self.$('.RoomTrackTable').on('click', '.customer-tag', function (event) {
                    event.stopPropagation();
                    var bookingId = $(event.currentTarget).data('booking-id');
                    self.openBookingWizard(bookingId);
                });
            });
        },

        /**
         * Update dashboard statistics based on current data
         */
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

        /**
         * Select today's date and update table
         */
        selectToday: function() {
            var today = moment();
            this.DateChangeTriggerTable(today.format('YYYY-MM-DD'), today.format('YYYY-MM-DD'));
            this.updateDatePicker(today, today);
        },

        /**
         * Select this week's date range and update table
         */
        selectThisWeek: function() {
            var startOfWeek = moment().startOf('week');
            var endOfWeek = moment().endOf('week');
            this.DateChangeTriggerTable(startOfWeek.format('YYYY-MM-DD'), endOfWeek.format('YYYY-MM-DD'));
            this.updateDatePicker(startOfWeek, endOfWeek);
        },

        /**
         * Select this month's date range and update table
         */
        selectThisMonth: function() {
            var startOfMonth = moment().startOf('month');
            var endOfMonth = moment().endOf('month');
            this.DateChangeTriggerTable(startOfMonth.format('YYYY-MM-DD'), endOfMonth.format('YYYY-MM-DD'));
            this.updateDatePicker(startOfMonth, endOfMonth);
        },

        /**
         * Update the date picker with new dates
         * @param {moment} startDate - Start date
         * @param {moment} endDate - End date
         */
        updateDatePicker: function(startDate, endDate) {
            var $input = this.$('input[name="datetimes"]');
            if ($input.data('daterangepicker')) {
                $input.data('daterangepicker').setStartDate(startDate);
                $input.data('daterangepicker').setEndDate(endDate);
            }
        },

        /**
         * Show loading overlay
         */
        showLoading: function() {
            if (!this.isLoading) {
                this.isLoading = true;
                this.$('.table-container').append('<div class="loading-overlay"><div class="loading-spinner"></div></div>');
            }
        },

        /**
         * Hide loading overlay
         */
        hideLoading: function() {
            this.isLoading = false;
            this.$('.loading-overlay').remove();
        },

        /**
         * Check user access permissions
         * @param {string} group - Group name to check
         * @returns {Promise} Promise with access result
         */
        check_access_product: function (group) {
            return session.user_has_group(group);
        },

        /**
         * Open booking wizard for editing/viewing
         * @param {number} bookingId - ID of the booking to open
         */
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

        /**
         * Handle date change and trigger table update
         * @param {string} startDate - Start date (optional)
         * @param {string} endDate - End date (optional)
         */
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

        /**
         * Clean up resources when destroying the widget
         */
        destroy: function () {
            this.$('input[name="datetimes"]').data('daterangepicker')?.remove();
            return this._super();
        },

        /**
         * Initialize date picker component
         */
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

        /**
         * Generate and render the booking table
         * This is the main function that creates the horizontal table layout
         */
        trigger_table: function () {
            var self = this;
            var container = self.$('.RoomTrackTable');
            container.empty();

            // Validate data before proceeding
            if (!self.month_dates || self.month_dates.length === 0) {
                container.append('<div class="no-data-message">No dates available</div>');
                return;
            }

            if (!self.result || self.result.length === 0) {
                container.append('<div class="no-data-message">No rooms available</div>');
                return;
            }

            // Format dates for better display
            var formattedDates = self.month_dates.map(function(date) {
                return moment(date).format('MMM DD');
            });

            // Create table with proper structure for horizontal layout
            var tableHTML = `
                <table class="booking-table">
                    <thead>
                        <tr>
                            <th class="room-name-header">🏠 Room Name</th>
                            ${formattedDates.map((date, index) => `
                                <th class="date-header">
                                    <div class="date-display">${date}</div>
                                    <small class="day-display">${moment(self.month_dates[index]).format('ddd')}</small>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${self.generateRows()}
                    </tbody>
                </table>
            `;

            container.append(tableHTML);
        },

        /**
         * Generate table rows with proper horizontal layout
         * Each row represents one room with its availability across dates
         * @returns {string} HTML string for table rows
         */
        generateRows: function () {
            var self = this;
            var rows = '';

            // Validate input data
            if (!self.result || !Array.isArray(self.result)) {
                console.error("Invalid room data");
                return '<tr><td colspan="100%">Error loading room data</td></tr>';
            }

            if (!self.month_dates || !Array.isArray(self.month_dates)) {
                console.error("Invalid date data");
                return '<tr><td colspan="100%">Error loading date data</td></tr>';
            }

            // Generate each room row
            self.result.forEach((roomData, rowIndex) => {
                try {
                    // Extract room name safely
                    const roomName = self.extractRoomName(roomData.room_name);
                    const bookings = roomData.customer_bookings || [];

                    // Start building the row
                    rows += `<tr class="product-row" data-row-index="${rowIndex}">`;
                    
                    // First column: Room name (fixed width, sticky)
                    rows += `
                        <td class="room-name-cell">
                            <div class="room-name-container">
                                <span class="room-icon">🛏️</span>
                                <span class="room-name-text">${roomName}</span>
                            </div>
                        </td>
                    `;

                    // Generate date cells for this room
                    rows += self.generateDateCells(bookings, rowIndex);
                    
                    rows += `</tr>`;
                    
                } catch (error) {
                    console.error("Error generating row for room:", roomData, error);
                    // Add error row but continue processing
                    rows += `<tr><td>Error loading room</td></tr>`;
                }
            });

            return rows;
        },

        /**
         * Safely extract room name from room data
         * @param {string|Object} roomName - Room name data
         * @returns {string} Extracted room name
         */
        extractRoomName: function(roomName) {
            if (typeof roomName === 'string') {
                return roomName;
            } else if (typeof roomName === 'object' && roomName !== null) {
                return roomName.en_US || roomName.id || Object.values(roomName)[0] || 'Unknown Room';
            }
            return 'Unknown Room';
        },

        /**
         * Generate date cells for a specific room row
         * @param {Array} bookings - Array of booking data for this room
         * @param {number} rowIndex - Index of the current row
         * @returns {string} HTML string for date cells
         */
        generateDateCells: function(bookings, rowIndex) {
            var self = this;
            var cells = '';
            var dateIndex = 0;

            // Process each date in the month_dates array
            while (dateIndex < self.month_dates.length) {
                const date = self.month_dates[dateIndex];
                
                // Find if there's a booking for this date
                let bookingInfo = bookings.find(booking => 
                    booking.booking_dates && booking.booking_dates.includes(date)
                );

                if (bookingInfo) {
                    // Calculate how many consecutive dates this booking spans
                    let spanCount = self.calculateBookingSpan(bookingInfo, dateIndex);
                    
                    // Create booked cell with colspan
                    cells += self.createBookedCell(date, spanCount, bookingInfo);
                    
                    // Skip the spanned dates
                    dateIndex += spanCount;
                } else {
                    // Create available cell
                    cells += self.createAvailableCell(date);
                    dateIndex++;
                }
            }

            return cells;
        },

        /**
         * Calculate how many consecutive dates a booking spans
         * @param {Object} bookingInfo - Booking information
         * @param {number} startIndex - Starting date index
         * @returns {number} Number of consecutive dates
         */
        calculateBookingSpan: function(bookingInfo, startIndex) {
            var self = this;
            let spanCount = 1;
            
            // Check consecutive dates
            while (
                startIndex + spanCount < self.month_dates.length &&
                bookingInfo.booking_dates.includes(self.month_dates[startIndex + spanCount])
            ) {
                spanCount++;
            }
            
            return spanCount;
        },

        /**
         * Create HTML for a booked cell - UPDATED with date-cell-content wrapper
         * @param {string} date - Date string
         * @param {number} spanCount - Number of columns to span
         * @param {Object} bookingInfo - Booking information
         * @returns {string} HTML string for booked cell
         */
        createBookedCell: function(date, spanCount, bookingInfo) {
            return `
                <td class="date-cell booked" data-date="${date}" colspan="${spanCount}">
                    <div class="date-cell-content booked">
                        <div class="booking-content">
                            <div class="customer-tag" data-booking-id="${bookingInfo.booking_id}">
                                👤 ${bookingInfo.customer_name || 'Unknown Customer'}
                            </div>
                            <div class="room-status-indicator booked"></div>
                        </div>
                    </div>
                </td>
            `;
        },

        /**
         * Create HTML for an available cell - UPDATED with date-cell-content wrapper
         * @param {string} date - Date string
         * @returns {string} HTML string for available cell
         */
        createAvailableCell: function(date) {
            return `
                <td class="date-cell available" data-date="${date}">
                    <div class="date-cell-content available">
                        <div class="availability-content">
                            <div class="availability-text">✅ Available</div>
                            <div class="room-status-indicator available"></div>
                        </div>
                    </div>
                </td>
            `;
        },

        /**
         * Handle cell selection for booking creation - UPDATED to use date-cell-content
         * @param {Event} event - Click event
         */
        toggleCellSelection: function (event) {
            var self = this;
            var $cellContent = $(event.currentTarget);
            var $cell = $cellContent.closest('td');
            var date = $cell.attr('data-date');
            var rowIndex = $cell.closest('tr').data('row-index');
            var isBooked = $cellContent.hasClass('booked');

            if (isBooked) {
                // Handle booked cell click - open existing booking
                self.handleBookedCellClick($cell, date, rowIndex);
            } else {
                // Handle available cell click - start selection process
                self.handleAvailableCellClick($cell, date, rowIndex);
            }
        },

        /**
         * Handle click on booked cell to open existing booking
         * @param {jQuery} $cell - Clicked cell element
         * @param {string} date - Date of the cell
         * @param {number} rowIndex - Row index
         */
        handleBookedCellClick: function($cell, date, rowIndex) {
            var self = this;
            var roomData = self.result[rowIndex];
            var bookingDetails = roomData.customer_bookings.find(booking => 
                booking.booking_dates.includes(date)
            );

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
        },

        /**
         * Handle click on available cell for new booking selection
         * @param {jQuery} $cell - Clicked cell element
         * @param {string} date - Date of the cell
         * @param {number} rowIndex - Row index
         */
        handleAvailableCellClick: function($cell, date, rowIndex) {
            var self = this;
            var $cellContent = $cell.find('.date-cell-content');

            if (!self.selectedStartDate) {
                // First click - set start date
                self.selectedStartDate = new Date(date);
                self.selectedStartRow = rowIndex;
                $cellContent.addClass('selected-start');
                
                // Add visual feedback
                $cellContent.find('.availability-content').append('<div class="room-status-indicator selected"></div>');
                
            } else if (!self.selectedEndDate) {
                // Second click - set end date and open booking wizard
                self.selectedEndDate = new Date(date);
                self.selectedEndRow = rowIndex;
                $cellContent.addClass('selected-end');

                console.log('Selected Date Range:', self.selectedStartDate, self.selectedEndDate);

                self.highlightDateRange();
                
                // Add a small delay for visual effect
                setTimeout(function() {
                    self.openRoomBookingWizard(rowIndex);
                }, 300);
                
            } else {
                // Third click - reset selection
                self.resetSelection();
            }
        },

        /**
         * Open room booking wizard with selected dates and rooms
         * @param {number} rowIndex - Row index for room selection
         */
        openRoomBookingWizard: function (rowIndex) {
            var self = this;
            var checkinDate = new Date(self.selectedStartDate);
            var checkoutDate = new Date(self.selectedEndDate);
            
            // Validate date range
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

            // Find available rooms
            self._rpc({
                model: 'hotel.room',
                method: 'search',
                args: [[['name', 'in', rooms_name]]]
            }).then(function (rooms) {
                console.log("Rooms found:", rooms);

                if (rooms.length > 0) {
                    var roomLineData = self.createRoomLineData(rooms, checkinDateStr, checkoutDateStr);

                    console.log("Room Line Data:", roomLineData);

                    // Open booking form with pre-filled data
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

        /**
         * Create room line data for booking wizard
         * @param {Array} rooms - Array of room IDs
         * @param {string} checkinDateStr - Check-in date string
         * @param {string} checkoutDateStr - Check-out date string
         * @returns {Array} Array of room line data
         */
        createRoomLineData: function(rooms, checkinDateStr, checkoutDateStr) {
            return rooms.map(function (room) {
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
        },

        /**
         * Highlight the selected date range across multiple rooms - UPDATED for date-cell-content
         */
        highlightDateRange: function () {
            var self = this;

            if (!self.selectedStartDate || !self.selectedEndDate) return;
            
            // Reset rooms_name array
            rooms_name = [];
            
            var startDate = self.selectedStartDate;
            var endDate = self.selectedEndDate;

            // Ensure proper date order
            if (startDate > endDate) {
                [startDate, endDate] = [endDate, startDate];
            }

            var startRow = Math.min(self.selectedStartRow, self.selectedEndRow);
            var endRow = Math.max(self.selectedStartRow, self.selectedEndRow);

            // Check availability for each room in the selected range
            for (var rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
                var productName = self.$(`.product-row[data-row-index="${rowIndex}"] .room-name-text`).text().trim();
                var roomBookings = self.result[rowIndex].customer_bookings;

                var isRoomAvailable = self.checkRoomAvailability(roomBookings, startDate, endDate);
                
                if (isRoomAvailable) {
                    rooms_name.push(productName);
                    console.log(`Selected Product: ${productName}`);
                } else {
                    console.log(`Room ${productName} is not available in the selected date range.`);
                }
                
                // Highlight the range visually
                self.highlightRowDateRange(rowIndex, startDate, endDate);
            }
        },

        /**
         * Check if a room is available in the given date range
         * @param {Array} roomBookings - Array of bookings for the room
         * @param {Date} startDate - Start date
         * @param {Date} endDate - End date
         * @returns {boolean} True if room is available
         */
        checkRoomAvailability: function(roomBookings, startDate, endDate) {
            for (var booking of roomBookings) {
                var bookingDates = booking.booking_dates;
                var hasBookingInRange = bookingDates.some(function (date) {
                    var cellDate = new Date(date);
                    return cellDate >= startDate && cellDate <= endDate;
                });

                if (hasBookingInRange) {
                    return false;
                }
            }
            return true;
        },

        /**
         * Highlight date range for a specific row - UPDATED for date-cell-content
         * @param {number} rowIndex - Row index
         * @param {Date} startDate - Start date
         * @param {Date} endDate - End date
         */
        highlightRowDateRange: function(rowIndex, startDate, endDate) {
            var self = this;
            
            self.$(`.product-row[data-row-index="${rowIndex}"] .date-cell`).each(function () {
                var cellDate = new Date($(this).data('date'));
                var $cellContent = $(this).find('.date-cell-content');
                
                if (cellDate >= startDate && cellDate <= endDate && !$cellContent.hasClass('booked')) {
                    $cellContent.addClass('selected-range');
                    $cellContent.find('.availability-content').append('<div class="room-status-indicator selected"></div>');
                }
            });
        },

        /**
         * Reset all selection states and visual indicators - UPDATED for date-cell-content
         */
        resetSelection: function () {
            var self = this;
            self.selectedStartDate = null;
            self.selectedEndDate = null;
            self.selectedStartRow = null;
            self.selectedEndRow = null;
            self.$('.date-cell-content').removeClass('selected-start selected-end selected-range');
            self.$('.room-status-indicator.selected').remove();
        }
    });

    // Register the dashboard action
    core.action_registry.add('Reservationdashboard_tags', ReservationDashBoard);
    return ReservationDashBoard;
});