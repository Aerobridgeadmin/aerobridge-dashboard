import frappe

from aerobridge.aerobridge.api import update_course_statistics


def execute():
	update_course_statistics()
