import frappe


def get_site_info(site_info):
	# called via hook
	return {"activation": get_sales_data(site_info)}


def get_sales_data(site_info):
	activation_level = site_info.get("activation", {}).get("activation_level", 0)
	sales_data = site_info.get("activation", {}).get("sales_data", [])
	doctypes = [
		"Aerobridge Course",
		"Course Chapter",
		"Course Lesson",
		"Aerobridge Batch",
		"Aerobridge Enrollment",
		"Aerobridge Quiz",
		"Aerobridge Assignment",
		"Aerobridge Programming Exercise",
		"Aerobridge Program",
		"Aerobridge Certificate",
		"Aerobridge Certificate Request",
		"Aerobridge Certificate Evaluation",
	]

	for doctype in doctypes:
		count = frappe.db.count(doctype)
		sales_data.append({doctype: count})

	return {"activation_level": activation_level, "sales_data": sales_data}
