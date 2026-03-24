import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

export function generateInvoicePdf(res, order) {
  const doc = new PDFDocument();
  const filename = `Invoice_${order._id}.pdf`;
  res.setHeader("Content-disposition", 'attachment; filename="' + filename + '"');
  res.setHeader("Content-type", "application/pdf");
  doc.pipe(res);

  doc.fontSize(27).text("Subtlety", { align: "center" });
  doc.fontSize(12).text("Sold by: Nandalal M", { align: "center" });
  doc.fontSize(12).text("Address: Ft44, Main Street, City Central, Delhi", { align: "center" });
  doc.moveDown(2);

  doc.fontSize(16).text("Billing Address:", { underline: true });
  doc.moveDown();
  doc.fontSize(12).text(`Name: ${order.shippingAddress.fullname}`);
  doc.fontSize(12).text(`Address: ${order.shippingAddress.address}`);
  doc.fontSize(12).text(`Pincode: ${order.shippingAddress.pincode}`);
  doc.fontSize(12).text(`Phone No: ${order.shippingAddress.phone || "N/A"}`);
  doc.moveDown();

  doc.fontSize(16).text("Order Summary", { underline: true });
  doc.moveDown();
  doc.fontSize(12).text(`Order ID: ${order._id}`);
  doc.fontSize(12).text(`Order Date: ${new Date(order.orderDate).toLocaleDateString()}`);
  doc.fontSize(12).text(`Payment Method: ${order.paymentMethod}`);
  doc.moveDown(2);

  doc.fontSize(12).font("Helvetica-Bold");
  const headerY = doc.y;
  doc.text("Product Name", 73, headerY, { width: 110 });
  doc.text("Product Status", 215, headerY);
  doc.text("Unit Price", 320, headerY);
  doc.text("Quantity", 390, headerY);
  doc.text("Total Price", 470, headerY);

  doc.fontSize(12).font("Helvetica");
  let y = headerY + 20;
  let totalPaid = 0;

  order.items.forEach((item) => {
    const totalPrice = item.price * item.quantity;
    const isDelivered = item.status && item.status.trim().toLowerCase() === "delivered";
    doc.fontSize(12).text(`${item.productId.name}`, 73, y, { width: 110 });
    doc.fontSize(12).text(`${item.status || "N/A"}`, 215, y);
    doc.fontSize(12).text(`${item.price.toFixed(2)}`, 320, y);
    doc.fontSize(12).text(`x ${item.quantity}`, 390, y);
    doc.fontSize(12).text(`${isDelivered ? totalPrice.toFixed(2) : "0.00"}`, 470, y);
    if (isDelivered) totalPaid += totalPrice;
    y += 20;
  });

  doc.moveDown(3);
  doc.font("Helvetica-Bold");
  doc.fontSize(14).text(`Total Amount Paid: ${totalPaid.toFixed(2)}`, 73);
  doc.font("Helvetica");
  doc.end();
}

export function generateSalesReportPdf(res, orders) {
  const doc = new PDFDocument({ layout: "landscape", margin: 50 });
  res.setHeader("Content-Disposition", 'attachment; filename="sales_report.pdf"');
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  const totalSalesCount = orders.length;
  const totalOrderAmount = orders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
  const totalDiscount = orders.reduce((acc, o) => acc + (o.offerDiscount || 0) + (o.couponDiscount || 0), 0);

  doc.fillColor("#333").fontSize(25).text("SALES REPORT", { align: "center" });
  doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: "center" });
  doc.moveDown();

  doc.rect(50, 100, 700, 40).fill("#f8f9fa");
  doc.fillColor("#333").fontSize(12);
  doc.text(`Total Sales: ${totalSalesCount}`, 70, 115);
  doc.text(`Total Amount: Rs. ${totalOrderAmount.toFixed(2)}`, 300, 115);
  doc.text(`Total Discount: Rs. ${totalDiscount.toFixed(2)}`, 550, 115);
  doc.moveDown(3);

  const tableTop = 160;
  doc.fillColor("#444").fontSize(10).font("Helvetica-Bold");
  doc.text("S.No", 50, tableTop);
  doc.text("Order ID", 75, tableTop);
  doc.text("Customer", 190, tableTop);
  doc.text("Offer Disc.", 350, tableTop);
  doc.text("Coupon Disc.", 430, tableTop);
  doc.text("Amount", 510, tableTop);
  doc.text("Date", 600, tableTop);
  doc.text("Status", 680, tableTop);
  doc.moveTo(50, tableTop + 15).lineTo(790, tableTop + 15).strokeColor("#ccc").stroke();

  let y = tableTop + 25;
  doc.font("Helvetica");

  const drawTableHeader = (doc, y) => {
    doc.fillColor("#444").fontSize(10).font("Helvetica-Bold");
    doc.text("S.No", 50, y); doc.text("Order ID", 75, y); doc.text("Customer", 190, y);
    doc.text("Offer Disc.", 350, y); doc.text("Coupon Disc.", 430, y);
    doc.text("Amount", 510, y); doc.text("Date", 600, y); doc.text("Status", 680, y);
    doc.moveTo(50, y + 15).lineTo(790, y + 15).strokeColor("#ccc").stroke();
  };

  orders.forEach((order, index) => {
    if (index % 2 === 0) doc.rect(50, y - 5, 740, 20).fill("#fbfbfb");
    if (y > 500) {
      doc.addPage({ layout: "landscape", margin: 50 });
      y = 50;
      drawTableHeader(doc, y);
      y += 25;
      doc.font("Helvetica");
    }
    doc.fillColor("#666").fontSize(9);
    doc.text(`${index + 1}`, 50, y);
    doc.text(`${order.orderId}`, 75, y, { width: 110 });
    doc.text(`${order.shippingAddress.fullname}`, 190, y, { width: 150 });
    doc.text(`Rs. ${(order.offerDiscount || 0).toFixed(2)}`, 350, y, { width: 75 });
    doc.text(`Rs. ${(order.couponDiscount || 0).toFixed(2)}`, 430, y, { width: 75 });
    doc.text(`Rs. ${(order.totalAmount || 0).toFixed(2)}`, 510, y, { width: 85 });
    doc.text(`${new Date(order.orderDate).toLocaleDateString("en-GB")}`, 600, y, { width: 75 });
    doc.text(`${order.orderStatus}`, 680, y, { width: 110 });
    y += 20;
  });

  doc.end();
}

export async function generateSalesReportExcel(res, orders) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sales Report");

  worksheet.columns = [
    { header: "S.No", key: "sno", width: 5 },
    { header: "Order ID", key: "orderId", width: 25 },
    { header: "Customer", key: "customer", width: 25 },
    { header: "Offer Discount (Rs.)", key: "offerDiscount", width: 18 },
    { header: "Coupon Discount (Rs.)", key: "couponDiscount", width: 18 },
    { header: "Total Amount (Rs.)", key: "totalAmount", width: 18 },
    { header: "Date", key: "date", width: 15 },
    { header: "Status", key: "status", width: 15 },
  ];

  const totalOrderAmount = orders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
  const totalDiscount = orders.reduce((acc, o) => acc + (o.offerDiscount || 0) + (o.couponDiscount || 0), 0);

  worksheet.addRow(["Sales Report Summary"]);
  worksheet.addRow(["Total Sales", orders.length]);
  worksheet.addRow(["Total Amount", totalOrderAmount]);
  worksheet.addRow(["Total Discount", totalDiscount]);
  worksheet.addRow([]);

  worksheet.getRow(1).font = { bold: true, size: 14 };
  [2, 3, 4].forEach(rowNum => { worksheet.getRow(rowNum).font = { bold: true }; });

  const headerRow = worksheet.addRow([
    "S.No", "Order ID", "Customer", "Offer Discount (Rs.)",
    "Coupon Discount (Rs.)", "Total Amount (Rs.)", "Date", "Status",
  ]);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF444444" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  orders.forEach((order, index) => {
    const row = worksheet.addRow([
      index + 1, order.orderId, order.shippingAddress.fullname,
      order.offerDiscount || 0, order.couponDiscount || 0, order.totalAmount,
      new Date(order.orderDate).toLocaleDateString("en-GB"), order.orderStatus,
    ]);
    row.alignment = { vertical: "middle", horizontal: "left" };
  });

  res.setHeader("Content-Disposition", 'attachment; filename="sales_report.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  await workbook.xlsx.write(res);
  res.end();
}
