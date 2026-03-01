import frappe
from frappe.model.rename_doc import rename_doc


def execute():
	if frappe.db.exists("DocType", "Aerobridge Batch Old"):
		return

	frappe.flags.ignore_route_conflict_validation = True
	rename_doc("DocType", "Aerobridge Batch", "Aerobridge Batch Old")
	frappe.flags.ignore_route_conflict_validation = False

	frappe.reload_doctype("Aerobridge Batch Old", force=True)
