import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_certificate")
	default_certificate_template = frappe.db.get_value(
		"Property Setter",
		{
			"doc_type": "Aerobridge Certificate",
			"property": "default_print_format",
		},
		"value",
	)

	if frappe.db.exists("Print Format", default_certificate_template):
		certificates = frappe.get_all("Aerobridge Certificate", pluck="name")
		for certificate in certificates:
			frappe.db.set_value("Aerobridge Certificate", certificate, "template", default_certificate_template)
