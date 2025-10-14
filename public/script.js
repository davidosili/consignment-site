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

async function trackParcel() {
  const trackingNumber = document.getElementById("trackingInput").value.trim();
  const resultBox = document.getElementById("trackingResult");

  if (!trackingNumber) {
    resultBox.innerHTML = "<p>Please enter a tracking number.</p>";
    return;
  }

  try {
    const response = await fetch(`${BASE_URL}/api/tracking/${trackingNumber}`);
    const data = await response.json();

    if (response.ok) {
      const updates = Array.isArray(data.updates) ? data.updates : [];
      const items = Array.isArray(data.items) ? data.items : [];

      const sender = data.sender || {};
      const receiver = data.receiver || {};

      resultBox.innerHTML = `
        <h3>Tracking Number: ${data.trackingNumber}</h3>

        <h4>Shipment Info</h4>
        <p><strong>Sender:</strong> ${sender.name || "N/A"}</p>
        <p><strong>Receiver:</strong> ${receiver.name || "N/A"}</p>
        <p><strong>Origin:</strong> ${data.origin || "N/A"}</p>
        <p><strong>Destination:</strong> ${data.destination || "N/A"}</p>
        <p><strong>Status:</strong> ${data.status || "Pending"}</p>
        <p><strong>Expected Delivery:</strong> ${data.expectedDelivery ? new Date(data.expectedDelivery).toLocaleDateString() : "Not set"}</p>
        <p><strong>Created At:</strong> ${data.createdAt ? new Date(data.createdAt).toLocaleString() : "Unknown"}</p>

        <h4>📦 Items in Shipment:</h4>
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
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>`
            : "<p>No items available.</p>"
        }

        <h4>📜 Tracking History:</h4>
        ${
          updates.length > 0
            ? `<ul>${updates.map(u =>
                `<li>${u.timestamp ? new Date(u.timestamp).toLocaleString() : "Unknown"} - ${u.location || "Unknown Location"}: ${u.status || "No Status"}</li>`
              ).join("")}</ul>`
            : "<p>No tracking history available yet.</p>"
        }

        <div class="sender-details">
          <h3>Company Contact</h3>
          <p><strong>Name:</strong> RapidRoute Logistics</p>
          <p><strong>Email:</strong> support@rapidroute.us</p>
          <p><strong>Address:</strong> 123 Main Street, Nevada, USA</p>
          <p><strong>Mobile:</strong> +1 234 567 890</p>
        </div>
      `;
    } else {
      resultBox.innerHTML = `
        <h3>Parcel not yet collected?</h3>
        <p>${data.message || "Tracking info not found."}</p>
        <button onclick="window.location.href='/reschedule.html'">Reschedule collection</button>
      `;
    }
  } catch (err) {
    console.error("Fetch error:", err);
    resultBox.innerHTML = "<p>⚠️ Error fetching tracking info. Please try again later.</p>";
  }
}
