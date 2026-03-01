import frappe


def execute():
	frappe.reload_doc("aerobridge", "doctype", "aerobridge_course")
	frappe.reload_doc("aerobridge", "doctype", "course_instructor")
	courses = frappe.get_all("Aerobridge Course", fields=["name", "instructor"])
	for course in courses:
		doc = frappe.get_doc(
			{
				"doctype": "Course Instructor",
				"parent": course.name,
				"parentfield": "instructors",
				"parenttype": "Aerobridge Course",
				"instructor": course.instructor,
			}
		)
		doc.save()
