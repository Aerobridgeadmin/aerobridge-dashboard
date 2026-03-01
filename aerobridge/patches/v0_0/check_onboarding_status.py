import frappe


def execute():
	if (
		frappe.db.count("Aerobridge Course")
		and frappe.db.count("Course Chapter")
		and frappe.db.count("Course Lesson")
		and frappe.db.count("Aerobridge Quiz")
	):
		frappe.db.set_value("Aerobridge Settings", None, "is_onboarding_complete", True)
