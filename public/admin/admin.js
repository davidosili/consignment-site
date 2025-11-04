const API_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : window.location.hostname === "rapidroutesltd.com"
    ? "https://rapidroutesltd.com"
    : "https://rapidroutesltd.onrender.com";

// ------------------ LOGIN ------------------
async function loginAdmin() {
  const user = document.getElementById("adminUser").value;
  const pass = document.getElementById("adminPass").value;

  try {
    const res = await fetch(`${API_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("adminToken", data.token);
      document.getElementById("loginSection").classList.add("hidden");
      document.getElementById("dashboard").classList.remove("hidden");
      loadTracking();
    } else {
      document.getElementById("loginError").innerText = data.error || "Login failed";
    }
  } catch (err) {
    document.getElementById("loginError").innerText = "Server error, please try again.";
    console.error(err);
  }

  loadTracking();
  loadPendingShipments();
}

async function loadPendingShipments() {
  const token = localStorage.getItem("adminToken");
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/admin/pending-shipments`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    const tbody = document.querySelector("#pendingTable tbody");
    tbody.innerHTML = "";

    data.forEach(sh => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${sh.tempId}</td>
        <td>${sh.sender?.name || "N/A"}</td>
        <td>${sh.receiver?.name || "Waiting"}</td>
        <td>
        ${sh.items && sh.items.length > 0 
          ? sh.items.map((it, i) => `
            <div style="margin-bottom: 4px;">
              <b>Item ${i + 1}:</b> ${it.description || "N/A"} 
              (${it.weight || "N/A"}kg) × ${it.quantity || 1} 
              - $${it.cost || "N/A"}
            </div>
          `).join("")
        : "No items"}

      </td>

        <td>${sh.status}</td>
        <td>
          <button onclick="approveShipment('${sh._id}')">Approve</button>
          <button onclick="rejectShipment('${sh._id}')">Reject</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("Error loading pending shipments:", err);
  }
}


// ------------------ CREATE TRACKING ------------------
async function createTracking(event) {
  event.preventDefault();

  const token = localStorage.getItem("adminToken");
  if (!token) return alert("You must be logged in!");

  // Collect items
  const itemId = document.getElementById("itemId").value;
  const itemName = document.getElementById("itemName").value;
  const itemDescription = document.getElementById("itemDescription").value;
  const itemWeight = parseFloat(document.getElementById("itemWeight").value) || 0;
  const itemQuantity = parseInt(document.getElementById("itemQuantity").value) || 1;

  // Sender & Receiver objects
  const sender = {
    name: document.getElementById("senderName").value,
    address: document.getElementById("senderAddress").value,
    phone: document.getElementById("senderPhone").value,
    email: document.getElementById("senderEmail").value
  };

  const receiver = {
    name: document.getElementById("receiverName").value,
    address: document.getElementById("receiverAddress").value,
    phone: document.getElementById("receiverPhone").value,
    destinationOffice: document.getElementById("receiverOffice").value,
    email: document.getElementById("receiverEmail").value
  };

  const data = {
    sender,
    receiver,
    origin: document.getElementById("origin").value,
    destination: document.getElementById("destination").value,
    location: document.getElementById("currentLocation").value,
    expectedDelivery: document.getElementById("expectedDelivery").value,
    status: document.getElementById("status").value || "Pending",
    items
  };

  try {
    const res = await fetch(`${API_URL}/api/admin/tracking`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json();
      return alert("Error: " + (err.error || "Failed to create entry"));
    }

    const created = await res.json();
    alert(`✅ Tracking created: ${created.trackingNumber}`);
    document.getElementById("createForm").reset();
    loadTracking();
  } catch (err) {
    console.error("Create tracking error:", err);
  }
}

// ------------------ LOAD TRACKING ------------------
async function loadTracking() {
  const token = localStorage.getItem("adminToken");
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/admin/tracking`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (!res.ok) return console.error("Failed to load tracking entries");

    const entries = await res.json();
    const tbody = document.querySelector("#trackingTable tbody");
    tbody.innerHTML = "";

    entries.forEach(entry => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${entry.trackingNumber}</td>
        <td>${entry.sender?.name || "N/A"}</td>
        <td>${entry.receiver?.name || "N/A"}</td>
        <td>${entry.origin}</td>
        <td>${entry.destination}</td>
        <td>${entry.location || "Not set"}</td>
        <td>
          <select onchange="updateStatus('${entry.trackingNumber}', this.value)">
            <option value="Pending" ${entry.status === "Pending" ? "selected" : ""}>Pending</option>
            <option value="In Transit" ${entry.status === "In Transit" ? "selected" : ""}>In Transit</option>
            <option value="Out for Delivery" ${entry.status === "Out for Delivery" ? "selected" : ""}>Out for Delivery</option>
            <option value="Delivered" ${entry.status === "Delivered" ? "selected" : ""}>Delivered</option>
          </select>
        </td>
        <td>
          ${entry.expectedDelivery 
            ? new Date(entry.expectedDelivery).toLocaleDateString() 
            : "Not set"}<br>
          <button onclick="promptChangeDate('${entry.trackingNumber}', '${entry.expectedDelivery || ""}')">Change</button>
        </td>
        <td>${new Date(entry.createdAt).toLocaleString()}</td>
        <td>
          ${entry.items && entry.items.length > 0 
          ? entry.items.map(it => `<div><b>${it.name}</b> (x${it.quantity}) - $${(it.cost || 0).toFixed(2)}</div>`).join("") 
          : "No items"}
        </td>
        <td>
          <button onclick="deleteTracking('${entry._id}')">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error("Load tracking error:", err);
  }
}

// ------------------ UPDATE STATUS ------------------
async function updateStatus(trackingNumber, newStatus) {
  const token = localStorage.getItem("adminToken");
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/admin/tracking/number/${trackingNumber}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        status: newStatus,
        location: "Updated"
      })
    });

    if (!res.ok) {
      const err = await res.json();
      alert("Error updating status: " + (err.error || "Unknown error"));
    } else {
      console.log(`Status updated to ${newStatus} for ${trackingNumber}`);
      loadTracking();
    }
  } catch (err) {
    console.error("Update status error:", err);
  }
}

// ------------------ DELETE TRACKING ------------------
async function deleteTracking(id) {
  const token = localStorage.getItem("adminToken");
  if (!token) return;

  try {
    await fetch(`${API_URL}/api/admin/tracking/${id}`, { 
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });

    loadTracking();
  } catch (err) {
    console.error("Delete tracking error:", err);
  }
}

// Add a new item row
function addItem() {
  const fieldset = document.getElementById("itemsFieldset");
  const div = document.createElement("div");
  div.className = "itemRow";
  div.innerHTML = `
    <input type="text" name="itemId" placeholder="Unique Item ID" required>
    <input type="text" name="itemName" placeholder="Item Name (e.g. Laptop)" required>
    <input type="text" name="itemDescription" placeholder="Description">
    <input type="number" name="itemWeight" step="0.01" placeholder="Weight (kg)">
    <input type="number" name="itemQuantity" value="1" min="1">
    <input type="number" name="itemCost" step="0.01" placeholder="Cost ($)" required>
    <button type="button" onclick="removeItem(this)">Remove</button>
  `;
  fieldset.insertBefore(div, document.getElementById("addItemBtn"));
}


// Remove an item row
function removeItem(button) {
  const fieldset = document.getElementById("itemsFieldset");
  const rows = fieldset.querySelectorAll(".itemRow");

  if (rows.length === 1) {
    alert("At least one item is required.");
    return;
  }

  button.parentElement.remove();
}

// ------------------ CREATE TRACKING ------------------
async function createTracking(event) {
  event.preventDefault();
  const token = localStorage.getItem("adminToken");
  if (!token) return alert("You must be logged in!");

  // Collect items dynamically
// Collect items dynamically
const itemRows = document.querySelectorAll("#itemsFieldset .itemRow");
const items = Array.from(itemRows).map(row => {
  return {
    itemId: row.querySelector("input[name='itemId']").value,
    name: row.querySelector("input[name='itemName']").value,
    description: row.querySelector("input[name='itemDescription']").value,
    weight: parseFloat(row.querySelector("input[name='itemWeight']").value) || 0,
    quantity: parseInt(row.querySelector("input[name='itemQuantity']").value) || 1,
    cost: parseFloat(row.querySelector("input[name='itemCost']").value) || 0
  };
});

  const sender = {
    name: document.getElementById("senderName").value,
    address: document.getElementById("senderAddress").value,
    phone: document.getElementById("senderPhone").value,
    email: document.getElementById("senderEmail").value
  };

  const receiver = {
    name: document.getElementById("receiverName").value,
    address: document.getElementById("receiverAddress").value,
    phone: document.getElementById("receiverPhone").value,
    destinationOffice: document.getElementById("receiverOffice").value,
    email: document.getElementById("receiverEmail").value
  };

  const data = {
    sender,
    receiver,
    origin: document.getElementById("origin").value,
    destination: document.getElementById("destination").value,
    location: document.getElementById("currentLocation").value,
    expectedDelivery: document.getElementById("expectedDelivery").value,
    status: document.getElementById("status").value || "Pending",
    items // <-- send all items
  };

  try {
    const res = await fetch(`${API_URL}/api/admin/tracking`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json();
      return alert("Error: " + (err.error || "Failed to create entry"));
    }

    const created = await res.json();
    alert(`✅ Tracking created: ${created.trackingNumber}`);
    // Reset form and leave only one item row
    document.getElementById("createForm").reset();
    const extraRows = document.querySelectorAll("#itemsFieldset .itemRow:not(:first-child)");
    extraRows.forEach(r => r.remove());
    loadTracking();
  } catch (err) {
    console.error("Create tracking error:", err);
  }
}

// Add new item for link generation
function addLinkItem() {
  const fieldset = document.getElementById("linkItemsFieldset");
  const div = document.createElement("div");
  div.className = "linkItemRow";
  div.innerHTML = `
    <input type="text" name="linkItemName" placeholder="Item Name (e.g. Laptop)" required>
    <input type="text" name="linkItemDesc" placeholder="Description">
    <input type="number" name="linkItemWeight" placeholder="Weight (kg)">
    <input type="number" name="linkItemQuantity" placeholder="Quantity" value="1" min="1">
    <input type="number" name="linkItemCost" placeholder="Cost ($)" required>
    <button type="button" onclick="removeLinkItem(this)">Remove</button>
  `;
  fieldset.insertBefore(div, document.getElementById("addLinkItemBtn"));
}

function removeLinkItem(button) {
  const fieldset = document.getElementById("linkItemsFieldset");
  const rows = fieldset.querySelectorAll(".linkItemRow");
  if (rows.length === 1) return alert("At least one item required.");
  button.parentElement.remove();
}

// ---------------- CREATE SHIPMENT LINK ----------------
async function createShipmentLink(event) {
  event.preventDefault();
  const token = localStorage.getItem("adminToken");
  if (!token) return alert("You must be logged in!");

  const sender = {
    name: document.getElementById("linkSenderName").value,
    email: document.getElementById("linkSenderEmail").value,
    phone: document.getElementById("linkSenderPhone").value,
    address: document.getElementById("linkSenderAddress").value
  };

  const origin = document.getElementById("linkOrigin").value;
  const destination = document.getElementById("linkDestination").value;

  // Collect all item rows
  const itemRows = document.querySelectorAll("#linkItemsFieldset .linkItemRow");
  const items = Array.from(itemRows).map(row => ({
    name: row.querySelector("input[name='linkItemName']").value,
    description: row.querySelector("input[name='linkItemDesc']").value,
    weight: parseFloat(row.querySelector("input[name='linkItemWeight']").value) || 0,
    quantity: parseInt(row.querySelector("input[name='linkItemQuantity']").value) || 1,
    cost: parseFloat(row.querySelector("input[name='linkItemCost']").value) || 0
  }));

  try {
    const res = await fetch(`${API_URL}/api/admin/shipment-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ sender, items, origin, destination })
    });

    const data = await res.json();
    if (!res.ok) return alert(data.error || "Error creating link");

    const link = `${window.location.origin}/fill-receiver.html?id=${data.tempId}`;
    document.getElementById("generatedLinkBox").classList.remove("hidden");
    document.getElementById("generatedLink").value = link;

  } catch (err) {
    console.error("Error creating shipment link:", err);
    alert("Server error while creating link.");
  }
}

function copyGeneratedLink() {
  const linkInput = document.getElementById("generatedLink");
  linkInput.select();
  document.execCommand("copy");
  alert("Link copied to clipboard!");
}

async function approveShipment(id) {
  const token = localStorage.getItem("adminToken");
  if (!token) return;

  if (!confirm("Approve this shipment and create a tracking number?")) return;

  try {
    const res = await fetch(`${API_URL}/api/admin/approve-shipment/${id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!res.ok) return alert(data.error || "Approval failed");

    alert(`✅ Shipment approved. Tracking Number: ${data.trackingNumber}`);
    loadTracking();
    loadPendingShipments();
  } catch (err) {
    console.error("Approve shipment error:", err);
  }
}

async function rejectShipment(id) {
  const token = localStorage.getItem("adminToken");
  if (!token) return;

  if (!confirm("Reject this shipment?")) return;

  try {
    await fetch(`${API_URL}/api/admin/reject-shipment/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    loadPendingShipments();
  } catch (err) {
    console.error("Reject shipment error:", err);
  }
}

// ------------------ CALENDAR DATE PICKER MODAL ------------------
function promptChangeDate(trackingNumber, currentDate) {
  // Create overlay
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.background = "rgba(0,0,0,0.6)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = 9999;

  // Create modal container
  const modal = document.createElement("div");
  modal.style.background = "#fff";
  modal.style.padding = "20px";
  modal.style.borderRadius = "10px";
  modal.style.textAlign = "center";
  modal.style.width = "300px";
  modal.innerHTML = `
    <h3>Change Expected Delivery</h3>
    <p>Tracking: <b>${trackingNumber}</b></p>
    <input type="date" id="newDateInput" value="${currentDate ? currentDate.split('T')[0] : ''}" style="padding:10px;width:100%;border:1px solid #ccc;border-radius:5px;">
    <div style="margin-top:15px;">
      <button id="saveDateBtn" style="background:#007bff;color:white;padding:8px 15px;border:none;border-radius:5px;">Save</button>
      <button id="cancelDateBtn" style="background:#ccc;color:black;padding:8px 15px;border:none;border-radius:5px;">Cancel</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Button handlers
  modal.querySelector("#cancelDateBtn").onclick = () => overlay.remove();

  modal.querySelector("#saveDateBtn").onclick = async () => {
    const newDate = document.getElementById("newDateInput").value;
    if (!newDate) return alert("Please select a date.");

    const token = localStorage.getItem("adminToken");
    if (!token) return alert("You must be logged in as admin.");

    try {
      const res = await fetch(`${API_URL}/api/admin/tracking/delivery/${trackingNumber}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ expectedDelivery: newDate })
      });

      const data = await res.json();
      if (res.ok) {
        alert("✅ Expected delivery date updated successfully!");
        overlay.remove();
        loadTracking();
      } else {
        alert(data.error || "Failed to update date");
      }
    } catch (err) {
      console.error("Change date error:", err);
      alert("Server error updating delivery date");
    }
  };
}
