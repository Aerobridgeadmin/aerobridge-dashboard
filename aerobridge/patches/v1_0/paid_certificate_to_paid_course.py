import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_course")
	courses = frappe.get_all(
		"Aerobridge Course",
		{"paid_certificate": ["is", "set"]},
		["name", "price_certificate", "currency"],
	)

	for course in courses:
		frappe.db.set_value(
			"Aerobridge Course",
			course.name,
			{
				"paid_course": 1,
				"course_price": course.price_certificate,
				"currency": course.currency,
			},
		)
