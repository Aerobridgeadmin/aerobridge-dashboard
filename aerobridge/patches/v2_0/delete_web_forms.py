import frappe


def execute():
	frappe.db.delete("Web Form", {"module": "Aerobridge", "is_standard": 1})
