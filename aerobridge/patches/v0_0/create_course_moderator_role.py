from venv import create

import frappe

from aerobridge.install import create_moderator_role


def execute():
	create_moderator_role()
