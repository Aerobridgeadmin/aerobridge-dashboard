import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_course")
	courses = frappe.get_all("Aerobridge Course", {"status": ("is", "not set")}, ["name", "published"])
	for course in courses:
		status = "Approved" if course.published else "In Progress"
		frappe.db.set_value("Aerobridge Course", course.name, "status", status)
