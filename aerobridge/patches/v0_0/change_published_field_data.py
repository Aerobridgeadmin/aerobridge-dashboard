import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_course")
	courses = frappe.get_all("Aerobridge Course", fields=["name", "is_published"])
	for course in courses:
		frappe.db.set_value("Aerobridge Course", course.name, "published", course.is_published)
