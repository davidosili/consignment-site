const BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : window.location.hostname === "rapidroutesltd.com"
    ? "https://rapidroutesltd.com"
    : "https://rapidroutesltd.onrender.com";



// Override the default alert() to log instead of showing popup
window.alert = function (message) {
  console.log("🔔 ALERT:", message);
};

let latestTrackingData = null; // store the last fetched tracking data

async function loadTrackingInfo() {
  const params = new URLSearchParams(window.location.search);
  const trackingNumber = params.get("number");
  const resultBox = document.getElementById("trackingResult");

  if (!trackingNumber) {
    resultBox.innerHTML = "<p>No tracking number provided.</p>";
    return;
  }

  try {
    const response = await fetch(`${BASE_URL}/api/tracking/${trackingNumber}`);
    const data = await response.json();

    if (response.ok) {
      latestTrackingData = data; // save for invoice generation

      const updates = Array.isArray(data.updates) ? data.updates : [];
      const items = Array.isArray(data.items) ? data.items : [];

      const sender = data.sender || {};
      const receiver = data.receiver || {};
// Render HTML
resultBox.innerHTML = `
  <!-- TRACKING INFO SECTION -->
  <div class="section">
    <h3>Tracking Information</h3>
    <div class="table-wrapper">
      <table class="info-table">
        <tr>
          <th>Tracking Number</th>
          <td>${data.trackingNumber}</td>
          <th>Status</th>
          <td>${data.status || "Pending"}</td>
        </tr>
        <tr>
          <th>Created At</th>
          <td>${data.createdAt ? new Date(data.createdAt).toLocaleString() : "Unknown"}</td>
          <th>Expected Delivery</th>
          <td>${data.expectedDelivery ? new Date(data.expectedDelivery).toLocaleDateString() : "Not set"}</td>
        </tr>
        <tr>
          <th>Current Location</th>
          <td colspan="3">${data.location || "Not Available"}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- SHIPMENT DETAILS SECTION -->
  <div class="section">
    <h3>Shipment Details</h3>
    <div class="table-wrapper">
      <table class="info-table">
        <tr>
          <th colspan="2">Sender Information</th>
          <th colspan="2">Receiver Information</th>
        </tr>
        <tr>
          <th>Sender Name</th>
          <td>${sender.name || "N/A"}</td>
          <th>Receiver Name</th>
          <td>${receiver.name || "N/A"}</td>
        </tr>
        <tr>
          <th>Origin</th>
          <td>${data.origin || "N/A"}</td>
          <th>Destination</th>
          <td>${data.destination || "N/A"}</td>
        </tr>
        <tr>
          <th>Email</th>
          <td>${sender.email || "N/A"}</td>
          <th>Email</th>
          <td>${receiver.email || "N/A"}</td>
        </tr>
        <tr>
          <th>Phone</th>
          <td>${sender.phone || "N/A"}</td>
          <th>Phone</th>
          <td>${receiver.phone || "N/A"}</td>
        </tr>
      </table>
    </div>
  </div>

  <!-- ITEMS SECTION -->
  <div class="section">
    <h3>📦 Items in Shipment</h3>
    ${
      items.length > 0
        ? `<div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Weight (kg)</th>
                  <th>Quantity</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => `
                  <tr>
                    <td>${it.itemId || "-"}</td>
                    <td>${it.name || "-"}</td>
                    <td>${it.description || "-"}</td>
                    <td>${it.weight || "-"}</td>
                    <td>${it.quantity || 1}</td>
                    <td>${it.cost || 1}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>`
        : "<p>No items listed for this parcel.</p>"
    }
  </div>



        <div class="section">
          <h3>📜 Tracking History</h3>
          ${
            updates.length > 0
              ? `<ul>${updates.map(u => `
                  <li>
                    <strong>${u.timestamp ? new Date(u.timestamp).toLocaleString() : "Unknown Date"}</strong><br>
                    ${u.location || "Unknown Location"} — ${u.status || "No Status"}
                  </li>
                `).join("")}</ul>`
              : "<p>No tracking history yet.</p>"
          }
        </div>
      `;

        // ✅ NEW LINE HERE — triggers your route update in tracking.html
        document.dispatchEvent(new CustomEvent("trackingDataLoaded", { 
          detail: { 
            origin: data.origin, 
            destination: data.destination,
            sender, 
            receiver 
          } 
        }));


    } else {
      resultBox.innerHTML = `
        <h3>Parcel not found</h3>
        <p>${data.message || "We couldn’t locate tracking info for this number."}</p>
        <button onclick="window.location.href='/reschedule.html'">Reschedule Collection</button>
      `;
    }
  } catch (err) {
    console.error("Fetch error:", err);
    resultBox.innerHTML = "<p>⚠️ Error fetching tracking info. Please try again later.</p>";
  }
}


// ✅ Improved Invoice Generation with multiple items
// ✅ Final Improved Invoice Generation
// ✅ Final Polished Invoice with AutoTable
function generateInvoice() {
  if (!latestTrackingData) {
    alert("No tracking data available for invoice.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();

  const sender = latestTrackingData.sender || {};
  const receiver = latestTrackingData.receiver || {};

  // ================== HEADER ==================
  doc.addImage("./img/logistics2-copy.png", "PNG", 14, 10, 50, 20); // left logo
  doc.addImage("./img/cd3fac.jpg", "JPEG", pageWidth - 100, 10, 100, 50); // right banner

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("INVOICE", pageWidth / 2, 20, { align: "center" });

  doc.setFontSize(10);
  doc.text(
    `Tracking #: ${latestTrackingData.trackingNumber}`,
    39, // logo center
    35,
    { align: "center" }
  );

  // ================== COMPANY INFO ==================
let y = 70;
const companyInfo = [
  { text: "RapidRoute Logistics & Delivery Company", bold: true, size: 16 },
  { text: "Address: USA, Europe, Africa", bold: true, size: 16 },
  { text: "Email: support@rapidroute.com", bold: true, size: 16 },
  { text: "Website: www.rapidroute.com", bold: true, size: 12 }
];

companyInfo.forEach(line => {
  doc.setFont("helvetica", line.bold ? "bold" : "normal");
  doc.setFontSize(line.size || 12); // fallback if size is missing
  const textWidth = doc.getTextWidth(line.text);
  const x = (pageWidth - textWidth) / 2; // center align
  doc.text(line.text, x, y);
  y += line.size > 16 ? 4 : 6; // add more spacing if font is big
});


  // Divider
  doc.setLineWidth(0.1);
  doc.line(20, y + 2, pageWidth - 20, y + 2);
  y += 15;

    // ================== SHIPMENT INFO ==================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Shipment Information", 14, y);
  y += 8;

  // --- Generate barcode ---
  const canvas = document.getElementById("barcode");
  JsBarcode(canvas, latestTrackingData.trackingNumber || "N/A", {
    format: "CODE128",
    lineColor: "#000",
    width: 2,
    height: 40,
    displayValue: true // shows tracking number under barcode
  });

  // Convert barcode to image and place above Order ID
  const barcodeImg = canvas.toDataURL("image/png");
  doc.addImage(barcodeImg, "PNG", pageWidth / 2 + 10, y - 14, 50, 15); // right side
  y += 5; // add spacing below barcode

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const infoLeft = [
    `Est. Delivery: ${
      latestTrackingData.expectedDelivery
        ? new Date(latestTrackingData.expectedDelivery).toLocaleDateString()
        : "Not set"
    }`,
    `Mode of Transport: Air Freight`
  ];
  const infoRight = [
    `Order ID: ${latestTrackingData._id || "N/A"}`,
    `Payment Mode: Online Payment`
  ];

  infoLeft.forEach((line, i) => {
    doc.text(line, 14, y + i * 6);
  });
  infoRight.forEach((line, i) => {
    doc.text(line, pageWidth / 2 + 10, y + i * 6);
  });
  y += 18;


  // ================== SENDER / RECEIVER ==================
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("FROM (SENDER)", 14, y - 2);
  doc.text("TO (CONSIGNEE)", pageWidth / 2 + 10, y - 2);
  y += 7;

  function capitalizeWords(str) {
    return str
      .toLowerCase()
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  doc.setFontSize(20);

  doc.text(capitalizeWords(sender.name || "N/A"), 14, y);
  doc.text(capitalizeWords(receiver.name || "N/A"), pageWidth / 2 + 10, y);

  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Address: ${sender.address || "-"}`, 14, y);
  doc.text(`Address: ${receiver.address || "-"}`, pageWidth / 2 + 10, y);
  y += 6;

  doc.text(`Phone: ${sender.phone || "-"}`, 14, y);
  doc.text(`Phone: ${receiver.phone || "-"}`, pageWidth / 2 + 10, y);
  y += 6;

  doc.text(`Email: ${sender.email || "-"}`, 14, y);
  doc.text(`Email: ${receiver.email || "-"}`, pageWidth / 2 + 10, y);
  y += 16;

  // ================== SHIPMENT DETAILS TABLE ==================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Shipment Details", 14, y + 2);
  y += 6;

  const tableData = latestTrackingData.items.map(item => [
  item.quantity || 1,
  "Parcel ",
  item.name || "-",
  item.description || "-",
  "$" + ((item.cost || 0) * (item.quantity || 1))
  ]);

  doc.autoTable({
      startY: y + 4,
      head: [["Qty", "Type of Shipment", "Product", "Description", "Total Cost"]],
      body: tableData,
      styles: { font: "helvetica", fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [60, 60, 243], textColor: 255, fontStyle: "bold" },
      tableWidth: 'auto'
  });


  y = doc.lastAutoTable.finalY + 15;


  // After the table, add a grand total
  const totalAmount = latestTrackingData.items.reduce((sum, item) => {
    return sum + (item.cost || 0) * (item.quantity || 1);
  }, 0);

  doc.setFontSize(12);
  doc.text(`Grand Total: $${totalAmount.toFixed(2)}`, pageWidth - 70, doc.lastAutoTable.finalY + 10);




  // ================== FOOTER ==================
  doc.setLineWidth(0.3);
  doc.line(14, y + 30, pageWidth - 14, y + 30);

  y += 38;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  doc.text("Payment Methods:", 14, y);
  doc.text("Visa / MasterCard / PayPal", 14, y + 6);

  doc.text(
    `Official Stamp / ${new Date().toLocaleDateString()}`,
    pageWidth - 70,
    y
  );

  // ================== SAVE ==================
  doc.save(`Invoice_${latestTrackingData.trackingNumber}.pdf`);
}

window.onload = () => {
  loadTrackingInfo();
  document.getElementById("generateInvoiceBtn").addEventListener("click", generateInvoice);
};
