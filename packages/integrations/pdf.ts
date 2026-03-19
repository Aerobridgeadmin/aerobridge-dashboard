import "server-only";

import { generate } from "@pdfme/generator";
import type { Template } from "@pdfme/common";

const PAYSLIP_TEMPLATE: Template = {
  basePdf: {
    width: 210,
    height: 297,
    padding: [20, 20, 20, 20],
  },
  schemas: [
    [
      {
        name: "companyName",
        type: "text",
        position: { x: 20, y: 20 },
        width: 170,
        height: 10,
        fontSize: 16,
        fontWeight: "bold",
      },
      {
        name: "title",
        type: "text",
        position: { x: 20, y: 35 },
        width: 170,
        height: 8,
        fontSize: 12,
      },
      {
        name: "employeeName",
        type: "text",
        position: { x: 20, y: 55 },
        width: 85,
        height: 7,
        fontSize: 10,
      },
      {
        name: "employeeNumber",
        type: "text",
        position: { x: 115, y: 55 },
        width: 75,
        height: 7,
        fontSize: 10,
      },
      {
        name: "period",
        type: "text",
        position: { x: 20, y: 65 },
        width: 170,
        height: 7,
        fontSize: 10,
      },
      {
        name: "hoursWorked",
        type: "text",
        position: { x: 20, y: 85 },
        width: 85,
        height: 7,
        fontSize: 10,
      },
      {
        name: "hourlyRate",
        type: "text",
        position: { x: 115, y: 85 },
        width: 75,
        height: 7,
        fontSize: 10,
      },
      {
        name: "totalAmount",
        type: "text",
        position: { x: 20, y: 100 },
        width: 170,
        height: 10,
        fontSize: 14,
        fontWeight: "bold",
      },
      {
        name: "paymentMethod",
        type: "text",
        position: { x: 20, y: 120 },
        width: 170,
        height: 7,
        fontSize: 10,
      },
      {
        name: "paymentDate",
        type: "text",
        position: { x: 20, y: 130 },
        width: 170,
        height: 7,
        fontSize: 10,
      },
      {
        name: "notes",
        type: "text",
        position: { x: 20, y: 150 },
        width: 170,
        height: 20,
        fontSize: 9,
      },
      {
        name: "generatedAt",
        type: "text",
        position: { x: 20, y: 270 },
        width: 170,
        height: 6,
        fontSize: 8,
      },
    ],
  ],
};

export type PayslipData = {
  companyName: string;
  employeeName: string;
  employeeNumber: string;
  period: string;
  hoursWorked: string;
  hourlyRate: string;
  totalAmount: string;
  currency: string;
  paymentMethod: string;
  paymentDate: string;
  notes?: string;
};

export async function generatePayslipPdf(data: PayslipData): Promise<Uint8Array> {
  const inputs = [
    {
      companyName: data.companyName,
      title: "PAYSLIP",
      employeeName: `Employee: ${data.employeeName}`,
      employeeNumber: `ID: ${data.employeeNumber}`,
      period: `Pay Period: ${data.period}`,
      hoursWorked: `Hours Worked: ${data.hoursWorked}`,
      hourlyRate: `Rate: ${data.hourlyRate} ${data.currency}/hr`,
      totalAmount: `Total: ${data.totalAmount} ${data.currency}`,
      paymentMethod: `Payment Method: ${data.paymentMethod}`,
      paymentDate: `Payment Date: ${data.paymentDate}`,
      notes: data.notes ?? "",
      generatedAt: `Generated: ${new Date().toISOString()}`,
    },
  ];

  const pdf = await generate({ template: PAYSLIP_TEMPLATE, inputs });
  return pdf;
}
