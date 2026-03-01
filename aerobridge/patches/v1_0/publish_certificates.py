import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_certificate")
	certificates = frappe.get_all("Aerobridge Certificate", pluck="name")

	for certificate in certificates:
		frappe.db.set_value("Aerobridge Certificate", certificate, "published", 1)
