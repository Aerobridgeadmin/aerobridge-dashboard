import frappe


def execute():
	rename_link("/courses", "/aerobridge/courses")
	rename_link("/batches", "/aerobridge/batches")
	rename_link("/statistics", "/aerobridge/statistics")
	rename_link("/job-openings", "/aerobridge/job-openings")
	delete_link("/people")


def rename_link(source, target):
	link = frappe.db.exists("Top Bar Item", {"url": source})

	if link:
		frappe.db.set_value("Top Bar Item", link, "url", target)


def delete_link(source):
	link = frappe.db.exists("Top Bar Item", {"url": source})

	if link:
		frappe.delete_doc("Top Bar Item", link)
