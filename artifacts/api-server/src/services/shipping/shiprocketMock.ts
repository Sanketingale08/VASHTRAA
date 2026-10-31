export interface MockPickupLocation {
  id: number;
  pickup_location: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  address_2?: string;
  city: string;
  state: string;
  country: string;
  pin_code: string;
}

export interface MockCourierRate {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  etd: string;
  estimated_delivery_days: number;
  rating: number;
  cod: number;
}

// In-memory mock database
const mockPickupLocations = new Map<string, MockPickupLocation>();
const mockShipments = new Map<string, any>();
let nextPickupId = 50001;
let nextOrderId = 90001;
let nextShipmentId = 80001;

export const shiprocketMock = {
  reset() {
    mockPickupLocations.clear();
    mockShipments.clear();
    nextPickupId = 50001;
    nextOrderId = 90001;
    nextShipmentId = 80001;
  },

  getAllPickupLocations(): MockPickupLocation[] {
    return Array.from(mockPickupLocations.values());
  },

  addPickupLocation(data: {
    pickup_location: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    address_2?: string;
    city: string;
    state: string;
    country?: string;
    pin_code: string;
  }): { success: boolean; pickup_id?: number; message?: string } {
    if (!data.pickup_location || !data.pickup_location.trim()) {
      return { success: false, message: "pickup_location nickname is required" };
    }
    if (!data.pin_code || !/^\d{6}$/.test(String(data.pin_code).trim())) {
      return { success: false, message: "Valid 6-digit Indian PIN code is required" };
    }
    if (!data.address || data.address.trim().length < 5) {
      return { success: false, message: "Address must be at least 5 characters long" };
    }
    if (!data.phone || !/^[6-9]\d{9}$/.test(String(data.phone).replace(/\D/g, "").slice(-10))) {
      return { success: false, message: "Valid 10-digit phone number is required" };
    }

    const cleanNickname = data.pickup_location.trim().toUpperCase();
    const existing = mockPickupLocations.get(cleanNickname);
    if (existing) {
      // Shiprocket returns existing pickup location if already present
      return { success: true, pickup_id: existing.id, message: "Pickup location already exists" };
    }

    const id = nextPickupId++;
    const record: MockPickupLocation = {
      id,
      pickup_location: cleanNickname,
      name: data.name.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      address: data.address.trim(),
      address_2: data.address_2?.trim(),
      city: data.city.trim(),
      state: data.state.trim(),
      country: data.country?.trim() || "India",
      pin_code: data.pin_code.trim(),
    };

    mockPickupLocations.set(cleanNickname, record);
    return { success: true, pickup_id: id };
  },

  checkServiceability(params: {
    pickup_postcode: string;
    delivery_postcode: string;
    weight?: string | number;
    cod?: number;
  }): {
    status: number;
    data: {
      available_courier_companies: MockCourierRate[];
      recommended_courier_company_id: number;
    };
  } {
    const pickupPin = parseInt(params.pickup_postcode, 10);
    const delivPin = parseInt(params.delivery_postcode, 10);
    const weightKg = parseFloat(String(params.weight || 0.5));
    const isCod = params.cod === 1;

    // Check pincode serviceability: unserviceable ranges (e.g. Andaman or remote border test ranges)
    if (delivPin >= 744101 && delivPin <= 744304) {
      return {
        status: 200,
        data: {
          available_courier_companies: [],
          recommended_courier_company_id: 0,
        },
      };
    }

    const baseRate = Math.round(55 + weightKg * 40);
    const codCharge = isCod ? 40 : 0;

    const couriers: MockCourierRate[] = [
      {
        courier_company_id: 1,
        courier_name: "BlueDart Air Express",
        rate: baseRate + 45 + codCharge,
        etd: "2-3 Days",
        estimated_delivery_days: 3,
        rating: 4.8,
        cod: 1,
      },
      {
        courier_company_id: 2,
        courier_name: "Delhivery Surface",
        rate: baseRate + codCharge,
        etd: "3-5 Days",
        estimated_delivery_days: 4,
        rating: 4.6,
        cod: 1,
      },
      {
        courier_company_id: 3,
        courier_name: "Shadowfax Local & Regional",
        rate: baseRate - 10 + codCharge,
        etd: "4-6 Days",
        estimated_delivery_days: 5,
        rating: 4.3,
        cod: 1,
      },
      {
        courier_company_id: 4,
        courier_name: "DTDC Standard",
        rate: baseRate + 15 + codCharge,
        etd: "3-5 Days",
        estimated_delivery_days: 4,
        rating: 4.4,
        cod: 1,
      },
    ];

    return {
      status: 200,
      data: {
        available_courier_companies: couriers,
        recommended_courier_company_id: 2,
      },
    };
  },

  createAdhocOrder(orderData: any): {
    order_id: number;
    shipment_id: number;
    status: string;
    status_code: number;
  } {
    const orderId = nextOrderId++;
    const shipmentId = nextShipmentId++;

    mockShipments.set(String(shipmentId), {
      orderId,
      shipmentId,
      orderData,
      status: "created",
      createdAt: new Date().toISOString(),
    });

    return {
      order_id: orderId,
      shipment_id: shipmentId,
      status: "NEW",
      status_code: 1,
    };
  },

  assignAwb(shipmentId: string | number, courierId?: number): {
    awb_assign_status: number;
    response: {
      data: {
        awb_code: string;
        courier_company_id: number;
        courier_name: string;
        shipment_id: number;
      };
    };
  } {
    const courierMap: Record<number, string> = {
      1: "BlueDart Air Express",
      2: "Delhivery Surface",
      3: "Shadowfax Local & Regional",
      4: "DTDC Standard",
    };
    const cId = courierId || 2;
    const cName = courierMap[cId] || "Delhivery Surface";
    const awb = `SR-${cName.slice(0, 3).toUpperCase()}-${Math.floor(10000000 + Math.random() * 90000000)}`;

    const shipment = mockShipments.get(String(shipmentId));
    if (shipment) {
      shipment.awb = awb;
      shipment.courier = cName;
      shipment.status = "awb_assigned";
    }

    return {
      awb_assign_status: 1,
      response: {
        data: {
          awb_code: awb,
          courier_company_id: cId,
          courier_name: cName,
          shipment_id: Number(shipmentId),
        },
      },
    };
  },

  generateLabel(shipmentId: string | number): {
    label_created: number;
    label_url: string;
  } {
    return {
      label_created: 1,
      label_url: `https://shiprocket.co/assets/labels/sample_label_${shipmentId}.pdf`,
    };
  },

  schedulePickup(shipmentId: string | number, pickupDate?: string): {
    pickup_status: number;
    response: {
      pickup_token_number: string;
      pickup_scheduled_date: string;
    };
  } {
    const token = `PKP-${Math.floor(100000 + Math.random() * 900000)}`;
    const date = pickupDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const shipment = mockShipments.get(String(shipmentId));
    if (shipment) {
      shipment.pickupToken = token;
      shipment.pickupDate = date;
      shipment.status = "pickup_scheduled";
    }

    return {
      pickup_status: 1,
      response: {
        pickup_token_number: token,
        pickup_scheduled_date: date,
      },
    };
  },
};
