# -*- coding: utf-8 -*-
################################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#
#    Copyright (C) 2023-TODAY Cybrosys Technologies(<https://www.cybrosys.com>).
#    Author: Unnimaya C O (odoo@cybrosys.com)
#
#    You can modify it under the terms of the GNU LESSER
#    GENERAL PUBLIC LICENSE (LGPL v3), Version 3.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE (LGPL v3) for more details.
#
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
################################################################################
import json
import io
from odoo import fields, models, _
from odoo.exceptions import ValidationError
from odoo.tools import date_utils

try:
    from odoo.tools.misc import xlsxwriter
except ImportError:
    import xlsxwriter


class RoomBookingWizard(models.TransientModel):
    """Pdf Report for room Booking"""

    _name = "room.booking.detail"
    _description = "Room Booking Details"

    checkin = fields.Date(help="Choose the Checkin Date", string="Checkin")
    checkout = fields.Date(help="Choose the Checkout Date", string="Checkout")
    room = fields.Many2one("hotel.room", string="Room", help="Choose The Room")

    def action_room_booking_pdf(self):
        """Button action_room_booking_pdf function"""
        data = {
            "booking": self.generate_data(),
        }
        return self.env.ref(
            "hotel_management_odoo.action_report_room_booking"
        ).report_action(self, data=data)

    def action_room_booking_excel(self):
        """Button action for creating Room Booking Excel report"""
        data = {
            "booking": self.generate_data(),
        }
        return {
            "type": "ir.actions.report",
            "data": {
                "model": "room.booking.detail",
                "options": json.dumps(data, default=date_utils.json_default),
                "output_format": "xlsx",
                "report_name": "Excel Report",
            },
            "report_type": "xlsx",
        }

    def generate_data(self):
        """Generate data to be printed in the report"""
        domain = []
        room_list = []
        if self.checkin and self.checkout:
            if self.checkin > self.checkout:
                raise ValidationError(
                    _("Check-in date should be less than Check-out date")
                )
        if self.checkin:
            domain.append(
                ("checkin_date", ">=", self.checkin),
            )
        if self.checkout:
            domain.append(
                ("checkout_date", "<=", self.checkout),
            )
        
        # Search for bookings in the date range
        bookings = self.env["room.booking"].search(domain)
        
        for booking in bookings:
            invoice = self.env['account.move'].search([('ref', '=', booking.name)], limit=1)
            payment_state = 'Belum Ada Invoice'
            if invoice:
                if invoice.payment_state == 'paid':
                    payment_state = 'Lunas'
                elif invoice.payment_state == 'in_payment':
                    payment_state = 'Sebagian Dibayar'
                elif invoice.payment_state == 'not_paid':
                    payment_state = 'Belum Dibayar'
                else:
                    payment_state = 'Dibatalkan'

            for line in booking.room_line_ids:
                # Filter by specific room if selected in wizard
                if self.room and self.room.id != line.room_id.id:
                    continue

                room_data = {
                    'partner_id': booking.partner_id.name,
                    'name': booking.name,
                    'checkin_date': line.checkin_date.strftime('%Y-%m-%d'),
                    'checkout_date': line.checkout_date.strftime('%Y-%m-%d'),
                    'room': line.room_id.name,
                    'duration': f"{int(line.uom_qty)} hari",
                    'payment_status': payment_state,
                }
                room_list.append(room_data)

        return room_list

    def get_xlsx_report(self, data, response):
        """Organizing xlsx report"""
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {"in_memory": True})
        sheet = workbook.add_worksheet()
        cell_format = workbook.add_format(
            {"font_size": "14px", "bold": True, "align": "center", "border": True}
        )
        head = workbook.add_format(
            {"align": "center", "bold": True, "font_size": "23px", "border": True}
        )
        body = workbook.add_format({"align": "left", "text_wrap": True, "border": True})
        sheet.merge_range("A1:H1", "Room Booking", head)
        sheet.set_column("A2:H2", 18)
        sheet.set_row(0, 30)
        sheet.set_row(1, 20)
        sheet.write("A2", "Sl No.", cell_format)
        sheet.write("B2", "Guest Name", cell_format)
        sheet.write("C2", "Room No.", cell_format)
        sheet.write("D2", "Check In", cell_format)
        sheet.write("E2", "Check Out", cell_format)
        sheet.write("F2", "Duration", cell_format)
        sheet.write("G2", "Payment Status", cell_format)
        sheet.write("H2", "Reference No.", cell_format)
        row = 2
        column = 0
        value = 1
        for i in data["booking"]:
            sheet.write(row, column, value, body)
            sheet.write(row, column + 1, i["partner_id"], body)
            sheet.write(row, column + 2, i["room"], body)
            sheet.write(row, column + 3, i["checkin_date"], body)
            sheet.write(row, column + 4, i["checkout_date"], body)
            sheet.write(row, column + 5, i["duration"], body)
            sheet.write(row, column + 6, i["payment_status"], body)
            sheet.write(row, column + 7, i["name"], body)
            row = row + 1
            value = value + 1
        workbook.close()
        output.seek(0)
        response.stream.write(output.read())
        output.close()
