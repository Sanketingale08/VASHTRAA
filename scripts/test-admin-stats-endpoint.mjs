import http from "http";

function testAdminStatsApi() {
  const options = {
    hostname: "localhost",
    port: 3001,
    path: "/api/admin/stats",
    method: "GET",
    headers: {
      "x-admin-key": "Admin@123",
      "Content-Type": "application/json",
    },
  };

  const req = http.request(options, (res) => {
    let data = "";
    console.log(`Status Code: ${res.statusCode}`);
    console.log("Headers:", res.headers);

    res.on("data", (chunk) => {
      data += chunk;
    });

    res.on("end", () => {
      console.log("Response Body:", data);
      try {
        const json = JSON.parse(data);
        console.log("Parsed JSON:", json);
      } catch (e) {
        console.error("Failed to parse JSON:", e.message);
      }
    });
  });

  req.on("error", (err) => {
    console.error("Request Error:", err.message);
  });

  req.end();
}

testAdminStatsApi();
