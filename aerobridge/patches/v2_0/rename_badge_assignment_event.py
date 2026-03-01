import frappe


def execute():
	badge_with_auto_assign = frappe.get_all("Aerobridge Badge", filters={"event": "Auto Assign"}, fields=["name"])
	for badge in badge_with_auto_assign:
		frappe.db.set_value("Aerobridge Badge", badge.name, "event", "Manual Assignment")
