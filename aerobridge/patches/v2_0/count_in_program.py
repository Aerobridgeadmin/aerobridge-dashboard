import frappe


def execute():
	programs = frappe.get_all("Aerobridge Program", pluck="name")

	for program in programs:
		course_count = frappe.db.count(
			"Aerobridge Program Course",
			{"parent": program, "parenttype": "Aerobridge Program", "parentfield": "program_courses"},
		)
		frappe.db.set_value("Aerobridge Program", program, "course_count", course_count)

		member_count = frappe.db.count(
			"Aerobridge Program Member",
			{"parent": program, "parenttype": "Aerobridge Program", "parentfield": "program_members"},
		)
		frappe.db.set_value("Aerobridge Program", program, "member_count", member_count)
