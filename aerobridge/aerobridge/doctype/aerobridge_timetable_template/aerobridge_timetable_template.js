// Copyright (c) 2023, Frappe and contributors
// For license information, please see license.txt

frappe.ui.form.on("Aerobridge Timetable Template", {
	refresh(frm) {
		frm.set_query("reference_doctype", "timetable", function () {
			let doctypes = ["Course Lesson", "Aerobridge Quiz", "Aerobridge Assignment"];
			return {
				filters: {
					name: ["in", doctypes],
				},
			};
		});

		frm.set_query("reference_doctype", "timetable_legends", function () {
			let doctypes = [
				"Course Lesson",
				"Aerobridge Quiz",
				"Aerobridge Assignment",
				"Aerobridge Live Class",
			];
			return {
				filters: {
					name: ["in", doctypes],
				},
			};
		});
	},
});
