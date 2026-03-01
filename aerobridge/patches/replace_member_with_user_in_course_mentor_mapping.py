import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_course_mentor_mapping")
	mappings = frappe.get_all("Aerobridge Course Mentor Mapping", ["mentor", "name"])
	for mapping in mappings:
		email = frappe.db.get_value("Community Member", mapping.mentor, "email")
		frappe.db.set_value("Aerobridge Course Mentor Mapping", mapping.name, "mentor", email)
