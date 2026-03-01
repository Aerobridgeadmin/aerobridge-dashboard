import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "user_skill")
	skills = frappe.get_all("Skill", pluck="name")

	for skill in skills:
		frappe.get_doc({"doctype": "User Skill", "skill": skill}).save()
