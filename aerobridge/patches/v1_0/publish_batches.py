import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_batch")
	batches = frappe.get_all("Aerobridge Batch", pluck="name")

	for batch in batches:
		frappe.db.set_value("Aerobridge Batch", batch, "Published", 1)
