import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_batch_membership")
	memberships = frappe.get_all("Aerobridge Enrollment", ["member", "name"])
	for membership in memberships:
		email = frappe.db.get_value("Community Member", membership.member, "email")
		frappe.db.set_value("Aerobridge Enrollment", membership.name, "member", email)
