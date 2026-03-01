import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_quiz_submission")
	submissions = frappe.db.get_all("Aerobridge Quiz Submission", fields=["name", "owner"])

	for submission in submissions:
		frappe.db.set_value("Aerobridge Quiz Submission", submission.name, "member", submission.owner)
